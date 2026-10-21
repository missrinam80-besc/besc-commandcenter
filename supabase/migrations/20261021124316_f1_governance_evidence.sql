begin;
alter table public.compliance_deadlines alter column due_date drop not null;
alter table public.compliance_deadlines add column deadline_basis_status text not null default 'provided' check(deadline_basis_status in('unknown','provided','verified'));
alter table public.compliance_deadlines add column unknown_deadline_reason text;
alter table public.compliance_deadlines add column f1_revision bigint not null default 1;
alter table public.meetings add column f1_revision bigint not null default 1;
alter table public.document_registry add column restricted_governance boolean not null default false;
create function private.f1_revision_guard() returns trigger language plpgsql security invoker set search_path='' as $$begin
 if tg_op='INSERT' then new.f1_revision:=1;else if new.organization_id<>old.organization_id then raise exception 'f1_organization_immutable' using errcode='42501';end if;new.f1_revision:=old.f1_revision+1;end if;
 if tg_table_name='compliance_deadlines' then
  if new.due_date is null then new.deadline_basis_status:='unknown';if length(btrim(coalesce(new.unknown_deadline_reason,'')))<2 then raise exception 'f1_unknown_deadline_reason_required';end if;
  elsif new.deadline_basis_status='unknown' then new.deadline_basis_status:='provided';end if;
  if new.deadline_basis_status='verified' and (tg_op='INSERT' or new.deadline_basis_status is distinct from old.deadline_basis_status or new.due_date is distinct from old.due_date) then raise exception 'f1_deadline_requires_review';end if;
 end if;return new;
end$$;
revoke all on function private.f1_revision_guard() from public,anon;
create trigger f1_deadline_revision before insert or update on public.compliance_deadlines for each row execute function private.f1_revision_guard();
create trigger f1_meeting_revision before insert or update on public.meetings for each row execute function private.f1_revision_guard();

create table public.governance_evidence_versions(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),document_id uuid not null references public.document_registry(id) on delete restrict,
 source_version text not null check(length(btrim(source_version)) between 2 and 500),preserved_reference text not null check(preserved_reference ~ '^https://[^[:space:]]+$' and length(preserved_reference)<=2000),
 evidence_type text not null check(evidence_type in('official_rule','execution','appointment','meeting_decision','other')),
 content_sha256 text check(content_sha256 ~ '^[0-9a-f]{64}$'),
 status text not null default 'submitted' check(status in('submitted','available','withdrawn')),
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default clock_timestamp(),checked_by uuid references public.profiles(id),checked_at timestamptz,check_note text,revoked_at timestamptz,revocation_reason text,
 unique(organization_id,id)
);
create index f1_evidence_document on public.governance_evidence_versions(document_id);
create index f1_evidence_creator on public.governance_evidence_versions(created_by);
create index f1_evidence_checker on public.governance_evidence_versions(checked_by);
create table public.governance_reviews(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),source_type text not null check(source_type in('deadline','meeting')),source_id uuid not null,source_revision bigint not null,
 dimension text not null check(dimension in('rule','applicability','execution')),
 outcome text not null check(outcome in('verified','applicable','not_applicable','uncertain','demonstrated')),
 evidence_id uuid references public.governance_evidence_versions(id) on delete restrict,
 reason text not null check(length(btrim(reason)) between 2 and 4000),conflict_declared boolean not null default false,
 source_snapshot jsonb not null,reviewed_by uuid not null references public.profiles(id),reviewed_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),check((dimension='rule' and outcome in('verified','uncertain')) or(dimension='applicability' and outcome in('applicable','not_applicable','uncertain')) or(dimension='execution' and outcome in('demonstrated','uncertain')))
);
create index f1_reviews_source on public.governance_reviews(organization_id,source_type,source_id,source_revision,reviewed_at desc);
create index f1_reviews_evidence on public.governance_reviews(evidence_id);
create index f1_reviews_actor on public.governance_reviews(reviewed_by);
create table public.governance_decisions(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),source_type text not null check(source_type in('deadline','meeting')),source_id uuid not null,source_revision bigint not null,
 decision_type text not null check(decision_type in('execution_decision','meeting_decision','not_applicable')),
 rule_review_id uuid not null references public.governance_reviews(id) on delete restrict,applicability_review_id uuid not null references public.governance_reviews(id) on delete restrict,execution_review_id uuid references public.governance_reviews(id) on delete restrict,
 body text not null check(length(btrim(body)) between 2 and 10000),authority_basis text not null check(length(btrim(authority_basis)) between 2 and 2000),source_snapshot jsonb not null,
 governing_body text not null check(length(btrim(governing_body)) between 2 and 200),task_id uuid references public.tasks(id) on delete restrict,
 decided_by uuid not null references public.profiles(id),decided_at timestamptz not null default clock_timestamp(),unique(organization_id,id)
);
create index f1_decisions_source on public.governance_decisions(organization_id,source_type,source_id,source_revision,decided_at desc);
create index f1_decisions_rule on public.governance_decisions(rule_review_id);
create index f1_decisions_applicable on public.governance_decisions(applicability_review_id);
create index f1_decisions_execution on public.governance_decisions(execution_review_id);
create index f1_decisions_task on public.governance_decisions(task_id);
create index f1_decisions_actor on public.governance_decisions(decided_by);

create function private.f1_source_revision(o uuid,t text,i uuid) returns bigint language plpgsql stable security definer set search_path='' as $$declare r bigint;begin
 if t='deadline' then select f1_revision into r from public.compliance_deadlines where organization_id=o and id=i and deleted_at is null;
 elsif t='meeting' then select f1_revision into r from public.meetings where organization_id=o and id=i and deleted_at is null;else raise exception 'f1_invalid_source';end if;
 if r is null then raise exception 'f1_source_unavailable' using errcode='42501';end if;return r;
end$$;
create function private.f1_source_snapshot(o uuid,t text,i uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare s jsonb;begin
 if t='deadline' then select jsonb_build_object('title',title,'category',category,'due_date',due_date,'recurrence',recurrence,'deadline_basis_status',deadline_basis_status,'unknown_deadline_reason',unknown_deadline_reason) into s from public.compliance_deadlines where id=i and organization_id=o;
 elsif t='meeting' then select jsonb_build_object('title',title,'meeting_type',meeting_type,'meeting_at',meeting_at,'decisions',decisions) into s from public.meetings where id=i and organization_id=o;end if;return s;
end$$;
create function private.f1_preserve_source() returns trigger language plpgsql security definer set search_path='' as $$begin
 if exists(select 1 from public.governance_reviews where organization_id=old.organization_id and source_id=old.id and source_type=case when tg_table_name='meetings' then 'meeting' else 'deadline' end) then raise exception 'f1_source_has_review_history';end if;return old;
end$$;
revoke all on function private.f1_source_snapshot(uuid,text,uuid),private.f1_preserve_source() from public,anon,authenticated,service_role;
create trigger f1_preserve_meeting before delete on public.meetings for each row execute function private.f1_preserve_source();
create trigger f1_preserve_deadline before delete on public.compliance_deadlines for each row execute function private.f1_preserve_source();
create function private.f1_document_visible(o uuid,i uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.document_registry d where d.organization_id=o and d.id=i and (not d.restricted_finance or private.can_manage_finance(o)) and (not d.restricted_governance or private.f1_role(o,'governance_editor')))$$;
create function private.f1_source_visible(o uuid,t text,i uuid) returns boolean language sql stable security definer set search_path='' as $$select not exists(select 1 from public.document_registry_sources s join public.document_registry d on d.id=s.document_id and d.organization_id=s.organization_id where s.organization_id=o and s.table_name=t and s.record_id=i and d.restricted_governance and not private.f1_role(o,'governance_editor'))$$;
create function private.f1_document_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_op='DELETE' then if old.restricted_governance then raise exception 'f1_document_preserve_history';end if;return old;end if;
 if tg_op='INSERT' then if new.restricted_governance and not private.f1_writing(new.organization_id) then raise exception 'f1_document_operation_required' using errcode='42501';end if;
 elsif new.restricted_governance is distinct from old.restricted_governance then if old.restricted_governance or not private.f1_writing(new.organization_id) then raise exception 'f1_document_classification_protected' using errcode='42501';end if;end if;return new;
end$$;
revoke all on function private.f1_source_revision(uuid,text,uuid),private.f1_document_visible(uuid,uuid),private.f1_source_visible(uuid,text,uuid),private.f1_document_guard() from public,anon,authenticated,service_role;
grant execute on function private.f1_document_visible(uuid,uuid),private.f1_source_visible(uuid,text,uuid) to authenticated;
create trigger f1_document_classification before insert or update or delete on public.document_registry for each row execute function private.f1_document_guard();
create policy f1_document_restriction on public.document_registry as restrictive for select to authenticated using(private.f1_document_visible(organization_id,id));
do $$declare t text;begin
 foreach t in array array['record_links','google_resource_links','asset_document_links'] loop execute format('create policy f1_attachment_visibility on public.%I as restrictive for select to authenticated using(document_id is null or private.f1_document_visible(organization_id,document_id))',t);end loop;
 foreach t in array array['projects','events','campaigns','community_people','knowledge_articles','content_items','merch_launches','partners','meetings','administrative_documents','assets','expenses','income_entries'] loop execute format('create policy f1_source_visibility on public.%I as restrictive for select to authenticated using(private.f1_source_visible(organization_id,%L,id))',t,t);end loop;
end$$;

create or replace function private.register_link_document() returns trigger language plpgsql security definer set search_path='' as $$
declare doc public.document_registry; link_url text; link_label text; supplied_id uuid; old_url text;
begin
 if auth.uid() is null then
  if session_user not in ('postgres','supabase_admin') then raise exception 'document_no_access' using errcode='42501'; end if;
 elsif not private.is_active_member(new.organization_id) then raise exception 'document_no_access' using errcode='42501'; end if;
 if tg_table_name='google_resource_links' then
  if new.resource_type<>'document' then new.document_id:=null;return new;end if;
  link_url:=new.web_url;link_label:=new.name;
  if tg_op='UPDATE' then old_url:=old.web_url;end if;
 else
  link_url:=new.url;link_label:=new.label;
  if tg_op='UPDATE' then old_url:=old.url;end if;
 end if;
 supplied_id:=new.document_id;
 if supplied_id is not null and (tg_op='INSERT' or supplied_id is distinct from old.document_id or link_url is not distinct from old_url) then
  select * into doc from public.document_registry where id=supplied_id and organization_id=new.organization_id and (not restricted_finance or private.can_manage_finance(new.organization_id)) and (auth.uid() is null or private.f1_document_visible(new.organization_id,id));
  if not found then raise exception 'document_unavailable' using errcode='42501';end if;
  link_url:=doc.url;
  if nullif(btrim(link_label),'') is null then link_label:=doc.label;end if;
 else
  if link_url !~ '^https?://[^[:space:]]+$' or char_length(link_url)>2000 or nullif(btrim(link_label),'') is null then
   raise exception 'invalid_document_link' using errcode='23514';
  end if;
  insert into public.document_registry(organization_id,label,url,created_by)
   values(new.organization_id,left(link_label,120),link_url,coalesce(auth.uid(),new.created_by))
   on conflict(organization_id,canonical_url) do update set label=document_registry.label
   returning * into doc;
 end if;
 if auth.uid() is not null and not private.f1_document_visible(new.organization_id,doc.id) then raise exception 'document_unavailable' using errcode='42501';end if;
 new.document_id:=doc.id;
 if tg_table_name='google_resource_links' then new.web_url:=link_url;new.name:=link_label;
 else new.url:=link_url;new.label:=link_label;end if;
 return new;
end $$;
revoke all on function private.register_link_document() from public,anon,authenticated;

create policy f1_registry_source_restriction on public.document_registry_sources as restrictive for select to authenticated using(private.f1_document_visible(organization_id,document_id));
create policy f1_relationship_source_restriction on public.record_relationships as restrictive for select to authenticated using(private.f1_source_visible(organization_id,case source_type when 'project' then 'projects' when 'event' then 'events' when 'campaign' then 'campaigns' when 'partner' then 'partners' when 'meeting' then 'meetings' when 'content' then 'content_items' else source_type end,source_id) and private.f1_source_visible(organization_id,case target_type when 'project' then 'projects' when 'event' then 'events' when 'campaign' then 'campaigns' when 'partner' then 'partners' when 'meeting' then 'meetings' when 'content' then 'content_items' else target_type end,target_id));
create function private.f1_governance(o uuid,op text,d jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare answer uuid;rev bigint;er public.governance_evidence_versions;rr public.governance_reviews;ar public.governance_reviews;xr public.governance_reviews;begin
 if not private.f1_role(o,'governance_editor') then raise exception 'f1_governance_access_required' using errcode='42501';end if;
 if op='governance.evidence' then
  if not private.f1_document_visible(o,(d->>'document_id')::uuid) then raise exception 'f1_document_unavailable' using errcode='42501';end if;
  update public.document_registry set restricted_governance=true where organization_id=o and id=(d->>'document_id')::uuid;
  insert into public.governance_evidence_versions(organization_id,document_id,source_version,preserved_reference,evidence_type,content_sha256,created_by) values(o,(d->>'document_id')::uuid,d->>'source_version',d->>'preserved_reference',d->>'evidence_type',nullif(d->>'content_sha256',''),auth.uid()) returning id into answer;
 elsif op in('governance.evidence_check','governance.evidence_withdraw') then
  if not private.f1_chair(o) then raise exception 'f1_chair_required' using errcode='42501';end if;
  if length(btrim(coalesce(d->>'reason','')))<2 then raise exception 'f1_reason_required';end if;
  if op='governance.evidence_check' then update public.governance_evidence_versions set status='available',checked_by=auth.uid(),checked_at=clock_timestamp(),check_note=d->>'reason' where organization_id=o and id=(d->>'id')::uuid and status='submitted' returning id into answer;
  else update public.governance_evidence_versions set status='withdrawn',revoked_at=clock_timestamp(),revocation_reason=d->>'reason' where organization_id=o and id=(d->>'id')::uuid and revoked_at is null returning id into answer;end if;
 elsif op in('governance.review','governance.decide') then
  if not private.f1_chair(o) then raise exception 'f1_chair_required' using errcode='42501';end if;
  if coalesce((d->>'conflict_declared')::boolean,false) then raise exception 'f1_conflict_requires_board_decision' using errcode='42501';end if;
  rev:=private.f1_source_revision(o,d->>'source_type',(d->>'source_id')::uuid);
  if rev is distinct from (d->>'expected_revision')::bigint then raise exception 'f1_revision_conflict' using errcode='40001';end if;
  if op='governance.review' then
   if nullif(d->>'evidence_id','') is not null then select * into er from public.governance_evidence_versions where organization_id=o and id=(d->>'evidence_id')::uuid and status='available' and revoked_at is null;
    if not found or not private.f1_document_visible(o,er.document_id) then raise exception 'f1_evidence_unavailable';end if;
   end if;
   if d->>'outcome' in('verified','demonstrated') and er.id is null then raise exception 'f1_evidence_required';end if;
   if d->>'dimension'='rule' and d->>'outcome'='verified' and er.evidence_type<>'official_rule' then raise exception 'f1_official_rule_required';end if;
   insert into public.governance_reviews(organization_id,source_type,source_id,source_revision,dimension,outcome,evidence_id,reason,source_snapshot,reviewed_by) values(o,d->>'source_type',(d->>'source_id')::uuid,rev,d->>'dimension',d->>'outcome',er.id,d->>'reason',private.f1_source_snapshot(o,d->>'source_type',(d->>'source_id')::uuid),auth.uid()) returning id into answer;
  else
   select * into rr from public.governance_reviews where organization_id=o and id=(d->>'rule_review_id')::uuid;
   select * into ar from public.governance_reviews where organization_id=o and id=(d->>'applicability_review_id')::uuid;
   select * into xr from public.governance_reviews where organization_id=o and id=nullif(d->>'execution_review_id','')::uuid;
   if rr.id is null or ar.id is null or rr.dimension<>'rule' or rr.outcome<>'verified' or ar.dimension<>'applicability' or ar.outcome not in('applicable','not_applicable') then raise exception 'f1_reviews_required';end if;
   if ar.outcome='applicable' and(xr.id is null or xr.dimension<>'execution' or xr.outcome<>'demonstrated') then raise exception 'f1_execution_required';end if;
   if exists(select 1 from (values(rr.source_type,rr.source_id,rr.source_revision),(ar.source_type,ar.source_id,ar.source_revision),(coalesce(xr.source_type,rr.source_type),coalesce(xr.source_id,rr.source_id),coalesce(xr.source_revision,rr.source_revision))) v(t,i,r) where t<>d->>'source_type' or i<>(d->>'source_id')::uuid or r<>rev) then raise exception 'f1_review_revision_conflict';end if;
   if exists(select 1 from (values(rr.evidence_id),(ar.evidence_id),(xr.evidence_id)) v(i) where i is not null and not exists(select 1 from public.governance_evidence_versions e where e.id=v.i and e.organization_id=o and e.status='available' and e.revoked_at is null and private.f1_document_visible(o,e.document_id))) then raise exception 'f1_evidence_unavailable';end if;
   if nullif(d->>'task_id','') is not null and not exists(select 1 from public.tasks where organization_id=o and id=(d->>'task_id')::uuid and deleted_at is null) then raise exception 'f1_task_unavailable';end if;
   insert into public.governance_decisions(organization_id,source_type,source_id,source_revision,decision_type,rule_review_id,applicability_review_id,execution_review_id,body,authority_basis,source_snapshot,governing_body,task_id,decided_by) values(o,d->>'source_type',(d->>'source_id')::uuid,rev,case when ar.outcome='not_applicable' then 'not_applicable' when d->>'source_type'='meeting' then 'meeting_decision' else 'execution_decision' end,rr.id,ar.id,xr.id,d->>'body',d->>'authority_basis',private.f1_source_snapshot(o,d->>'source_type',(d->>'source_id')::uuid),d->>'governing_body',nullif(d->>'task_id','')::uuid,auth.uid()) returning id into answer;
  end if;
 else raise exception 'f1_unknown_operation';end if;
 if answer is null then raise exception 'f1_not_available';end if;return jsonb_build_object('id',answer);
end$$;
revoke all on function private.f1_governance(uuid,text,jsonb) from public,anon,authenticated,service_role;

-- Dynamic validity leaves immutable past decisions intact.
create function public.f1_governance_state(p_organization_id uuid,p_source_type text,p_source_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare rev bigint;x public.governance_decisions;st text;begin
 if not private.f1_role(p_organization_id,'governance_editor') then raise exception 'f1_not_authorized' using errcode='42501';end if;
 rev:=private.f1_source_revision(p_organization_id,p_source_type,p_source_id);
 select * into x from public.governance_decisions where organization_id=p_organization_id and source_type=p_source_type and source_id=p_source_id order by decided_at desc,id desc limit 1;
 st:='not_demonstrated';if x.id is not null then st:=case when x.decision_type='not_applicable' then 'not_applicable' else 'demonstrated' end;
  if x.source_revision<>rev or exists(select 1 from public.governance_reviews r join public.governance_evidence_versions e on e.id=r.evidence_id where r.id in(x.rule_review_id,x.applicability_review_id,x.execution_review_id) and(e.status<>'available' or e.revoked_at is not null or not private.f1_document_visible(p_organization_id,e.document_id))) then st:='reassessment_required';end if;
 end if;return jsonb_build_object('revision',rev,'execution_status',st,'decision_id',x.id);
end$$;
revoke all on function public.f1_governance_state(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.f1_governance_state(uuid,text,uuid) to authenticated;
do $$declare t text;begin foreach t in array array['governance_evidence_versions','governance_reviews','governance_decisions'] loop
 execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);execute format('grant select on public.%I to authenticated',t);execute format('create policy f1_governance_read on public.%I for select to authenticated using(private.f1_role(organization_id,''governance_editor''))',t);
end loop;end$$;
create policy f1_deadline_editor_read on public.compliance_deadlines for select to authenticated using(private.f1_role(organization_id,'governance_editor'));
create policy f1_meeting_editor_read on public.meetings for select to authenticated using(private.f1_role(organization_id,'governance_editor'));
create policy f1_chair_members_read on public.association_members for select to authenticated using(private.f1_chair(organization_id));
create policy f1_chair_mandates_read on public.governance_mandates for select to authenticated using(private.f1_chair(organization_id));
commit;
