begin;
-- Additive staging only. No existing source rows, roles or publication approvals change.
create table public.publication_sites (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 host text not null check(host='website-dev.belgianstreamerscommunity.be'), channel text not null default 'staging' check(channel='staging'),
 active boolean not null default false, key_sha256 text not null check(key_sha256~'^[a-f0-9]{64}$'), created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default clock_timestamp(), unique(organization_id,id), unique(host)
);
create table public.publication_site_viewers (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, site_id uuid not null,
 user_id uuid not null references public.profiles(id), eligibility text not null check(eligibility in('crew','volunteer')),
 basis text not null check(length(btrim(basis)) between 2 and 2000),
 valid_until timestamptz not null, revoked_at timestamptz, created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default clock_timestamp(),
 foreign key(organization_id,site_id) references public.publication_sites(organization_id,id), check(valid_until>created_at)
);
create unique index publication_one_current_viewer on public.publication_site_viewers(site_id,user_id) where revoked_at is null;
create table public.publication_entries (
 public_id uuid primary key default gen_random_uuid(), organization_id uuid not null, site_id uuid not null,
 source_type text not null check(source_type in('event','news')), source_id uuid not null,
 locale text not null check(locale in('nl-BE','fr-BE','en')), slug text not null check(length(slug)<=160 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 selected_revision_id uuid not null, epoch bigint not null default 1 check(epoch>0),
 published_at timestamptz not null, valid_until timestamptz, withdrawn_at timestamptz,
 foreign key(organization_id,site_id) references public.publication_sites(organization_id,id),
 foreign key(organization_id,selected_revision_id) references public.publication_revisions(organization_id,id),
 unique(organization_id,public_id),unique(site_id,source_type,locale,slug),unique(site_id,source_type,source_id,locale),
 check(valid_until is null or valid_until>published_at)
);
create index publication_list_order on public.publication_entries(site_id,source_type,locale,published_at desc,public_id desc);
create table public.publication_release_events (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, entry_id uuid not null,
 actor uuid not null references public.profiles(id), operation text not null check(operation in('release','withdraw')),
 revision_id uuid not null, payload_sha256 text not null, epoch bigint not null,
 reason text not null, created_at timestamptz not null default clock_timestamp(),
 foreign key(organization_id,entry_id) references public.publication_entries(organization_id,public_id),
 foreign key(organization_id,revision_id) references public.publication_revisions(organization_id,id)
);
create table private.f2_receipts (
 organization_id uuid not null, actor uuid not null, request_id uuid not null, operation text not null,
 payload jsonb not null, result jsonb not null, primary key(organization_id,actor,request_id)
);
create table public.publication_media (
 public_media_id uuid primary key default gen_random_uuid(),organization_id uuid not null,site_id uuid not null,
 document_id uuid not null,storage_path text not null unique,
 sha256 text not null check(sha256~'^[a-f0-9]{64}$'),mime text not null check(mime in('image/png','image/webp')),
 bytes integer not null check(bytes between 1 and 2097152),width integer not null check(width between 1 and 4096),height integer not null check(height between 1 and 4096),
 created_by uuid not null references public.profiles(id),revoked_at timestamptz,created_at timestamptz not null default clock_timestamp(),
 foreign key(organization_id,site_id) references public.publication_sites(organization_id,id),
 foreign key(document_id) references public.document_registry(id),
 check(storage_path ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}[.](png|webp)$')
);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('website-staging-media','website-staging-media',false,2097152,array['image/png','image/webp']);
-- A restrictive fence also protects against future broad permissive Storage policies.
create policy f2_private_media_fence on storage.objects as restrictive for all to anon,authenticated
using(bucket_id<>'website-staging-media') with check(bucket_id<>'website-staging-media');

create function private.f2_account(o uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.f1_human(o) and exists(select 1 from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp()))
 and exists(select 1 from auth.sessions s where s.user_id=auth.uid() and s.id::text=auth.jwt()->>'session_id')
$$;
create function private.f2_viewer(s uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.publication_sites p join public.publication_site_viewers v on v.site_id=p.id and v.organization_id=p.organization_id
 where p.id=s and p.active and v.user_id=auth.uid() and v.revoked_at is null and v.valid_until>clock_timestamp() and private.f2_account(p.organization_id))
$$;
create function private.f2_valid(e public.publication_entries) returns boolean language sql stable security definer set search_path='' as $$
 select e.withdrawn_at is null and e.published_at<=clock_timestamp() and (e.valid_until is null or e.valid_until>clock_timestamp())
 and private.f1_publication_valid(e.organization_id,e.selected_revision_id)
 and exists(select 1 from public.publication_sites where id=e.site_id and organization_id=e.organization_id and active)
 and not exists(select 1 from public.publication_revisions r cross join lateral jsonb_array_elements(r.payload->'media') m
 where r.id=e.selected_revision_id and not exists(select 1 from public.publication_media a join public.publication_sites s on s.id=a.site_id join public.document_registry d on d.id=a.document_id and d.organization_id=a.organization_id
 where a.site_id=e.site_id and a.organization_id=e.organization_id and a.revoked_at is null and d.media_rights_revoked_at is null
 and a.document_id=r.media_rights_document_id and m->>'url'='https://'||s.host||'/media/'||a.public_media_id::text))
$$;
create function private.f2_project(e public.publication_entries) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('schema_version','besc-website-publication-v1','type',e.source_type,'public_id',e.public_id,'revision',r.revision,
 'slug',e.slug,'locale',e.locale,'title',r.payload->>'title','summary',coalesce(r.payload->>'summary',''),'body',r.payload->'body',
 'media',coalesce((select jsonb_agg(jsonb_build_object('public_media_id',a.public_media_id,'alt',m->>'alt','credit',coalesce(m->>'credit','')) order by ord)
 from jsonb_array_elements(r.payload->'media') with ordinality x(m,ord) join public.publication_media a on a.site_id=e.site_id and a.organization_id=e.organization_id
 join public.publication_sites s on s.id=a.site_id where m->>'url'='https://'||s.host||'/media/'||a.public_media_id::text),'[]'::jsonb),
 'published_at',to_char(e.published_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))
 ||case when e.source_type='event' then jsonb_build_object('starts_at',r.payload->'starts_at','ends_at',r.payload->'ends_at','timezone','Europe/Brussels','location_label',coalesce(r.payload->>'location_label',''),'registration_url',nullif(r.payload->>'registration_url','')) else '{}'::jsonb end
 from public.publication_revisions r where r.id=e.selected_revision_id and r.organization_id=e.organization_id
$$;

create function public.f2_workflow(p_organization_id uuid,p_operation text,p_data jsonb,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o uuid:=p_organization_id; d jsonb:=p_data; op text:=p_operation; prev private.f2_receipts; s public.publication_sites; r public.publication_revisions; e public.publication_entries; answer jsonb; ident uuid; allowed text; t timestamptz; until_t timestamptz;
begin
 if not private.f2_account(o) or p_request_id is null then raise exception 'f2_not_authorized' using errcode='42501';end if;
 allowed:=case op when 'site.create' then 'host key_sha256' when 'site.state' then 'site_id active' when 'site.key' then 'site_id key_sha256'
 when 'viewer.add' then 'site_id user_id eligibility basis valid_until' when 'viewer.withdraw' then 'id reason'
 when 'release' then 'site_id revision_id expected_hash expected_epoch published_at valid_until reason'
 when 'withdraw' then 'entry_id expected_epoch reason'
 when 'media.register' then 'site_id public_media_id document_id storage_path sha256 mime bytes width height'
 when 'media.withdraw' then 'public_media_id reason' else null end;
 if allowed is null or d is null or jsonb_typeof(d)<>'object' or octet_length(d::text)>16000 or exists(select 1 from jsonb_object_keys(d) k where not k=any(string_to_array(allowed,' '))) then raise exception 'f2_invalid_input' using errcode='22023';end if;
 -- Same ordering as all F1 revocation/approval/source mutations.
 perform private.f1_lock();
 if op like 'site.%' or op like 'viewer.%' then
  if not private.f1_chair(o) then raise exception 'f2_chair_required' using errcode='42501';end if;
 elsif op='release' then
  if not private.f1_role(o,'publication_reviewer') then raise exception 'f2_reviewer_required' using errcode='42501';end if;
 elsif not(private.f1_role(o,'publication_editor') or private.f1_role(o,'publication_reviewer')) then raise exception 'f2_editor_required' using errcode='42501';end if;
 select * into prev from private.f2_receipts where organization_id=o and actor=auth.uid() and request_id=p_request_id;
 if found then
  if prev.operation<>op or prev.payload<>d then raise exception 'f2_request_conflict' using errcode='40001';end if;
  -- Replay returns its original receipt only; never executes the effect again.
  return prev.result;
 end if;
 if op='site.create' then
  insert into public.publication_sites(organization_id,host,key_sha256,created_by) values(o,d->>'host',d->>'key_sha256',auth.uid()) returning id into ident;
 elsif op='site.key' then
  update public.publication_sites set key_sha256=d->>'key_sha256' where id=(d->>'site_id')::uuid and organization_id=o returning id into ident;
 elsif op='site.state' then
  if jsonb_typeof(d->'active')<>'boolean' then raise exception 'f2_invalid_input';end if;
  update public.publication_sites set active=(d->>'active')::boolean where id=(d->>'site_id')::uuid and organization_id=o returning id into ident;
 elsif op='viewer.add' then
  if not exists(select 1 from public.publication_sites where id=(d->>'site_id')::uuid and organization_id=o) or not exists(select 1 from public.organization_members m join auth.users u on u.id=m.user_id where m.organization_id=o and m.user_id=(d->>'user_id')::uuid and m.status='active' and u.email_confirmed_at is not null and u.deleted_at is null and(u.banned_until is null or u.banned_until<=clock_timestamp())) then raise exception 'f2_viewer_unavailable';end if;
  t:=(d->>'valid_until')::timestamptz;if t<=clock_timestamp() or t>clock_timestamp()+interval '90 days' then raise exception 'f2_viewer_expiry_required';end if;
  insert into public.publication_site_viewers(organization_id,site_id,user_id,eligibility,basis,valid_until,created_by)
  values(o,(d->>'site_id')::uuid,(d->>'user_id')::uuid,d->>'eligibility',d->>'basis',t,auth.uid()) returning id into ident;
 elsif op='viewer.withdraw' then
  if length(btrim(coalesce(d->>'reason','')))<2 then raise exception 'f2_reason_required';end if;
  update public.publication_site_viewers set revoked_at=clock_timestamp() where id=(d->>'id')::uuid and organization_id=o and revoked_at is null returning id into ident;
 elsif op='release' then
  select * into s from public.publication_sites where id=(d->>'site_id')::uuid and organization_id=o and active;
  if not found then raise exception 'f2_site_unavailable';end if;
  select * into r from public.publication_revisions where id=(d->>'revision_id')::uuid and organization_id=o;
  if not found or r.payload_sha256 is distinct from d->>'expected_hash' or not private.f1_publication_valid(o,r.id) then raise exception 'f2_revision_conflict' using errcode='40001';end if;
  if r.source_type='event' and length(btrim(coalesce(r.payload->>'location_label','')))=0 then raise exception 'f2_location_required';end if;
  if length(btrim(coalesce(d->>'reason','')))<2 then raise exception 'f2_reason_required';end if;
  t:=coalesce(nullif(d->>'published_at','')::timestamptz,clock_timestamp());until_t:=nullif(d->>'valid_until','')::timestamptz;
  if until_t is not null and until_t<=t then raise exception 'f2_invalid_window';end if;
  select * into e from public.publication_entries where site_id=s.id and source_type=r.source_type and source_id=r.source_id and locale=r.payload->>'locale' for update;
  if found then
   if e.epoch is distinct from (d->>'expected_epoch')::bigint or e.slug<>r.payload->>'slug' then raise exception 'f2_revision_conflict' using errcode='40001';end if;
   update public.publication_entries set selected_revision_id=r.id,epoch=epoch+1,published_at=t,valid_until=until_t,withdrawn_at=null where public_id=e.public_id returning * into e;
  else
   if (d->>'expected_epoch')::bigint is distinct from 0::bigint then raise exception 'f2_revision_conflict' using errcode='40001';end if;
   insert into public.publication_entries(organization_id,site_id,source_type,source_id,locale,slug,selected_revision_id,published_at,valid_until)
   values(o,s.id,r.source_type,r.source_id,r.payload->>'locale',r.payload->>'slug',r.id,t,until_t) returning * into e;
  end if;
  -- Validate all media even for a future scheduled publication.
  if exists(select 1 from jsonb_array_elements(r.payload->'media') m where not exists(select 1 from public.publication_media a join public.document_registry doc on doc.id=a.document_id and doc.organization_id=o
   where a.site_id=s.id and a.organization_id=o and a.document_id=r.media_rights_document_id and a.revoked_at is null and doc.media_rights_revoked_at is null and m->>'url'='https://'||s.host||'/media/'||a.public_media_id::text)) then raise exception 'f2_media_unavailable';end if;
  ident:=e.public_id;
  insert into public.publication_release_events(organization_id,entry_id,actor,operation,revision_id,payload_sha256,epoch,reason) values(o,ident,auth.uid(),'release',r.id,r.payload_sha256,e.epoch,d->>'reason');
 elsif op='withdraw' then
  if length(btrim(coalesce(d->>'reason','')))<2 then raise exception 'f2_reason_required';end if;
  select * into e from public.publication_entries where public_id=(d->>'entry_id')::uuid and organization_id=o for update;
  if not found or e.epoch is distinct from (d->>'expected_epoch')::bigint or e.withdrawn_at is not null then raise exception 'f2_revision_conflict' using errcode='40001';end if;
  update public.publication_entries set withdrawn_at=clock_timestamp(),epoch=epoch+1 where public_id=e.public_id returning * into e;
  select * into r from public.publication_revisions where id=e.selected_revision_id;
  ident:=e.public_id;insert into public.publication_release_events(organization_id,entry_id,actor,operation,revision_id,payload_sha256,epoch,reason) values(o,ident,auth.uid(),'withdraw',r.id,r.payload_sha256,e.epoch,d->>'reason');
 elsif op='media.register' then
  if not exists(select 1 from public.publication_sites where id=(d->>'site_id')::uuid and organization_id=o) or not private.f1_document_visible(o,(d->>'document_id')::uuid) or not exists(select 1 from public.document_registry where id=(d->>'document_id')::uuid and organization_id=o and media_rights_revoked_at is null) then raise exception 'f2_media_unavailable';end if;
  if d->>'storage_path' is distinct from (o::text||'/'||(d->>'public_media_id')||(case when d->>'mime'='image/png' then '.png' else '.webp' end)) then raise exception 'f2_media_path';end if;
  if not exists(select 1 from storage.objects where bucket_id='website-staging-media' and name=d->>'storage_path' and(metadata->>'size')::bigint=(d->>'bytes')::bigint and metadata->>'mimetype'=d->>'mime') then raise exception 'f2_media_bytes_required';end if;
  insert into public.publication_media(public_media_id,organization_id,site_id,document_id,storage_path,sha256,mime,bytes,width,height,created_by)
  values((d->>'public_media_id')::uuid,o,(d->>'site_id')::uuid,(d->>'document_id')::uuid,d->>'storage_path',d->>'sha256',d->>'mime',(d->>'bytes')::int,(d->>'width')::int,(d->>'height')::int,auth.uid()) returning public_media_id into ident;
 elsif op='media.withdraw' then
  if length(btrim(coalesce(d->>'reason','')))<2 then raise exception 'f2_reason_required';end if;
  update public.publication_media set revoked_at=clock_timestamp() where public_media_id=(d->>'public_media_id')::uuid and organization_id=o and revoked_at is null returning public_media_id into ident;
 end if;
 if ident is null then raise exception 'f2_not_available' using errcode='42501';end if;
 answer:=jsonb_build_object('id',ident);perform private.f1_audit(o,ident,'f2.'||op);
 insert into private.f2_receipts values(o,auth.uid(),p_request_id,op,d,answer);return answer;
end$$;

create function public.f2_publications(p_site_id uuid,p_type text,p_slug text default null,p_locale text default 'nl-BE',p_limit integer default 20,p_before_time timestamptz default null,p_before_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$declare result jsonb;begin
 if not private.f2_viewer(p_site_id) then raise exception 'f2_not_authorized' using errcode='42501';end if;
 if p_type is null or p_locale is null or p_limit is null or p_type not in('event','news') or p_locale not in('nl-BE','fr-BE','en') or p_limit not between 1 and 50 or (p_before_time is null)<>(p_before_id is null) or(p_slug is not null and p_slug!~'^[a-z0-9]+(-[a-z0-9]+)*$') then raise exception 'f2_invalid_input' using errcode='22023';end if;
 select coalesce(jsonb_agg(private.f2_project(x) order by x.published_at desc,x.public_id desc),'[]'::jsonb) into result
 from(select e.* from public.publication_entries e where e.site_id=p_site_id and e.source_type=p_type and e.locale=p_locale and(p_slug is null or e.slug=p_slug) and private.f2_valid(e)
 and(p_before_time is null or(e.published_at,e.public_id)<(p_before_time,p_before_id)) order by e.published_at desc,e.public_id desc limit p_limit) x;
 return result;
end$$;
create function public.f2_media_locator(p_site_id uuid,p_media_id uuid,p_server_key text) returns jsonb language plpgsql stable security definer set search_path='' as $$declare a public.publication_media;begin
 if not private.f2_viewer(p_site_id) or length(p_server_key) not between 32 and 256 or not exists(select 1 from public.publication_sites where id=p_site_id and key_sha256=encode(sha256(convert_to(p_server_key,'UTF8')),'hex')) then raise exception 'f2_not_authorized' using errcode='42501';end if;
 select * into a from public.publication_media where public_media_id=p_media_id and site_id=p_site_id and revoked_at is null;
 if not found or not exists(select 1 from public.publication_entries e join public.publication_revisions r on r.id=e.selected_revision_id join public.publication_sites s on s.id=e.site_id where e.site_id=p_site_id and private.f2_valid(e) and exists(select 1 from jsonb_array_elements(r.payload->'media') m where m->>'url'='https://'||s.host||'/media/'||p_media_id::text)) then return null;end if;
 return jsonb_build_object('path',a.storage_path,'sha256',a.sha256,'mime',a.mime,'bytes',a.bytes);
end$$;
-- Locator includes a private path and requires BOTH viewer authorization and
-- possession of the separate server-only site key. Never return it to a browser.
revoke all on function private.f2_account(uuid),private.f2_viewer(uuid),private.f2_valid(public.publication_entries),private.f2_project(public.publication_entries) from public,anon,authenticated,service_role;
revoke all on function public.f2_workflow(uuid,text,jsonb,uuid),public.f2_publications(uuid,text,text,text,integer,timestamptz,uuid),public.f2_media_locator(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.f2_workflow(uuid,text,jsonb,uuid),public.f2_publications(uuid,text,text,text,integer,timestamptz,uuid),public.f2_media_locator(uuid,uuid,text) to authenticated;

do $$declare tbl text;begin
 foreach tbl in array array['publication_sites','publication_site_viewers','publication_entries','publication_release_events','publication_media'] loop
  execute format('alter table public.%I enable row level security',tbl);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',tbl);
  execute format('grant select on public.%I to authenticated',tbl);
  execute format('create policy f2_managers_read on public.%I for select to authenticated using (private.f1_role(organization_id,''publication_editor'') or private.f1_role(organization_id,''publication_reviewer'') or private.f1_chair(organization_id))',tbl);
 end loop;
end$$;
revoke all on private.f2_receipts from public,anon,authenticated,service_role;
commit;
