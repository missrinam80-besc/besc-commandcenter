begin;
-- Vacancy dossiers and reviewed publications; applications reuse the private intake.
create table private.vacancy_settings(site_id uuid primary key,organization_id uuid not null,enabled boolean not null default false,foreign key(organization_id,site_id) references public.publication_sites(organization_id,id));
create table private.vacancy_dossiers(id uuid primary key default gen_random_uuid(),organization_id uuid not null,site_id uuid not null,form_id uuid not null unique,closed_at timestamptz,created_by uuid not null references public.profiles(id),created_at timestamptz not null default clock_timestamp(),foreign key(organization_id,site_id) references public.publication_sites(organization_id,id),foreign key(organization_id,form_id) references private.intake_forms(organization_id,id),unique(organization_id,id));
create table private.vacancy_revisions(id uuid primary key default gen_random_uuid(),organization_id uuid not null,dossier_id uuid not null,revision integer not null check(revision>0),payload jsonb not null,payload_sha256 text not null,proof_document_id uuid not null references public.document_registry(id),evidence_hash text not null,status text not null default 'draft' check(status in('draft','submitted','changes_requested','approved','withdrawn')),created_by uuid not null references public.profiles(id),created_at timestamptz not null default clock_timestamp(),reviewed_by uuid references public.profiles(id),reviewed_at timestamptz,review_note text,foreign key(organization_id,dossier_id) references private.vacancy_dossiers(organization_id,id),unique(dossier_id,revision),unique(organization_id,id));
create table private.vacancy_entries(public_id uuid primary key default gen_random_uuid(),organization_id uuid not null,site_id uuid not null,dossier_id uuid not null,selected_revision_id uuid not null,locale text not null check(locale in('nl-BE','fr-BE','en')),slug text not null check(length(slug)<=160 and slug~'^[a-z0-9]+(-[a-z0-9]+)*$'),epoch bigint not null default 1 check(epoch>0),published_at timestamptz not null,valid_until timestamptz,withdrawn_at timestamptz,foreign key(organization_id,site_id) references public.publication_sites(organization_id,id),foreign key(organization_id,dossier_id) references private.vacancy_dossiers(organization_id,id),foreign key(organization_id,selected_revision_id) references private.vacancy_revisions(organization_id,id),unique(site_id,dossier_id,locale),unique(site_id,locale,slug),check(valid_until is null or valid_until>published_at));
do $$declare t text;begin foreach t in array array['vacancy_settings','vacancy_dossiers','vacancy_revisions','vacancy_entries'] loop execute format('alter table private.%I enable row level security',t);execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);end loop;end$$;
alter table private.intake_forms drop constraint intake_forms_category_check;
alter table private.intake_forms add constraint intake_forms_category_check check(category in('partnership','volunteer_application'));
alter table private.platform_applications add column category text not null default 'partnership' check(category in('partnership','volunteer_application')),add column vacancy_public_id uuid references private.vacancy_entries(public_id),add column vacancy_revision_id uuid,add column vacancy_snapshot jsonb;
alter table private.platform_applications add foreign key(organization_id,vacancy_revision_id) references private.vacancy_revisions(organization_id,id);
alter table private.platform_applications add constraint f4_application_vacancy_shape check((category='partnership' and vacancy_public_id is null and vacancy_revision_id is null and vacancy_snapshot is null)or(category='volunteer_application' and vacancy_public_id is not null and vacancy_revision_id is not null and vacancy_snapshot is not null));
create function private.f4_vacancy_payload(p jsonb) returns boolean language plpgsql immutable set search_path='' as $$declare k text;begin
 if p is null or jsonb_typeof(p)<>'object' or pg_column_size(p)>20000 or not(p?&array['slug','locale','title','role_label','summary','body','location_label','availability_label','closes_at']) or exists(select 1 from jsonb_object_keys(p) x where x not in('slug','locale','title','role_label','summary','body','location_label','availability_label','closes_at')) then return false;end if;
 foreach k in array array['slug','locale','title','role_label','summary','location_label','availability_label','closes_at'] loop if jsonb_typeof(p->k) is distinct from 'string' then return false;end if;end loop;
 if length(p->>'slug') not between 1 and 160 or p->>'slug'!~'^[a-z0-9]+(-[a-z0-9]+)*$' or p->>'locale' not in('nl-BE','fr-BE','en') or length(btrim(p->>'title')) not between 2 and 240 or length(btrim(p->>'role_label')) not between 2 and 120 or length(btrim(p->>'summary')) not between 1 and 2000 or length(btrim(p->>'location_label')) not between 1 and 250 or length(btrim(p->>'availability_label')) not between 1 and 500 then return false;end if;
 if jsonb_typeof(p->'body') is distinct from 'object' or not(p->'body'?&array['format','value']) or exists(select 1 from jsonb_object_keys(p->'body') x where x not in('format','value')) or p->'body'->>'format' is distinct from 'plain_text' or jsonb_typeof(p->'body'->'value') is distinct from 'string' or length(btrim(p->'body'->>'value')) not between 1 and 12000 then return false;end if;
 if p->>'closes_at'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$'then return false;end if;perform (p->>'closes_at')::timestamptz;return true;
 exception when invalid_datetime_format or datetime_field_overflow then return false;
end$$;
create function private.f4_vacancy_evidence(o uuid,proof uuid,f uuid) returns text language sql stable security definer set search_path='' as $$
 select case when private.f4_partner_document(o,proof) is not null and private.f4_partner_document(o,x.policy_document_id) is not null then encode(sha256(convert_to(jsonb_build_object('proof',private.f4_partner_document(o,proof),'policy',private.f4_partner_document(o,x.policy_document_id),'form',jsonb_build_object('id',x.id,'version',x.version,'notice_version',x.notice_version,'notice_body',x.notice_body,'legal_basis',x.legal_basis,'retention_policy',x.retention_policy,'opens_at',x.opens_at,'closes_at',x.closes_at))::text,'UTF8')),'hex')end from private.intake_forms x where x.id=f and x.organization_id=o and x.category='volunteer_application'
$$;
create function private.f4_vacancy_current(r private.vacancy_revisions) returns boolean language sql stable security definer set search_path='' as $$
 select private.f4_vacancy_payload(r.payload) and exists(select 1 from private.vacancy_dossiers d join private.intake_forms f on f.id=d.form_id where d.id=r.dossier_id and d.organization_id=r.organization_id and d.closed_at is null and r.evidence_hash=private.f4_vacancy_evidence(r.organization_id,r.proof_document_id,d.form_id) and(r.payload->>'closes_at')::timestamptz>clock_timestamp() and(r.payload->>'closes_at')::timestamptz<=f.closes_at and(r.payload->>'closes_at')::timestamptz>f.opens_at)
$$;
create function private.f4_vacancy_viewer(s uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.f4_identity() and exists(select 1 from public.publication_sites p join private.vacancy_settings cfg on cfg.site_id=p.id where p.id=s and p.active and cfg.enabled and(private.f2_viewer(s)or exists(select 1 from private.platform_access a where a.site_id=s and a.user_id=auth.uid() and a.may_view and private.f4_access_valid(a.id))))
$$;
create function private.f4_vacancy_open(e private.vacancy_entries) returns boolean language sql stable security definer set search_path='' as $$
 select e.withdrawn_at is null and e.published_at<=clock_timestamp() and(e.valid_until is null or e.valid_until>clock_timestamp()) and exists(select 1 from public.publication_sites s join private.vacancy_settings cfg on cfg.site_id=s.id where s.id=e.site_id and s.active and cfg.enabled)
 and exists(select 1 from private.vacancy_revisions r join private.vacancy_dossiers d on d.id=r.dossier_id join private.intake_forms f on f.id=d.form_id where r.id=e.selected_revision_id and r.organization_id=e.organization_id and d.id=e.dossier_id and d.site_id=e.site_id and r.status='approved' and private.f4_vacancy_current(r) and private.f4_intake_open(f))
$$;
create function private.f4_vacancy_project(e private.vacancy_entries) returns jsonb language sql stable security definer set search_path='' as $$select r.payload||jsonb_build_object('schema_version','besc-platform-publication-v1','type','vacancy','public_id',e.public_id,'revision',r.revision,'published_at',e.published_at,'valid_until',e.valid_until) from private.vacancy_revisions r where r.id=e.selected_revision_id$$;
create function private.f4_vacancy_form_links(f uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('public_id',e.public_id,'slug',e.slug,'locale',e.locale,'title',r.payload->>'title','revision',r.revision) order by e.locale),'[]') from private.vacancy_dossiers d join private.vacancy_entries e on e.dossier_id=d.id join private.vacancy_revisions r on r.id=e.selected_revision_id where d.form_id=f and private.f4_vacancy_viewer(e.site_id) and private.f4_vacancy_open(e)
$$;
create function public.f4_vacancy_workflow(p_site_id uuid,p_operation text,p_data jsonb,p_request_id uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare s public.publication_sites;d private.vacancy_dossiers;r private.vacancy_revisions;e private.vacancy_entries;f private.intake_forms;prior private.f4_receipts;op text:=p_operation;j jsonb:=p_data;allowed text[];ident uuid;v integer;h text;start_at timestamptz;end_at timestamptz;answer jsonb;begin
 perform private.f4_read_gate();select * into s from public.publication_sites where id=p_site_id;
 if s.id is null or p_request_id is null or j is null or jsonb_typeof(j)<>'object' or pg_column_size(j)>23000 then raise exception 'vacancy_not_available' using errcode='42501';end if;
 allowed:=case op when 'site.configure' then array['enabled','reason'] when 'vacancy.draft' then array['dossier_id','form_id','expected_revision','payload','proof_document_id'] when 'vacancy.submit' then array['id','expected_hash'] when 'vacancy.review' then array['id','expected_hash','decision','reason','rights_confirmed'] when 'vacancy.release' then array['id','expected_hash','expected_epoch','reason','published_at','valid_until'] when 'vacancy.close' then array['dossier_id','reason'] else null end;
 if allowed is null or not(j?&allowed) or exists(select 1 from jsonb_object_keys(j) k where not(k=any(allowed))) then raise exception 'vacancy_invalid_input';end if;
 if not private.f2_account(s.organization_id) or not(case when op='site.configure' then private.f1_chair(s.organization_id) when op='vacancy.review' then private.f1_role(s.organization_id,'publication_reviewer') else private.f1_role(s.organization_id,'publication_editor')end) then raise exception 'vacancy_not_authorized' using errcode='42501';end if;
 if op in('vacancy.submit','vacancy.review','vacancy.release') then
  select * into r from private.vacancy_revisions where id=(j->>'id')::uuid and organization_id=s.organization_id for update;select * into d from private.vacancy_dossiers where id=r.dossier_id and site_id=s.id;
  if d.id is null or not private.f1_document_visible(s.organization_id,r.proof_document_id) then raise exception 'vacancy_not_authorized' using errcode='42501';end if;
 elsif op='vacancy.close' then select * into d from private.vacancy_dossiers where id=(j->>'dossier_id')::uuid and site_id=s.id for update;if d.id is null then raise exception 'vacancy_not_authorized' using errcode='42501';end if;end if;
 select * into prior from private.f4_receipts where site_id=s.id and actor=auth.uid() and request_id=p_request_id;if found then if prior.operation<>'vacancy.'||op or prior.input<>j then raise exception 'vacancy_request_conflict' using errcode='40001';end if;return prior.result;end if;perform private.f4_limit(s.id,'vacancy_write',30);
 if op='site.configure' then
  if jsonb_typeof(j->'enabled') is distinct from 'boolean' or jsonb_typeof(j->'reason') is distinct from 'string' or length(btrim(j->>'reason')) not between 2 and 2000 then raise exception 'vacancy_invalid_input';end if;insert into private.vacancy_settings values(s.id,s.organization_id,(j->>'enabled')::boolean)on conflict(site_id)do update set enabled=excluded.enabled;ident:=s.id;
 elsif op='vacancy.draft' then
  if jsonb_typeof(j->'expected_revision') is distinct from 'number' or coalesce(j->>'expected_revision','')!~'^(0|[1-9][0-9]*)$' or not private.f4_vacancy_payload(j->'payload') then raise exception 'vacancy_invalid_input';end if;
  select * into f from private.intake_forms where id=(j->>'form_id')::uuid and site_id=s.id and category='volunteer_application';if f.id is null or not private.f1_document_visible(s.organization_id,f.policy_document_id) then raise exception 'vacancy_form_required';end if;
  if j->'dossier_id'='null'::jsonb then
   if(j->>'expected_revision')::integer<>0 then raise exception 'vacancy_version_conflict' using errcode='40001';end if;
   if(select count(*) from private.vacancy_dossiers where site_id=s.id)>=200 then raise exception 'vacancy_capacity';end if;
   insert into private.vacancy_dossiers(organization_id,site_id,form_id,created_by)values(s.organization_id,s.id,f.id,auth.uid())returning * into d;
  else select * into d from private.vacancy_dossiers where id=(j->>'dossier_id')::uuid and site_id=s.id and form_id=f.id and closed_at is null for update;if d.id is null then raise exception 'vacancy_not_authorized' using errcode='42501';end if;end if;
  select coalesce(max(revision),0) into v from private.vacancy_revisions where dossier_id=d.id;if v<>(j->>'expected_revision')::integer then raise exception 'vacancy_version_conflict' using errcode='40001';end if;
  if(select count(*)from private.vacancy_revisions where organization_id=s.organization_id)>=1000 then raise exception 'vacancy_capacity';end if;
  r.organization_id:=s.organization_id;r.dossier_id:=d.id;r.payload:=j->'payload';r.proof_document_id:=(j->>'proof_document_id')::uuid;r.evidence_hash:=private.f4_vacancy_evidence(s.organization_id,r.proof_document_id,f.id);
  if r.evidence_hash is null or not coalesce(private.f4_vacancy_current(r),false) or not private.f1_document_visible(s.organization_id,r.proof_document_id) then raise exception 'vacancy_evidence_invalid';end if;
  h:=encode(sha256(convert_to(r.payload::text,'UTF8')),'hex');insert into private.vacancy_revisions(organization_id,dossier_id,revision,payload,payload_sha256,proof_document_id,evidence_hash,created_by)values(s.organization_id,d.id,v+1,r.payload,h,r.proof_document_id,r.evidence_hash,auth.uid())returning id into ident;
 elsif op in('vacancy.submit','vacancy.review','vacancy.release') then
  if j->>'expected_hash' is distinct from r.payload_sha256 then raise exception 'vacancy_hash_conflict' using errcode='40001';end if;select * into f from private.intake_forms where id=d.form_id;if not private.f1_document_visible(s.organization_id,f.policy_document_id) then raise exception 'vacancy_not_authorized' using errcode='42501';end if;ident:=r.id;
  if op='vacancy.submit' then if r.created_by<>auth.uid()or r.status<>'draft'or not coalesce(private.f4_vacancy_current(r),false)then raise exception 'vacancy_source_or_version_invalid';end if;update private.vacancy_revisions set status='submitted'where id=r.id;
  elsif op='vacancy.review' then
   if r.status<>'submitted'or r.created_by=auth.uid()then raise exception 'vacancy_independent_review_required'using errcode='42501';end if;
   if j->'rights_confirmed'is distinct from'true'::jsonb or coalesce(j->>'decision','')not in('approved','changes_requested')or jsonb_typeof(j->'reason')is distinct from'string'or length(btrim(j->>'reason'))not between 2 and 2000 then raise exception 'vacancy_invalid_input';end if;
   if j->>'decision'='approved'and not coalesce(private.f4_vacancy_current(r),false)then raise exception 'vacancy_source_invalid';end if;update private.vacancy_revisions set status=j->>'decision',reviewed_by=auth.uid(),reviewed_at=clock_timestamp(),review_note=j->>'reason'where id=r.id;
  else
   if r.status<>'approved'or not coalesce(private.f4_vacancy_current(r),false)or jsonb_typeof(j->'expected_epoch')is distinct from'number'or coalesce(j->>'expected_epoch','')!~'^(0|[1-9][0-9]*)$'or jsonb_typeof(j->'reason')is distinct from'string'or length(btrim(j->>'reason'))not between 2 and 2000 then raise exception 'vacancy_source_or_version_invalid';end if;
   select * into e from private.vacancy_entries where site_id=s.id and dossier_id=d.id and locale=r.payload->>'locale'for update;if coalesce(e.epoch,0)<>(j->>'expected_epoch')::bigint or(e.public_id is not null and e.slug<>r.payload->>'slug')then raise exception 'vacancy_release_conflict'using errcode='40001';end if;
   start_at:=coalesce((j->>'published_at')::timestamptz,clock_timestamp());end_at:=(j->>'valid_until')::timestamptz;if start_at>=(r.payload->>'closes_at')::timestamptz or(end_at is not null and end_at<=start_at)then raise exception 'vacancy_invalid_window';end if;
   if e.public_id is null then insert into private.vacancy_entries(organization_id,site_id,dossier_id,selected_revision_id,locale,slug,published_at,valid_until)values(s.organization_id,s.id,d.id,r.id,r.payload->>'locale',r.payload->>'slug',start_at,end_at)returning public_id into ident;
   else update private.vacancy_entries set selected_revision_id=r.id,epoch=epoch+1,published_at=start_at,valid_until=end_at,withdrawn_at=null where public_id=e.public_id;ident:=e.public_id;end if;
  end if;
 else
  if jsonb_typeof(j->'reason')is distinct from'string'or length(btrim(j->>'reason'))not between 2 and 2000 then raise exception 'vacancy_invalid_input';end if;update private.vacancy_dossiers set closed_at=coalesce(closed_at,clock_timestamp())where id=d.id;update private.vacancy_entries set withdrawn_at=coalesce(withdrawn_at,clock_timestamp())where dossier_id=d.id;update private.vacancy_revisions set status='withdrawn'where dossier_id=d.id and status in('submitted','approved');ident:=d.id;
 end if;answer:=jsonb_build_object('id',ident);perform private.f1_audit(s.organization_id,ident,'f4.vacancy.'||op);insert into private.f4_receipts values(s.id,auth.uid(),p_request_id,'vacancy.'||op,j,answer);return answer;
end$$;
create function public.f4_vacancies(p_site_id uuid,p_slug text default null,p_locale text default 'nl-BE',p_limit integer default 20,p_before_time timestamptz default null,p_before_id uuid default null,p_search text default null)returns jsonb language plpgsql volatile security definer set search_path=''as $$declare result jsonb;begin
 perform private.f4_read_gate();if not private.f4_vacancy_viewer(p_site_id)then raise exception'vacancy_not_authorized'using errcode='42501';end if;
 if p_locale is null or p_locale not in('nl-BE','fr-BE','en')or p_limit is null or p_limit not between 1 and 50 or(p_before_time is null)<>(p_before_id is null)or(p_slug is not null and(length(p_slug)>160 or p_slug!~'^[a-z0-9]+(-[a-z0-9]+)*$'))or length(p_search)>80 then raise exception'vacancy_invalid_input';end if;perform private.f4_limit(p_site_id,'vacancy_read',120);
 select coalesce(jsonb_agg(private.f4_vacancy_project(v)order by v.published_at desc,v.public_id desc),'[]')into result from(select e.* from private.vacancy_entries e join private.vacancy_revisions r on r.id=e.selected_revision_id where e.site_id=p_site_id and e.locale=p_locale and private.f4_vacancy_open(e)and(p_slug is null or e.slug=p_slug)and(p_before_time is null or(e.published_at,e.public_id)<(p_before_time,p_before_id))and(p_search is null or position(lower(p_search)in lower(r.payload->>'title'))>0)order by e.published_at desc,e.public_id desc limit p_limit)v;return result;
end$$;
create function public.f4_vacancy_admin(p_site_id uuid,p_before_time timestamptz default null,p_before_id uuid default null)returns jsonb language plpgsql volatile security definer set search_path=''as $$declare o uuid;ch boolean;ed boolean;rv boolean;revs jsonb;begin
 perform private.f4_read_gate();select organization_id into o from public.publication_sites where id=p_site_id;ch:=private.f1_chair(o);ed:=private.f1_role(o,'publication_editor');rv:=private.f1_role(o,'publication_reviewer');if not private.f2_account(o)or not(ch or ed or rv)then raise exception'vacancy_not_authorized'using errcode='42501';end if;if(p_before_time is null)<>(p_before_id is null)then raise exception'vacancy_invalid_input';end if;perform private.f4_limit(p_site_id,'vacancy_admin',60);
 select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('current',coalesce(private.f4_vacancy_current(r),false))order by r.created_at desc,r.id desc),'[]')into revs from(select x.* from private.vacancy_revisions x join private.vacancy_dossiers d on d.id=x.dossier_id join private.intake_forms f on f.id=d.form_id where d.site_id=p_site_id and private.f1_document_visible(o,x.proof_document_id)and private.f1_document_visible(o,f.policy_document_id)and(ed or(rv and x.status<>'draft'))and(p_before_time is null or(x.created_at,x.id)<(p_before_time,p_before_id))order by x.created_at desc,x.id desc limit 50)r;
 return jsonb_build_object('chair',ch,'editor',ed,'reviewer',rv,'enabled',coalesce((select enabled from private.vacancy_settings where site_id=p_site_id),false),'forms',case when ed then(select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'title',f.title,'opens_at',f.opens_at,'closes_at',f.closes_at,'active',f.active)),'[]')from private.intake_forms f where f.site_id=p_site_id and f.category='volunteer_application'and private.f1_document_visible(o,f.policy_document_id))else'[]'::jsonb end,
 'dossiers',case when ed or rv then(select coalesce(jsonb_agg(to_jsonb(d)||jsonb_build_object('revision',(select coalesce(max(revision),0)from private.vacancy_revisions where dossier_id=d.id))),'[]')from private.vacancy_dossiers d where d.site_id=p_site_id)else'[]'::jsonb end,'revisions',revs,'next_before',case when jsonb_array_length(revs)=50 then jsonb_build_object('at',(revs->-1)->>'created_at','id',(revs->-1)->>'id')else null end,'entries',case when ed or rv then(select coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('available',coalesce(private.f4_vacancy_open(e),false))),'[]')from private.vacancy_entries e where e.site_id=p_site_id)else'[]'::jsonb end);
end$$;
create function private.f4_vacancy_proof_changed()returns trigger language plpgsql security definer set search_path=''as $$declare affected uuid[];begin
 if to_jsonb(new)=to_jsonb(old)then return new;end if;
 select array_agg(r.id)into affected from private.vacancy_revisions r join private.vacancy_dossiers d on d.id=r.dossier_id join private.intake_forms f on f.id=d.form_id where r.proof_document_id=old.id or f.policy_document_id=old.id;
 update private.vacancy_entries set withdrawn_at=coalesce(withdrawn_at,clock_timestamp())where selected_revision_id=any(affected);update private.vacancy_revisions set status='withdrawn'where id=any(affected)and status in('submitted','approved');if cardinality(affected)>0 then perform private.f1_audit(old.organization_id,old.id,'f4.vacancy.evidence_changed');end if;return new;
end$$;
create trigger f4_vacancy_proof_changed after update of url,label,restricted_finance,restricted_governance,media_rights_revoked_at on public.document_registry for each row execute function private.f4_vacancy_proof_changed();
create function private.f4_vacancy_application_payload(p jsonb)returns boolean language plpgsql immutable set search_path=''as $$begin
 if p is null or jsonb_typeof(p)<>'object'or pg_column_size(p)>10000 or not(p?&array['vacancy_public_id','expected_vacancy_revision','motivation','availability'])or exists(select 1 from jsonb_object_keys(p)k where k not in('vacancy_public_id','expected_vacancy_revision','motivation','availability'))then return false;end if;
 return jsonb_typeof(p->'vacancy_public_id')='string'and coalesce(p->>'vacancy_public_id','')~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'and jsonb_typeof(p->'expected_vacancy_revision')='number'and coalesce(p->>'expected_vacancy_revision','')~'^[1-9][0-9]*$'and jsonb_typeof(p->'motivation')='string'and length(btrim(p->>'motivation'))between 1 and 4000 and jsonb_typeof(p->'availability')='string'and length(btrim(p->>'availability'))between 1 and 1000;
end$$;

-- Extend the existing intake; immutable earlier migration files are retained.
create or replace function public.f4_intake_workflow(p_site_id uuid,p_operation text,p_data jsonb,p_request_id uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare s public.publication_sites;f private.intake_forms;a private.platform_applications;access private.platform_access;prior private.f4_receipts;
 op text:=p_operation;d jsonb:=p_data;allowed text[];field_key text;aid uuid;fid uuid;ident uuid;target uuid;answer jsonb;note text;msg text;next_status text;ve private.vacancy_entries;vr private.vacancy_revisions;vac_snapshot jsonb;begin
 perform private.f4_read_gate();select * into s from public.publication_sites where id=p_site_id;
 if s.id is null or p_request_id is null or d is null or jsonb_typeof(d)<>'object' or pg_column_size(d)>22000 then raise exception 'intake_not_available' using errcode='42501';end if;
 if op='form.create'and not(d?'category')then d:=d||jsonb_build_object('category','partnership');end if;
 allowed:=case op when 'form.create' then array['category','slug','version','title','notice_version','notice_body','legal_basis','retention_policy','policy_document_id','opens_at','closes_at'] when 'form.open' then array['id','policy_confirmed','reason'] when 'form.close' then array['id','reason'] when 'handler.assign' then array['form_id','user_id','proof_document_id','valid_until'] when 'handler.revoke' then array['id','reason'] when 'application.submit' then array['form_id','notice_version','notice_acknowledged','payload'] when 'application.withdraw' then array['id','expected_version'] when 'application.reply' then array['id','expected_version','message'] when 'application.claim' then array['id','expected_version'] when 'application.update' then array['id','expected_version','status','own_message','internal_note'] else null end;
 if allowed is null or not(d?&allowed) or exists(select 1 from jsonb_object_keys(d) k where not(k=any(allowed))) then raise exception 'intake_invalid_input';end if;
 foreach field_key in array array['slug','title','notice_version','notice_body','legal_basis','retention_policy','reason','message','own_message','internal_note','status'] loop if d?field_key and jsonb_typeof(d->field_key) is distinct from 'string' then raise exception 'intake_invalid_input';end if;end loop;
 if op in('form.create','form.open','form.close','handler.assign','handler.revoke') then
  if not private.f2_account(s.organization_id) or not private.f1_chair(s.organization_id) then raise exception 'intake_not_authorized' using errcode='42501';end if;
 else
  if op in('application.submit','application.withdraw','application.reply') then
   aid:=private.f4_intake_own(s.id);if aid is null then raise exception 'intake_not_authorized' using errcode='42501';end if;select * into access from private.platform_access where id=aid;
  end if;
 end if;
 if op in('application.withdraw','application.reply','application.claim','application.update') then
  select * into a from private.platform_applications where id=(d->>'id')::uuid and site_id=s.id for update;
  if a.id is null then raise exception 'intake_not_authorized' using errcode='42501';end if;
  if op in('application.withdraw','application.reply') then
   if a.actor<>auth.uid() or a.person_id<>access.person_id or a.access_id<>aid then raise exception 'intake_not_authorized' using errcode='42501';end if;
  elsif not private.f2_account(s.organization_id) or not private.f4_intake_handler(a.form_id,auth.uid()) or not s.active then raise exception 'intake_not_authorized' using errcode='42501';end if;
 end if;
 if op in('form.open','form.close') then fid:=(d->>'id')::uuid;elsif op in('handler.assign','application.submit') then fid:=(d->>'form_id')::uuid;end if;
 if fid is not null then select * into f from private.intake_forms where id=fid and site_id=s.id for update;if f.id is null then raise exception 'intake_not_authorized' using errcode='42501';end if;end if;
 if op='handler.revoke' and not exists(select 1 from private.intake_handlers h join private.intake_forms x on x.id=h.form_id where h.id=(d->>'id')::uuid and x.site_id=s.id) then raise exception 'intake_not_authorized' using errcode='42501';end if;
 if op='application.update' and a.assigned_user_id is distinct from auth.uid() then raise exception 'intake_not_authorized' using errcode='42501';end if;
 if op='application.claim' and a.assigned_user_id is not null and a.assigned_user_id<>auth.uid() and private.f4_intake_handler(a.form_id,a.assigned_user_id) then raise exception 'intake_assigned_conflict' using errcode='40001';end if;
 select * into prior from private.f4_receipts where site_id=s.id and actor=auth.uid() and request_id=p_request_id;
 if found then if op='application.submit' and not exists(select 1 from private.platform_applications x where x.id=(prior.result->>'id')::uuid and x.site_id=s.id and x.access_id=aid and x.actor=auth.uid() and x.person_id=access.person_id) then raise exception 'intake_not_authorized' using errcode='42501';end if;if prior.operation<>'intake.'||op or(case when op='form.create'then prior.input||jsonb_build_object('category',coalesce(prior.input->>'category','partnership'))else prior.input end)<>d then raise exception 'intake_request_conflict' using errcode='40001';end if;return prior.result;end if;
 perform private.f4_limit(s.id,'intake_write',20);
 if op='form.create' then
  if(select count(*) from private.intake_forms where site_id=s.id)>=200 then raise exception 'intake_capacity';end if;
  if coalesce(d->>'category','')not in('partnership','volunteer_application')or coalesce(d->>'slug','')!~'^[a-z0-9]+(-[a-z0-9]+)*$' or length(d->>'slug')>100 or jsonb_typeof(d->'version') is distinct from 'number' or coalesce(d->>'version','')!~'^[1-9][0-9]*$'
  or length(btrim(coalesce(d->>'title',''))) not between 2 and 180 or length(btrim(coalesce(d->>'notice_version',''))) not between 1 and 80
  or length(btrim(coalesce(d->>'notice_body',''))) not between 10 and 10000 or length(btrim(coalesce(d->>'legal_basis',''))) not between 2 and 2000 or length(btrim(coalesce(d->>'retention_policy',''))) not between 2 and 4000
  or not private.f1_document_visible(s.organization_id,(d->>'policy_document_id')::uuid) or not exists(select 1 from public.document_registry where id=(d->>'policy_document_id')::uuid and organization_id=s.organization_id)
  or d->>'opens_at' is null or d->>'closes_at' is null or(d->>'closes_at')::timestamptz<=(d->>'opens_at')::timestamptz then raise exception 'intake_invalid_input';end if;
  insert into private.intake_forms(organization_id,site_id,slug,version,category,title,notice_version,notice_body,legal_basis,retention_policy,policy_document_id,opens_at,closes_at,created_by)
  values(s.organization_id,s.id,d->>'slug',(d->>'version')::integer,d->>'category',d->>'title',d->>'notice_version',d->>'notice_body',d->>'legal_basis',d->>'retention_policy',(d->>'policy_document_id')::uuid,(d->>'opens_at')::timestamptz,(d->>'closes_at')::timestamptz,auth.uid()) returning id into ident;
 elsif op in('form.open','form.close') then
  if length(btrim(coalesce(d->>'reason',''))) not between 2 and 2000 or(op='form.open' and(d->'policy_confirmed' is distinct from 'true'::jsonb or not s.active or f.closes_at<=clock_timestamp() or not private.f1_document_visible(s.organization_id,f.policy_document_id))) then raise exception 'intake_invalid_input';end if;
  if op='form.open' and not f.active and(select count(*) from private.intake_forms where site_id=s.id and active)>=50 then raise exception 'intake_capacity';end if;
  update private.intake_forms set active=(op='form.open') where id=f.id;ident:=f.id;
 elsif op='handler.assign' then
  if(select count(*) from private.intake_handlers h join private.intake_forms x on x.id=h.form_id where x.site_id=s.id)>=500 then raise exception 'intake_capacity';end if;
  target:=(d->>'user_id')::uuid;
  if not private.f4_intake_staff(s.organization_id,target) or(select count(*) from public.community_people where organization_id=s.organization_id and account_user_id=target and deleted_at is null)<>1 or not private.f1_document_visible(s.organization_id,(d->>'proof_document_id')::uuid) or not exists(select 1 from public.document_registry where id=(d->>'proof_document_id')::uuid and organization_id=s.organization_id)
  or d->>'valid_until' is null or(d->>'valid_until')::timestamptz<=clock_timestamp() or(d->>'valid_until')::timestamptz>clock_timestamp()+interval '7 days' then raise exception 'intake_invalid_input';end if;
  insert into private.intake_handlers(organization_id,form_id,user_id,person_id,proof_document_id,valid_until,created_by) values(s.organization_id,f.id,target,(select id from public.community_people where organization_id=s.organization_id and account_user_id=target and deleted_at is null),(d->>'proof_document_id')::uuid,(d->>'valid_until')::timestamptz,auth.uid()) returning id into ident;
 elsif op='handler.revoke' then
  if length(btrim(coalesce(d->>'reason',''))) not between 2 and 2000 then raise exception 'intake_invalid_input';end if;
  update private.intake_handlers set revoked_at=coalesce(revoked_at,clock_timestamp()) where id=(d->>'id')::uuid returning id into ident;
 elsif op='application.submit' then
  if(select count(*) from private.platform_applications where site_id=s.id and actor=auth.uid() and access_id=aid)>=100 then raise exception 'intake_capacity';end if;
  if not private.f4_intake_open(f) or d->'notice_acknowledged' is distinct from 'true'::jsonb or d->>'notice_version' is distinct from f.notice_version or not(case when f.category='partnership' then private.f4_intake_payload(d->'payload')else coalesce(private.f4_vacancy_application_payload(d->'payload'),false)end) then raise exception 'intake_invalid_input';end if;
  if f.category='volunteer_application'then
   if not private.f4_vacancy_viewer(s.id)then raise exception'vacancy_not_authorized'using errcode='42501';end if;
   select e.* into ve from private.vacancy_entries e join private.vacancy_dossiers vd on vd.id=e.dossier_id where e.public_id=(d->'payload'->>'vacancy_public_id')::uuid and e.site_id=s.id and vd.form_id=f.id and private.f4_vacancy_open(e);
   if ve.public_id is null then raise exception'vacancy_not_open'using errcode='42501';end if;
   select * into vr from private.vacancy_revisions where id=ve.selected_revision_id;
   if vr.revision<>(d->'payload'->>'expected_vacancy_revision')::integer then raise exception'vacancy_revision_conflict'using errcode='40001';end if;
   vac_snapshot:=private.f4_vacancy_project(ve);
  end if;
  insert into private.platform_applications(organization_id,site_id,form_id,access_id,actor,person_id,payload,payload_sha256,form_snapshot,category,vacancy_public_id,vacancy_revision_id,vacancy_snapshot)
  values(s.organization_id,s.id,f.id,aid,auth.uid(),access.person_id,d->'payload',encode(sha256(convert_to((d->'payload')::text,'UTF8')),'hex'),jsonb_build_object('title',f.title,'version',f.version,'notice_version',f.notice_version,'notice_body',f.notice_body,'legal_basis',f.legal_basis,'retention_policy',f.retention_policy),f.category,ve.public_id,vr.id,vac_snapshot) returning id into ident;
  insert into private.application_events(organization_id,application_id,actor,version,kind,status) values(s.organization_id,ident,auth.uid(),1,op,'received');
 else
  if jsonb_typeof(d->'expected_version') is distinct from 'number' or coalesce(d->>'expected_version','')!~'^[1-9][0-9]*$' or(d->>'expected_version')::integer<>a.version then raise exception 'intake_version_conflict' using errcode='40001';end if;
  if a.status in('closed','rejected','withdrawn') then raise exception 'intake_terminal_conflict' using errcode='40001';end if;
  if a.version>=100 and op<>'application.withdraw' then raise exception 'intake_history_limit';end if;
  next_status:=a.status;msg:='';note:='';
  if op='application.withdraw' then next_status:='withdrawn';
  elsif op='application.reply' then
   if a.status<>'needs_information' or jsonb_typeof(d->'message') is distinct from 'string' or length(btrim(d->>'message')) not between 1 and 4000 then raise exception 'intake_invalid_input';end if;next_status:='in_review';msg:=d->>'message';
  elsif op='application.claim' then
   if a.assigned_user_id is not null and a.assigned_user_id<>auth.uid() and private.f4_intake_handler(a.form_id,a.assigned_user_id) then raise exception 'intake_assigned_conflict' using errcode='40001';end if;
   update private.platform_applications set assigned_user_id=auth.uid() where id=a.id;
  elsif op='application.update' then
   if a.assigned_user_id is distinct from auth.uid() or coalesce(d->>'status','') not in('in_review','needs_information','rejected','closed') or jsonb_typeof(d->'own_message') is distinct from 'string' or length(d->>'own_message')>4000 or jsonb_typeof(d->'internal_note') is distinct from 'string' or length(d->>'internal_note')>4000
   or(d->>'status'='needs_information' and length(btrim(d->>'own_message'))<2) then raise exception 'intake_invalid_input';end if;
   next_status:=d->>'status';msg:=d->>'own_message';note:=d->>'internal_note';
  end if;
  update private.platform_applications set status=next_status,version=version+1,updated_at=clock_timestamp() where id=a.id returning id,version into ident,a.version;
  insert into private.application_events(organization_id,application_id,actor,version,kind,status,own_message,internal_note) values(s.organization_id,ident,auth.uid(),a.version,op,next_status,msg,note);
 end if;
 answer:=jsonb_build_object('id',ident);perform private.f1_audit(s.organization_id,ident,'f4.intake.'||op);
 insert into private.f4_receipts values(s.id,auth.uid(),p_request_id,'intake.'||op,d,answer);return answer;
end$$;

create or replace function public.f4_intake_me(p_site_id uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare aid uuid;forms jsonb;apps jsonb;begin
 perform private.f4_read_gate();aid:=private.f4_intake_own(p_site_id);if aid is null then raise exception 'intake_not_authorized' using errcode='42501';end if;
 perform private.f4_limit(p_site_id,'intake_own_read',60);
 if(select count(*) from private.intake_forms f where f.site_id=p_site_id and private.f4_intake_open(f))>50 or(select count(*) from private.platform_applications where site_id=p_site_id and access_id=aid and actor=auth.uid())>100 then raise exception 'intake_page_required';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'category',f.category,'title',f.title,'version',f.version,'notice_version',f.notice_version,'notice_body',f.notice_body,'legal_basis',f.legal_basis,'retention_policy',f.retention_policy,'closes_at',f.closes_at)||case when f.category='volunteer_application'then jsonb_build_object('vacancies',private.f4_vacancy_form_links(f.id))else'{}'::jsonb end order by f.title,f.id),'[]') into forms from private.intake_forms f where f.site_id=p_site_id and private.f4_intake_open(f)and(f.category='partnership'or jsonb_array_length(private.f4_vacancy_form_links(f.id))>0);
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'title',a.form_snapshot->>'title','category',a.category,'version',a.version,'status',a.status,'created_at',a.created_at,'updated_at',a.updated_at) order by a.created_at desc,a.id desc),'[]') into apps
 from private.platform_applications a where a.site_id=p_site_id and a.access_id=aid and a.actor=auth.uid();
 return jsonb_build_object('schema_version','besc-intake-own-v1','lease_id',aid,'forms',forms,'applications',apps);
end$$;
create or replace function public.f4_intake_application(p_site_id uuid,p_id uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare aid uuid;a private.platform_applications;begin
 perform private.f4_read_gate();aid:=private.f4_intake_own(p_site_id);if aid is null then raise exception 'intake_not_authorized' using errcode='42501';end if;
 perform private.f4_limit(p_site_id,'intake_own_read',60);select * into a from private.platform_applications where id=p_id and site_id=p_site_id and access_id=aid and actor=auth.uid();
 if a.id is null then raise exception 'intake_not_authorized' using errcode='42501';end if;
 return jsonb_build_object('schema_version','besc-intake-detail-v1','lease_id',aid,'id',a.id,'category',a.category,'version',a.version,'status',a.status,'created_at',a.created_at,'updated_at',a.updated_at,'payload',a.payload,'form',a.form_snapshot,
 'events',(select coalesce(jsonb_agg(jsonb_build_object('version',e.version,'kind',e.kind,'status',e.status,'message',e.own_message,'created_at',e.created_at) order by e.version),'[]') from private.application_events e where e.application_id=a.id))||case when a.category='volunteer_application'then jsonb_build_object('vacancy',a.vacancy_snapshot)else'{}'::jsonb end;
end$$;
create or replace function public.f4_intake_admin(p_site_id uuid,p_after_time timestamptz default null,p_after_id uuid default null) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare o uuid;ch boolean;forms jsonb;grants jsonb;apps jsonb;begin
 perform private.f4_read_gate();select organization_id into o from public.publication_sites where id=p_site_id;
 ch:=private.f1_chair(o);if not private.f2_account(o) or not(ch or exists(select 1 from private.intake_forms f where f.site_id=p_site_id and private.f4_intake_handler(f.id,auth.uid()))) then raise exception 'intake_not_authorized' using errcode='42501';end if;
 perform private.f4_limit(p_site_id,'intake_admin_read',60);
 if(select count(*) from private.platform_access where site_id=p_site_id)>500 or(select count(*) from private.intake_forms where site_id=p_site_id)>200 or(select count(*) from private.intake_handlers h join private.intake_forms f on f.id=h.form_id where f.site_id=p_site_id)>500 then raise exception 'intake_page_required';end if;
 if(p_after_time is null)<>(p_after_id is null) then raise exception 'intake_invalid_input';end if;
 select coalesce(jsonb_agg(to_jsonb(f)||jsonb_build_object('can_handle',private.f4_intake_handler(f.id,auth.uid())) order by f.created_at desc),'[]') into forms from private.intake_forms f where f.site_id=p_site_id and(ch or private.f4_intake_handler(f.id,auth.uid()));
 select coalesce(jsonb_agg(to_jsonb(h)||jsonb_build_object('valid',private.f4_intake_handler(h.form_id,h.user_id))),'[]') into grants from private.intake_handlers h join private.intake_forms f on f.id=h.form_id where f.site_id=p_site_id and ch;
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'category',a.category,'form_id',a.form_id,'status',a.status,'version',a.version,'assigned_user_id',a.assigned_user_id,'created_at',a.created_at,'title',a.form_snapshot->>'title') order by a.created_at,a.id),'[]') into apps from(select x.* from private.platform_applications x where x.site_id=p_site_id and private.f4_intake_handler(x.form_id,auth.uid()) and(p_after_time is null or(x.created_at,x.id)>(p_after_time,p_after_id)) order by x.created_at,x.id limit 50)a;
 return jsonb_build_object('chair',ch,'forms',forms,'handlers',grants,'applications',apps,'next_after',case when jsonb_array_length(apps)=50 then jsonb_build_object('at',(apps->-1)->>'created_at','id',(apps->-1)->>'id')else null end,'actor',auth.uid(),'access',case when ch then(select coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('valid',private.f4_access_valid(a.id))),'[]') from private.platform_access a where a.site_id=p_site_id)else '[]'::jsonb end);
end$$;

create function private.f4_vacancy_form_changed()returns trigger language plpgsql security definer set search_path=''as $$begin
 if to_jsonb(new)=to_jsonb(old)then return new;end if;
 update private.vacancy_entries e set withdrawn_at=coalesce(e.withdrawn_at,clock_timestamp())from private.vacancy_dossiers d where e.dossier_id=d.id and d.form_id=old.id;
 update private.vacancy_revisions r set status='withdrawn'from private.vacancy_dossiers d where r.dossier_id=d.id and d.form_id=old.id and r.status in('submitted','approved');return new;
end$$;
create trigger f4_vacancy_form_changed after update of title,notice_version,notice_body,legal_basis,retention_policy,policy_document_id,opens_at,closes_at on private.intake_forms for each row execute function private.f4_vacancy_form_changed();
do $$declare x record;begin for x in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('private','public')and(p.proname like'f4_vacancy_%'or p.proname='f4_vacancies')loop execute'revoke all on function '||x.sig||' from public,anon,authenticated,service_role';end loop;end$$;
grant execute on function public.f4_vacancy_workflow(uuid,text,jsonb,uuid),public.f4_vacancies(uuid,text,text,integer,timestamptz,uuid,text),public.f4_vacancy_admin(uuid,timestamptz,uuid)to authenticated;
commit;
