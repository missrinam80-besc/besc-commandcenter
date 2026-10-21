begin;
alter table public.document_registry add column media_rights_revoked_at timestamptz;
alter table public.document_registry add column media_rights_revoked_by uuid references public.profiles(id);
alter table public.document_registry add column media_rights_revocation_reason text;
create function private.f1_media_rights_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if row(new.media_rights_revoked_at,new.media_rights_revoked_by,new.media_rights_revocation_reason) is distinct from row(old.media_rights_revoked_at,old.media_rights_revoked_by,old.media_rights_revocation_reason) and(old.media_rights_revoked_at is not null or not private.f1_writing(new.organization_id)) then raise exception 'f1_media_rights_protected' using errcode='42501';end if;return new;
end$$;
revoke all on function private.f1_media_rights_guard() from public,anon,authenticated,service_role;
create trigger f1_media_rights_revision before update on public.document_registry for each row execute function private.f1_media_rights_guard();
alter table public.events add column f1_revision bigint not null default 1;
alter table public.content_items add column f1_revision bigint not null default 1;
create trigger f1_event_revision before insert or update on public.events for each row execute function private.f1_revision_guard();
create trigger f1_content_revision before insert or update on public.content_items for each row execute function private.f1_revision_guard();
create table public.publication_revisions(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),source_type text not null check(source_type in('event','news')),source_id uuid not null,source_revision bigint not null,
 revision integer not null check(revision>0),schema_version text not null default 'besc-publication-v1' check(schema_version='besc-publication-v1'),
 payload jsonb not null,payload_sha256 text not null,status text not null default 'draft' check(status in('draft','in_review','changes_requested','approved_for_publication','withdrawn')),
 consent_id uuid references public.consent_records(id) on delete restrict,media_rights_document_id uuid references public.document_registry(id) on delete restrict,
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default clock_timestamp(),reviewed_by uuid references public.profiles(id),reviewed_at timestamptz,review_note text,withdrawn_at timestamptz,
 unique(organization_id,source_type,source_id,revision),unique(organization_id,id)
);
create index f1_publication_worklist on public.publication_revisions(organization_id,status,created_at desc);
create index f1_publication_consent on public.publication_revisions(consent_id);
create index f1_publication_media on public.publication_revisions(media_rights_document_id);
create index f1_publication_author on public.publication_revisions(created_by);
create index f1_publication_reviewer on public.publication_revisions(reviewed_by);
create function private.f1_publication_source(o uuid,t text,i uuid) returns bigint language plpgsql stable security definer set search_path='' as $$declare r bigint;begin
 if t='event' then select f1_revision into r from public.events where organization_id=o and id=i and deleted_at is null and status::text not in('cancelled','archived');
 elsif t='news' then select f1_revision into r from public.content_items where organization_id=o and id=i and deleted_at is null and status::text<>'archived';else raise exception 'f1_invalid_source';end if;
 if r is null then raise exception 'f1_source_unavailable' using errcode='42501';end if;return r;
end$$;
create function private.f1_public_payload(p jsonb,t text) returns jsonb language plpgsql immutable set search_path='' as $$declare a text[];m jsonb;h text;begin
 a:=array['title','summary','body','slug','locale','media'];if t='event' then a:=a||array['starts_at','ends_at','timezone','location_label','registration_url'];end if;
 if jsonb_typeof(p->'title') is distinct from 'string' or jsonb_typeof(p->'slug') is distinct from 'string' or jsonb_typeof(p->'locale') is distinct from 'string' or(p?'summary' and jsonb_typeof(p->'summary') is distinct from 'string') then raise exception 'f1_public_payload_invalid' using errcode='22023';end if;
 if jsonb_typeof(p) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p) k where not k=any(a)) or length(btrim(coalesce(p->>'title','')))<2 or length(p->>'title')>240 or length(coalesce(p->>'summary',''))>2000 or coalesce(p->>'slug','')!~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(p->>'slug')>160 or coalesce(p->>'locale','') not in('nl-BE','fr-BE','en') then raise exception 'f1_public_payload_invalid' using errcode='22023';end if;
 if p->'body'->>'format' is distinct from 'sanitized_html' or jsonb_typeof(p->'body')<>'object' or exists(select 1 from jsonb_object_keys(p->'body') k where k not in('format','value')) then raise exception 'f1_public_body_invalid';end if;
 h:=p->'body'->>'value';if jsonb_typeof(p->'body'->'value') is distinct from 'string' or h is null or length(h)>32000 or regexp_replace(h,'</?(p|strong|em|ul|ol|li|br)\s*/?>','','gi') ~ '[<>]' then raise exception 'f1_public_html_unsafe';end if;
 if jsonb_typeof(p->'media') is distinct from 'array' or jsonb_array_length(p->'media')>10 then raise exception 'f1_public_media_invalid';end if;
 for m in select value from jsonb_array_elements(p->'media') loop
  if jsonb_typeof(m)<>'object' or exists(select 1 from jsonb_object_keys(m) k where k not in('url','alt','credit')) or coalesce(m->>'url','')!~ '^https://[^[:space:]?#]+$' or lower(m->>'url') ~ '(localhost|127[.]|/sign/|/private/)' or length(btrim(coalesce(m->>'alt','')))<2 or length(m->>'alt')>500 or length(coalesce(m->>'credit',''))>500 then raise exception 'f1_public_media_unsafe';end if;
 end loop;
 if t='event' then
  if jsonb_typeof(p->'starts_at') is distinct from 'string' or jsonb_typeof(p->'ends_at') is distinct from 'string' or(p?'location_label' and jsonb_typeof(p->'location_label') is distinct from 'string') or(p?'registration_url' and jsonb_typeof(p->'registration_url') is distinct from 'string') then raise exception 'f1_public_payload_invalid';end if;
  if nullif(p->>'starts_at','')::timestamptz is null or nullif(p->>'ends_at','')::timestamptz is null or(p->>'ends_at')::timestamptz<=(p->>'starts_at')::timestamptz or p->>'timezone' is distinct from 'Europe/Brussels' then raise exception 'f1_event_time_required';end if;
  if nullif(p->>'registration_url','') is not null and (p->>'registration_url'!~ '^https://[^[:space:]]+$' or lower(p->>'registration_url') ~ '(localhost|127[.]|javascript:|/sign/|/private/)') then raise exception 'f1_public_url_unsafe';end if;
 end if;
 return p;
end$$;
create function private.f1_publication_valid(o uuid,i uuid) returns boolean language plpgsql stable security definer set search_path='' as $$declare x public.publication_revisions;begin
 select * into x from public.publication_revisions where organization_id=o and id=i and status='approved_for_publication';if not found then return false;end if;
 if x.consent_id is not null and not private.f1_consent_valid(o,x.consent_id) then return false;end if;
 begin perform private.f1_publication_source(o,x.source_type,x.source_id);exception when others then return false;end;
 if x.media_rights_document_id is not null and not exists(select 1 from public.document_registry where id=x.media_rights_document_id and organization_id=o and media_rights_revoked_at is null) then return false;end if;return true;
end$$;
create function private.f1_publication(o uuid,op text,d jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare answer uuid;rev bigint;n integer;payload jsonb;x public.publication_revisions;src jsonb;begin
 if op='publication.revoke_media' then
  if not(private.f1_role(o,'publication_editor') or private.f1_role(o,'publication_reviewer')) or not private.f1_document_visible(o,(d->>'document_id')::uuid) then raise exception 'f1_not_authorized' using errcode='42501';end if;
  if length(btrim(coalesce(d->>'reason','')))<2 then raise exception 'f1_reason_required';end if;
  update public.document_registry set media_rights_revoked_at=clock_timestamp(),media_rights_revoked_by=auth.uid(),media_rights_revocation_reason=left(d->>'reason',2000) where organization_id=o and id=(d->>'document_id')::uuid and media_rights_revoked_at is null returning id into answer;
 elsif op='publication.draft' then
  if not private.f1_role(o,'publication_editor') then raise exception 'f1_publication_editor_required' using errcode='42501';end if;
  rev:=private.f1_publication_source(o,d->>'source_type',(d->>'source_id')::uuid);
  if rev is distinct from(d->>'expected_revision')::bigint then raise exception 'f1_revision_conflict' using errcode='40001';end if;
  payload:=private.f1_public_payload(d->'payload',d->>'source_type');
  if d->>'source_type'='event' then
   select to_jsonb(e) into src from public.events e where organization_id=o and id=(d->>'source_id')::uuid;
   if nullif(src->>'start_at','') is null or nullif(src->>'end_at','') is null then raise exception 'f1_source_event_time_unknown';end if;
   if (payload->>'starts_at')::timestamptz<>(src->>'start_at')::timestamptz or (payload->>'ends_at')::timestamptz<>(src->>'end_at')::timestamptz then raise exception 'f1_event_source_time_mismatch';end if;
  end if;
  if nullif(d->>'consent_id','') is not null and not private.f1_consent_valid(o,(d->>'consent_id')::uuid) then raise exception 'f1_consent_unavailable';end if;
  if nullif(d->>'consent_id','') is not null and not exists(select 1 from public.consent_records c join public.processing_purposes p on p.id=c.purpose_id and p.organization_id=c.organization_id where c.id=(d->>'consent_id')::uuid and c.organization_id=o and p.purpose_code='public_profile') then raise exception 'f1_public_consent_purpose_required';end if;
  if jsonb_array_length(payload->'media')>0 and(nullif(d->>'media_rights_document_id','') is null or not private.f1_document_visible(o,(d->>'media_rights_document_id')::uuid)) then raise exception 'f1_media_rights_required';end if;
  if nullif(d->>'media_rights_document_id','') is not null and not exists(select 1 from public.document_registry where organization_id=o and id=(d->>'media_rights_document_id')::uuid and media_rights_revoked_at is null) then raise exception 'f1_media_rights_required';end if;
  select coalesce(max(revision),0)+1 into n from public.publication_revisions where organization_id=o and source_type=d->>'source_type' and source_id=(d->>'source_id')::uuid;
  insert into public.publication_revisions(organization_id,source_type,source_id,source_revision,revision,payload,payload_sha256,consent_id,media_rights_document_id,created_by) values(o,d->>'source_type',(d->>'source_id')::uuid,rev,n,payload,encode(sha256(convert_to(payload::text,'UTF8')),'hex'),nullif(d->>'consent_id','')::uuid,nullif(d->>'media_rights_document_id','')::uuid,auth.uid()) returning id into answer;
 elsif op in('publication.submit','publication.review','publication.withdraw') then
  select * into x from public.publication_revisions where organization_id=o and id=(d->>'id')::uuid;
  if not found or x.payload_sha256 is distinct from d->>'expected_hash' then raise exception 'f1_revision_conflict' using errcode='40001';end if;
  if op='publication.submit' then
   if not private.f1_role(o,'publication_editor') or x.status<>'draft' then raise exception 'f1_submit_not_allowed' using errcode='42501';end if;
   update public.publication_revisions set status='in_review' where id=x.id;
  elsif op='publication.review' then
   if not private.f1_role(o,'publication_reviewer') or x.status<>'in_review' or d->>'rights_confirmed' is distinct from 'true' then raise exception 'f1_publication_review_not_allowed' using errcode='42501';end if;
   rev:=private.f1_publication_source(o,x.source_type,x.source_id);if rev<>x.source_revision then raise exception 'f1_revision_conflict' using errcode='40001';end if;
   if x.consent_id is not null and not private.f1_consent_valid(o,x.consent_id) then raise exception 'f1_consent_unavailable';end if;
   if x.media_rights_document_id is not null and(not private.f1_document_visible(o,x.media_rights_document_id) or not exists(select 1 from public.document_registry where id=x.media_rights_document_id and organization_id=o and media_rights_revoked_at is null)) then raise exception 'f1_media_rights_required';end if;
   if d->>'decision' not in('approved_for_publication','changes_requested') or length(btrim(coalesce(d->>'reason','')))<2 then raise exception 'f1_review_required';end if;
   update public.publication_revisions set status=d->>'decision',reviewed_by=auth.uid(),reviewed_at=clock_timestamp(),review_note=d->>'reason' where id=x.id;
  else
   if not(private.f1_role(o,'publication_editor') or private.f1_role(o,'publication_reviewer')) then raise exception 'f1_not_authorized' using errcode='42501';end if;
   update public.publication_revisions set status='withdrawn',withdrawn_at=coalesce(withdrawn_at,clock_timestamp()) where id=x.id;
  end if;answer:=x.id;
 else raise exception 'f1_unknown_operation';end if;if answer is null then raise exception 'f1_not_available';end if;return jsonb_build_object('id',answer);
end$$;
revoke all on function private.f1_publication_source(uuid,text,uuid),private.f1_public_payload(jsonb,text),private.f1_publication_valid(uuid,uuid),private.f1_publication(uuid,text,jsonb) from public,anon,authenticated,service_role;
alter table public.publication_revisions enable row level security;
revoke all on public.publication_revisions from public,anon,authenticated,service_role;
grant select on public.publication_revisions to authenticated;
create policy f1_publication_read on public.publication_revisions for select to authenticated using(private.f1_role(organization_id,'publication_editor') or private.f1_role(organization_id,'publication_reviewer'));
create function public.f1_publication_preview(p_organization_id uuid,p_revision_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare x public.publication_revisions;begin
 if not(private.f1_role(p_organization_id,'publication_editor') or private.f1_role(p_organization_id,'publication_reviewer')) then raise exception 'f1_not_authorized' using errcode='42501';end if;
 select * into x from public.publication_revisions where organization_id=p_organization_id and id=p_revision_id;
 if not found then raise exception 'f1_not_available' using errcode='42501';end if;
 return jsonb_build_object('id',x.id,'source_revision',x.source_revision,'revision',x.revision,'payload',x.payload,'hash',x.payload_sha256,'status',x.status,'valid',private.f1_publication_valid(p_organization_id,x.id),'publicly_served',false);
end$$;
create function public.f1_capabilities(p_organization_id uuid) returns jsonb language sql stable security definer set search_path='' as $$select jsonb_build_object('chair',private.f1_chair(p_organization_id),'governance',private.f1_role(p_organization_id,'governance_editor'),'consent',private.f1_role(p_organization_id,'consent_registrar'),'partners',private.f1_role(p_organization_id,'partner_editor'),'publication_editor',private.f1_role(p_organization_id,'publication_editor'),'publication_reviewer',private.f1_role(p_organization_id,'publication_reviewer'))$$;
revoke all on function public.f1_publication_preview(uuid,uuid),public.f1_capabilities(uuid) from public,anon,authenticated,service_role;
grant execute on function public.f1_publication_preview(uuid,uuid),public.f1_capabilities(uuid) to authenticated;
create function private.f1_validate(op text,d jsonb) returns void language plpgsql immutable set search_path='' as $$declare allowed text;begin
 allowed:=case op
 when 'identity.verify' then 'member_id person_id account_user_id proof_document_id expected_revision'
 when 'identity.revoke' then 'id reason' when 'identity.assign' then 'user_id role' when 'identity.unassign' then 'id'
 when 'governance.evidence' then 'document_id source_version preserved_reference evidence_type content_sha256'
 when 'governance.evidence_check' then 'id reason' when 'governance.evidence_withdraw' then 'id reason'
 when 'governance.review' then 'source_type source_id expected_revision dimension outcome evidence_id reason conflict_declared'
 when 'governance.decide' then 'source_type source_id expected_revision rule_review_id applicability_review_id execution_review_id body authority_basis governing_body task_id conflict_declared'
 when 'consent.purpose' then 'purpose_code text_version title body allowed_scope legal_basis retention_policy policy_document_id'
 when 'consent.activate_purpose' then 'id policy_confirmed' when 'consent.withdraw_purpose' then 'id policy_confirmed'
 when 'consent.give' then 'purpose_id scope accepted expires_at' when 'consent.record_external' then 'purpose_id scope person_id external_evidence_id expires_at'
 when 'consent.withdraw' then 'id reason'
 when 'partner.role' then 'partner_id role valid_from valid_until proof_document_id' when 'partner.revoke' then 'id'
 when 'partner.relate' then 'partner_id source_type source_id contribution_role'
 when 'partner.campaign' then 'values deliverables contribution_role'
 when 'publication.draft' then 'source_type source_id expected_revision payload consent_id media_rights_document_id'
 when 'publication.submit' then 'id expected_hash' when 'publication.withdraw' then 'id expected_hash'
 when 'publication.revoke_media' then 'document_id reason'
 when 'publication.review' then 'id expected_hash decision reason rights_confirmed' else null end;
 if allowed is null or exists(select 1 from jsonb_object_keys(d) k where not k=any(string_to_array(allowed,' '))) then raise exception 'f1_invalid_fields' using errcode='22023';end if;
end$$;
revoke all on function private.f1_validate(text,jsonb) from public,anon,authenticated,service_role;
create function public.f1_publication_consents(p_organization_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not(private.f1_role(p_organization_id,'publication_editor') or private.f1_role(p_organization_id,'publication_reviewer')) then raise exception 'f1_not_authorized' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'label',p.title||' · versie '||p.text_version||' · '||cp.display_name)) from public.consent_records c join public.processing_purposes p on p.id=c.purpose_id and p.organization_id=c.organization_id join public.community_people cp on cp.id=c.person_id and cp.organization_id=c.organization_id where c.organization_id=p_organization_id and p.purpose_code='public_profile' and private.f1_consent_valid(p_organization_id,c.id)),'[]'::jsonb);
end$$;
revoke all on function public.f1_publication_consents(uuid) from public,anon,authenticated,service_role;
grant execute on function public.f1_publication_consents(uuid) to authenticated;
commit;
