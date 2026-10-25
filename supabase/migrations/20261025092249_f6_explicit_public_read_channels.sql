begin;
-- Additive and empty. No existing site, viewer, publication, role or flag changes.
create table private.public_website_channels (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 site_id uuid not null,
 origin text not null check(origin ~ '^https://[a-z0-9]([a-z0-9.-]*[a-z0-9])?$'),
 key_sha256 text not null check(key_sha256 ~ '^[a-f0-9]{64}$'),
 enabled boolean not null default false,
 version bigint not null default 1 check(version>0),
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default clock_timestamp(),
 foreign key(organization_id,site_id) references public.publication_sites(organization_id,id),
 unique(organization_id,id), unique(origin)
);
create table private.public_website_grants (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 channel_id uuid not null,
 kind text not null check(kind in('news','event','page')),
 entry_id uuid not null, revision_id uuid not null, entry_epoch bigint not null check(entry_epoch>0),
 granted_by uuid not null references public.profiles(id),
 reason text not null check(length(btrim(reason)) between 2 and 2000),
 created_at timestamptz not null default clock_timestamp(), revoked_at timestamptz,
 foreign key(organization_id,channel_id) references private.public_website_channels(organization_id,id)
);
create unique index public_website_one_grant on private.public_website_grants(channel_id,kind,entry_id) where revoked_at is null;
create index public_website_read on private.public_website_grants(channel_id,kind) where revoked_at is null;
alter table private.public_website_channels enable row level security;
alter table private.public_website_grants enable row level security;
revoke all on private.public_website_channels,private.public_website_grants from public,anon,authenticated,service_role;

-- Reuse the existing projection and validity gates, but require an additional
-- public grant pinned to the exact entry epoch and selected revision.
create function private.f6_public_projection(g private.public_website_grants) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c private.public_website_channels; n public.publication_entries; p private.site_content_entries;
begin
 if g.revoked_at is not null then return null; end if;
 select * into c from private.public_website_channels where id=g.channel_id and organization_id=g.organization_id;
 if not found then return null;end if;
 if g.kind in('news','event') then
  select * into n from public.publication_entries where public_id=g.entry_id and organization_id=g.organization_id and site_id=c.site_id and source_type=g.kind;
  if not found or n.selected_revision_id<>g.revision_id or n.epoch<>g.entry_epoch or not coalesce(private.f2_valid(n),false) then return null;end if;
  return private.f2_project(n);
 end if;
 select e.* into p from private.site_content_entries e join private.site_content_dossiers d on d.id=e.dossier_id and d.organization_id=e.organization_id
 where e.public_id=g.entry_id and e.organization_id=g.organization_id and e.site_id=c.site_id and d.kind='page';
 if not found or p.selected_revision_id<>g.revision_id or p.epoch<>g.entry_epoch or not coalesce(private.f4_content_entry(p),false) then return null;end if;
 return private.f4_content_project(p);
end$$;

create function public.f6_public_workflow(p_organization_id uuid,p_operation text,p_data jsonb,p_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare c private.public_website_channels; g private.public_website_grants; receipt private.f2_receipts;
 result jsonb; ident uuid; snapshot jsonb;
begin
 if not private.f2_account(p_organization_id) or not private.f1_chair(p_organization_id) then raise exception 'f6_not_authorized' using errcode='42501';end if;
 if p_request_id is null or p_data is null or jsonb_typeof(p_data)<>'object' or length(p_data::text)>16000 then raise exception 'f6_invalid_input' using errcode='22023';end if;
 -- Reuse bounded receipts with a separate operation namespace.
 perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||auth.uid()::text||p_request_id::text,0));
 select * into receipt from private.f2_receipts where organization_id=p_organization_id and actor=auth.uid() and request_id=p_request_id;
 if found then
  if receipt.operation is distinct from 'f6.public.'||p_operation or receipt.payload is distinct from p_data then raise exception 'f6_request_conflict' using errcode='40001';end if;
  return receipt.result;
 end if;
 if length(btrim(coalesce(p_data->>'reason',''))) not between 2 and 2000 then raise exception 'f6_reason_required' using errcode='22023';end if;
 if p_operation='channel.create' then
  if not exists(select 1 from public.publication_sites where id=(p_data->>'site_id')::uuid and organization_id=p_organization_id) then raise exception 'f6_not_available' using errcode='42501';end if;
  insert into private.public_website_channels(organization_id,site_id,origin,key_sha256,created_by)
   values(p_organization_id,(p_data->>'site_id')::uuid,p_data->>'origin',p_data->>'key_sha256',auth.uid()) returning id into ident;
 else
  select * into c from private.public_website_channels where id=(p_data->>'channel_id')::uuid and organization_id=p_organization_id for update;
  if not found then raise exception 'f6_not_available' using errcode='42501';end if;
  if c.version is distinct from (p_data->>'expected_version')::bigint then raise exception 'f6_revision_conflict' using errcode='40001';end if;
  if p_operation='channel.state' then
   if jsonb_typeof(p_data->'enabled') is distinct from 'boolean' then raise exception 'f6_invalid_input' using errcode='22023';end if;
   update private.public_website_channels set enabled=(p_data->>'enabled')::boolean,version=version+1 where id=c.id;ident:=c.id;
  elsif p_operation='channel.key' then
   update private.public_website_channels set key_sha256=p_data->>'key_sha256',version=version+1 where id=c.id;ident:=c.id;
  elsif p_operation='grant.add' then
   g.id:=gen_random_uuid();g.organization_id:=p_organization_id;g.channel_id:=c.id;g.kind:=p_data->>'kind';
   g.entry_id:=(p_data->>'entry_id')::uuid;g.revision_id:=(p_data->>'revision_id')::uuid;g.entry_epoch:=(p_data->>'entry_epoch')::bigint;
   if g.kind is null or g.kind not in('news','event','page') then raise exception 'f6_invalid_input' using errcode='22023';end if;
   snapshot:=private.f6_public_projection(g);if snapshot is null then raise exception 'f6_source_unavailable' using errcode='42501';end if;
   insert into private.public_website_grants(id,organization_id,channel_id,kind,entry_id,revision_id,entry_epoch,granted_by,reason)
    values(g.id,g.organization_id,g.channel_id,g.kind,g.entry_id,g.revision_id,g.entry_epoch,auth.uid(),p_data->>'reason');ident:=g.id;
   update private.public_website_channels set version=version+1 where id=c.id;
  elsif p_operation='grant.withdraw' then
   update private.public_website_grants set revoked_at=clock_timestamp() where id=(p_data->>'grant_id')::uuid and channel_id=c.id and organization_id=p_organization_id and revoked_at is null returning id into ident;
   if ident is null then raise exception 'f6_revision_conflict' using errcode='40001';end if;
   update private.public_website_channels set version=version+1 where id=c.id;
  else raise exception 'f6_invalid_operation' using errcode='22023';end if;
 end if;
 result:=jsonb_build_object('id',ident);
 perform private.f1_audit(p_organization_id,ident,'f6.public.'||p_operation);
 insert into private.f2_receipts values(p_organization_id,auth.uid(),p_request_id,'f6.public.'||p_operation,p_data,result);
 return result;
end$$;

create function private.f6_public_channel(p_channel_id uuid,p_server_key text) returns private.public_website_channels
language plpgsql stable security definer set search_path='' as $$declare c private.public_website_channels;begin
 if p_server_key is null or length(p_server_key) not between 32 and 256 then raise exception 'f6_not_authorized' using errcode='42501';end if;
 select * into c from private.public_website_channels where id=p_channel_id and enabled
  and key_sha256=encode(sha256(convert_to(p_server_key,'UTF8')),'hex');
 if not found then raise exception 'f6_not_authorized' using errcode='42501';end if;return c;
end$$;

create function public.f6_public_read(p_channel_id uuid,p_server_key text,p_kind text,p_slug text default null,p_locale text default 'nl-BE',p_limit integer default 20,p_before_time timestamptz default null,p_before_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$declare c private.public_website_channels;result jsonb;begin
 c:=private.f6_public_channel(p_channel_id,p_server_key);
 if p_kind is null or p_kind not in('news','event','page') or p_locale is null or p_locale not in('nl-BE','fr-BE','en') or p_limit is null or p_limit not between 1 and 50 or (p_before_time is null)<>(p_before_id is null) or(p_slug is not null and(length(p_slug)>160 or p_slug!~'^[a-z0-9]+(-[a-z0-9]+)*$')) then raise exception 'f6_invalid_input' using errcode='22023';end if;
 select coalesce(jsonb_agg(x.payload order by (x.payload->>'published_at')::timestamptz desc,(x.payload->>'public_id')::uuid desc),'[]'::jsonb) into result
 from(select q.payload from private.public_website_grants g cross join lateral(select private.f6_public_projection(g) as payload)q
 where g.channel_id=c.id and g.organization_id=c.organization_id and g.kind=p_kind and g.revoked_at is null and q.payload is not null
 and q.payload->>'locale'=p_locale and(p_slug is null or q.payload->>'slug'=p_slug)
 and(p_before_time is null or((q.payload->>'published_at')::timestamptz,(q.payload->>'public_id')::uuid)<(p_before_time,p_before_id))
 order by(q.payload->>'published_at')::timestamptz desc,(q.payload->>'public_id')::uuid desc limit p_limit)x;
 return result;
end$$;

create function public.f6_public_media(p_channel_id uuid,p_server_key text,p_media_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$declare c private.public_website_channels;m public.publication_media;begin
 c:=private.f6_public_channel(p_channel_id,p_server_key);
 select * into m from public.publication_media where public_media_id=p_media_id and organization_id=c.organization_id and site_id=c.site_id and revoked_at is null;
 if not found then return null;end if;
 if not exists(select 1 from private.public_website_grants g cross join lateral(select private.f6_public_projection(g) as payload)q
  where g.channel_id=c.id and g.organization_id=c.organization_id and g.revoked_at is null and q.payload is not null
  and((g.kind='page' and q.payload->'hero'->>'public_media_id'=p_media_id::text)
   or(g.kind in('news','event')and exists(select 1 from jsonb_array_elements(q.payload->'media')x where x->>'public_media_id'=p_media_id::text))))then return null;end if;
 return jsonb_build_object('path',m.storage_path,'mime',m.mime,'bytes',m.bytes,'sha256',m.sha256);
end$$;

revoke all on function private.f6_public_projection(private.public_website_grants),private.f6_public_channel(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.f6_public_workflow(uuid,text,jsonb,uuid),public.f6_public_read(uuid,text,text,text,text,integer,timestamptz,uuid),public.f6_public_media(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.f6_public_workflow(uuid,text,jsonb,uuid) to authenticated;
grant execute on function public.f6_public_read(uuid,text,text,text,text,integer,timestamptz,uuid),public.f6_public_media(uuid,text,uuid) to service_role;

create function public.f6_public_status(p_organization_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$begin
 if not private.f2_account(p_organization_id) or not private.f1_chair(p_organization_id) then raise exception 'f6_not_authorized' using errcode='42501';end if;
 return jsonb_build_object(
  'channels',(select coalesce(jsonb_agg(to_jsonb(c)-'key_sha256'),'[]')from(select * from private.public_website_channels where organization_id=p_organization_id order by created_at,id limit 100)c),
  'grants',(select coalesce(jsonb_agg(to_jsonb(g)||jsonb_build_object('available',private.f6_public_projection(g)is not null)),'[]')from(select * from private.public_website_grants where organization_id=p_organization_id order by created_at desc,id limit 100)g),
  'candidates',(select coalesce(jsonb_agg(x.item),'[]')from(
   (select jsonb_build_object('entry_id',e.public_id,'site_id',e.site_id,'kind',e.source_type,'revision_id',e.selected_revision_id,'entry_epoch',e.epoch,'title',r.payload->>'title')item from public.publication_entries e join public.publication_revisions r on r.id=e.selected_revision_id where e.organization_id=p_organization_id and private.f2_valid(e) order by e.published_at desc,e.public_id limit 100)
   union all
   (select jsonb_build_object('entry_id',e.public_id,'site_id',e.site_id,'kind','page','revision_id',e.selected_revision_id,'entry_epoch',e.epoch,'title',r.payload->>'title')item from private.site_content_entries e join private.site_content_revisions r on r.id=e.selected_revision_id join private.site_content_dossiers d on d.id=e.dossier_id where e.organization_id=p_organization_id and d.kind='page'and private.f4_content_entry(e) order by e.published_at desc,e.public_id limit 100)
  )x)
 );
end$$;
revoke all on function public.f6_public_status(uuid) from public,anon,authenticated,service_role;
grant execute on function public.f6_public_status(uuid) to authenticated;

commit;
