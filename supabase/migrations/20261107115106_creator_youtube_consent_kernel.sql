-- Local-first kernel: no routes, scheduler, seed, or existing account changes.
create table private.cy_links (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 owner_id uuid not null references public.profiles(id), request_id uuid not null, consent jsonb not null,
 channel_id text not null check(channel_id~'^UC[A-Za-z0-9_-]{22}$'), video_ids text[] not null,
 start_date date not null,end_date date not null,valid_until timestamptz not null,retain_until timestamptz not null,
 status text not null default 'pending' check(status in('pending','active','revoked')),generation integer not null default 1,
 provider_revocation text not null default 'none' check(provider_revocation in('none','pending','failed','complete')),
 created_at timestamptz not null default clock_timestamp(),revoked_at timestamptz,
 unique(organization_id,owner_id,request_id),check(end_date>=start_date),check(retain_until>=valid_until)
);
create unique index cy_one_live_channel on private.cy_links(organization_id,channel_id) where status<>'revoked';
create table private.cy_credentials (
 link_id uuid primary key references private.cy_links(id), access_ref uuid not null,refresh_ref uuid not null,expires_at timestamptz not null
);
create table private.cy_jobs (
 id uuid primary key default gen_random_uuid(),link_id uuid not null references private.cy_links(id),session_id uuid not null,
 kind text not null check(kind in('authorize','refresh','collect','revoke')),generation integer not null,
 request_id uuid not null,input jsonb not null,used boolean not null default false,
 expires_at timestamptz not null default clock_timestamp()+interval '5 minutes',unique(link_id,request_id)
);
create table private.cy_samples (
 id uuid primary key default gen_random_uuid(),link_id uuid not null references private.cy_links(id),job_id uuid not null references private.cy_jobs(id),
 video_id text not null,metric text not null check(metric in('views','estimatedMinutesWatched','averageViewDuration')),
 value numeric,quality text not null check(quality in('known','missing')),
 start_date date not null,end_date date not null,measured_at timestamptz not null default clock_timestamp(),
 unique(job_id,video_id,metric),check((quality='missing' and value is null) or (quality='known' and value is not null and value>=0 and value<1e15))
);
create table private.cy_events (
 id uuid primary key default gen_random_uuid(),link_id uuid not null references private.cy_links(id),actor uuid not null,
 operation text not null check(operation in('consent','authorize','refresh','collect','withdraw','provider_revoked','provider_failed')),
 created_at timestamptz not null default clock_timestamp()
);
do $$declare t text;begin foreach t in array array['cy_links','cy_credentials','cy_jobs','cy_samples','cy_events'] loop
 execute format('alter table private.%I enable row level security',t);
 execute format('revoke all on table private.%I from public,anon,authenticated,service_role',t);
end loop;end $$;
create function private.cy_session(o uuid,u uuid,s uuid) returns boolean language sql stable security definer set search_path='' as $$
 select u is not null and exists(select 1 from auth.users a join auth.sessions b on b.user_id=a.id
 join public.organization_members m on m.user_id=a.id and m.organization_id=o
 where a.id=u and b.id=s and m.status='active' and a.email_confirmed_at is not null and a.deleted_at is null and (a.banned_until is null or a.banned_until<=clock_timestamp()))
$$;
revoke all on function private.cy_session(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function public.creator_youtube_owner(p_org uuid,p_operation text,p_link uuid,p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();s uuid:=(auth.jwt()->>'session_id')::uuid;l private.cy_links;j private.cy_jobs;d jsonb:=p_data;allowed text[];videos text[];
begin
 perform 1 from auth.users where id=u for share;perform 1 from auth.sessions where id=s and user_id=u for share;
 perform 1 from public.organization_members where organization_id=p_org and user_id=u for share;
 perform private.f1_lock();
 if not private.cy_session(p_org,u,s) or jsonb_typeof(d) is distinct from 'object' or pg_column_size(d)>24000 then raise exception 'cy_not_available' using errcode='42501';end if;
 allowed:=case p_operation when 'consent' then array['request_id','accepted','purpose','channel_id','video_ids','start_date','end_date','valid_until','retain_until'] when 'begin' then array['request_id','kind','state_hash'] when 'withdraw' then array[]::text[] when 'read' then array[]::text[] else null end;
 if allowed is null or exists(select 1 from jsonb_object_keys(d) k where not(k=any(allowed))) then raise exception 'cy_invalid_input';end if;
 if p_operation='consent' then
  if d->'accepted' is distinct from 'true'::jsonb or coalesce(length(btrim(d->>'purpose')),0)<2 or length(d->>'purpose')>2000
   or coalesce(d->>'channel_id','')!~'^UC[A-Za-z0-9_-]{22}$' or jsonb_typeof(d->'video_ids') is distinct from 'array' then raise exception 'cy_consent_required';end if;
  select array_agg(v) into videos from jsonb_array_elements_text(d->'video_ids') v;
  if coalesce(cardinality(videos),0) not between 1 and 25 or exists(select 1 from jsonb_array_elements(d->'video_ids') v where jsonb_typeof(v)<>'string') or exists(select 1 from unnest(videos) v where v!~'^[A-Za-z0-9_-]{11}$') or (select count(distinct v) from unnest(videos) v)<>cardinality(videos)
   or d->>'start_date' is null or d->>'end_date' is null or (d->>'end_date')::date<(d->>'start_date')::date or (d->>'end_date')::date>current_date
   or d->>'valid_until' is null or (d->>'valid_until')::timestamptz<=clock_timestamp() or d->>'retain_until' is null or (d->>'retain_until')::timestamptz<(d->>'valid_until')::timestamptz then raise exception 'cy_invalid_scope';end if;
  select * into l from private.cy_links where organization_id=p_org and owner_id=u and request_id=(d->>'request_id')::uuid for update;
  if found then if l.consent<>d then raise exception 'cy_request_conflict' using errcode='40001';end if;if l.status='revoked' then raise exception 'cy_not_available' using errcode='42501';end if;return jsonb_build_object('id',l.id);end if;
  insert into private.cy_links(organization_id,owner_id,request_id,consent,channel_id,video_ids,start_date,end_date,valid_until,retain_until)
   values(p_org,u,(d->>'request_id')::uuid,d,d->>'channel_id',videos,(d->>'start_date')::date,(d->>'end_date')::date,(d->>'valid_until')::timestamptz,(d->>'retain_until')::timestamptz) returning * into l;
  insert into private.cy_events(link_id,actor,operation) values(l.id,u,'consent');return jsonb_build_object('id',l.id);
 end if;
 select * into l from private.cy_links where id=p_link and organization_id=p_org and owner_id=u for update;
 if not found then raise exception 'cy_not_available' using errcode='42501';end if;
 if p_operation='read' then return jsonb_build_object('id',l.id,'status',l.status,'provider_revocation',l.provider_revocation,'channel_id',l.channel_id,'consent',l.consent,
  'samples',case when l.status='active' and l.valid_until>clock_timestamp() and l.retain_until>clock_timestamp() then (select coalesce(jsonb_agg(jsonb_build_object('video_id',video_id,'metric',metric,'unit',case metric when 'views' then 'count' when 'estimatedMinutesWatched' then 'minutes' else 'seconds' end,'value',value,'quality',quality,'start_date',start_date,'end_date',end_date,'measured_at',measured_at)),'[]'::jsonb) from private.cy_samples where link_id=l.id) else '[]'::jsonb end);end if;
 if p_operation='withdraw' then
  if l.status<>'revoked' then update private.cy_links set status='revoked',revoked_at=clock_timestamp(),generation=generation+1,provider_revocation=case when exists(select 1 from private.cy_credentials where link_id=l.id) or exists(select 1 from private.cy_jobs where link_id=l.id and kind in('authorize','refresh') and not used) then 'pending' else 'complete' end where id=l.id returning * into l;insert into private.cy_events(link_id,actor,operation) values(l.id,u,'withdraw');end if;
  if l.provider_revocation='complete' then return jsonb_build_object('id',l.id,'job_id',null);end if;
  select * into j from private.cy_jobs where link_id=l.id and kind='revoke' and generation=l.generation and not used and expires_at>clock_timestamp() order by expires_at desc limit 1;
  if not found then insert into private.cy_jobs(link_id,session_id,kind,generation,request_id,input) values(l.id,s,'revoke',l.generation,gen_random_uuid(),'{}') returning * into j;end if;
  return jsonb_build_object('id',l.id,'job_id',j.id);
 end if;
 if l.status='revoked' or l.valid_until<=clock_timestamp() or l.retain_until<=clock_timestamp() or d->>'kind' not in('authorize','refresh','collect') or d->>'kind' is null
  or (d->>'kind'='authorize' and (l.status<>'pending' or coalesce(d->>'state_hash','')!~'^[a-f0-9]{64}$')) or (d->>'kind'<>'authorize' and l.status<>'active') then raise exception 'cy_not_available' using errcode='42501';end if;
 select * into j from private.cy_jobs where link_id=l.id and request_id=(d->>'request_id')::uuid;
 if found then if j.input<>d then raise exception 'cy_request_conflict' using errcode='40001';end if;if j.used or j.generation<>l.generation or j.expires_at<=clock_timestamp() then raise exception 'cy_stale_job' using errcode='40001';end if;return jsonb_build_object('id',j.id);end if;
 if exists(select 1 from private.cy_jobs where link_id=l.id and kind in('authorize','refresh') and not used and expires_at>clock_timestamp()) then raise exception 'cy_job_in_progress' using errcode='40001';end if;
 insert into private.cy_jobs(link_id,session_id,kind,generation,request_id,input) values(l.id,s,d->>'kind',l.generation,(d->>'request_id')::uuid,d) returning * into j;
 return jsonb_build_object('id',j.id);
end $$;
revoke all on function public.creator_youtube_owner(uuid,text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.creator_youtube_owner(uuid,text,uuid,jsonb) to authenticated;

create function public.creator_youtube_server(p_job uuid,p_operation text,p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j private.cy_jobs;l private.cy_links;k private.cy_credentials;sample jsonb;scopes text[];access_id uuid;refresh_id uuid;
begin
 if jsonb_typeof(p_data) is distinct from 'object' or pg_column_size(p_data)>64000 or p_operation is null or p_operation not in('read','finish','revocation','quarantine') then raise exception 'cy_invalid_input';end if;
 select * into j from private.cy_jobs where id=p_job;if not found then raise exception 'cy_not_available' using errcode='42501';end if;
 select * into l from private.cy_links where id=j.link_id;
 if j.kind<>'revoke' then
  perform 1 from auth.users where id=l.owner_id for share;perform 1 from auth.sessions where id=j.session_id and user_id=l.owner_id for share;
  perform 1 from public.organization_members where organization_id=l.organization_id and user_id=l.owner_id for share;
 end if;
 perform private.f1_lock();
 select * into l from private.cy_links where id=j.link_id for update;select * into j from private.cy_jobs where id=p_job for update;
 if p_operation='quarantine' then
  if j.used or j.kind not in('authorize','refresh') or l.status<>'revoked' then raise exception 'cy_stale_job' using errcode='40001';end if;
 else
  if j.used or j.expires_at<=clock_timestamp() or j.generation<>l.generation or (j.kind='revoke' and l.status<>'revoked') or (j.kind<>'revoke' and (not private.cy_session(l.organization_id,l.owner_id,j.session_id) or l.status='revoked' or l.valid_until<=clock_timestamp() or l.retain_until<=clock_timestamp())) then raise exception 'cy_stale_job' using errcode='40001';end if;
 end if;
 select * into k from private.cy_credentials where link_id=l.id;
 if p_operation='read' then
  if p_data<>'{}'::jsonb then raise exception 'cy_invalid_input';end if;
  return jsonb_build_object('id',j.id,'kind',j.kind,'channel_id',l.channel_id,'video_ids',l.video_ids,'start_date',l.start_date,'end_date',l.end_date,'state_hash',j.input->>'state_hash',
   'credentials',case when k.link_id is null then null else jsonb_build_object('access_token',(select decrypted_secret from vault.decrypted_secrets where id=k.access_ref),'refresh_token',(select decrypted_secret from vault.decrypted_secrets where id=k.refresh_ref),'expires_at',k.expires_at) end);
 end if;
 if p_operation='revocation' then
  if j.kind<>'revoke' or not(p_data ? 'success') or jsonb_typeof(p_data->'success')<>'boolean' or exists(select 1 from jsonb_object_keys(p_data) v where v<>'success') then raise exception 'cy_invalid_input';end if;
  if p_data->'success'='true'::jsonb then
   perform vault.update_secret(k.access_ref,'REVOKED');perform vault.update_secret(k.refresh_ref,'REVOKED');delete from private.cy_credentials where link_id=l.id;
   update private.cy_links set provider_revocation='complete' where id=l.id;
  else update private.cy_links set provider_revocation='failed' where id=l.id;end if;
  update private.cy_jobs set used=true where id=j.id;
  insert into private.cy_events(link_id,actor,operation) values(l.id,l.owner_id,case when p_data->'success'='true'::jsonb then 'provider_revoked' else 'provider_failed' end);
  return jsonb_build_object('id',l.id);
 end if;
 if j.kind in('authorize','refresh') then
  if exists(select 1 from jsonb_object_keys(p_data) v where v not in('channel_id','scopes','access_token','refresh_token','expires_at')) or p_data->>'channel_id' is distinct from l.channel_id or jsonb_typeof(p_data->'scopes') is distinct from 'array' then raise exception 'cy_channel_or_scope_mismatch';end if;
  select array_agg(v) into scopes from jsonb_array_elements_text(p_data->'scopes') v;
  if scopes is null or not(scopes@>array['https://www.googleapis.com/auth/youtube.readonly','https://www.googleapis.com/auth/yt-analytics.readonly']) or not(scopes<@array['https://www.googleapis.com/auth/youtube.readonly','https://www.googleapis.com/auth/yt-analytics.readonly'])
   or coalesce(length(p_data->>'access_token'),0) not between 1 and 8192 or p_data->>'expires_at' is null or (p_data->>'expires_at')::timestamptz<=clock_timestamp()
   or (j.kind='authorize' and coalesce(length(p_data->>'refresh_token'),0) not between 1 and 8192) or length(p_data->>'refresh_token')>8192 then raise exception 'cy_invalid_credentials';end if;
  if k.link_id is null then
   select vault.create_secret(p_data->>'access_token','cy-access-'||l.id::text,'Private creator access') into access_id;
   select vault.create_secret(p_data->>'refresh_token','cy-refresh-'||l.id::text,'Private creator refresh') into refresh_id;
   insert into private.cy_credentials values(l.id,access_id,refresh_id,(p_data->>'expires_at')::timestamptz);
  else
   perform vault.update_secret(k.access_ref,p_data->>'access_token');if nullif(p_data->>'refresh_token','') is not null then perform vault.update_secret(k.refresh_ref,p_data->>'refresh_token');end if;
   update private.cy_credentials set expires_at=(p_data->>'expires_at')::timestamptz where link_id=l.id;
  end if;
  if p_operation='quarantine' then
   update private.cy_links set generation=generation+1,provider_revocation='pending' where id=l.id;
   update private.cy_jobs set used=true where id=j.id;
   return jsonb_build_object('id',l.id,'cleanup_pending',true);
  end if;
  update private.cy_links set status='active',generation=generation+1 where id=l.id;
 elsif j.kind='collect' then
  if jsonb_typeof(p_data->'rows') is distinct from 'array' or jsonb_array_length(p_data->'rows')>75 or exists(select 1 from jsonb_object_keys(p_data) v where v<>'rows') then raise exception 'cy_invalid_samples';end if;
  for sample in select * from jsonb_array_elements(p_data->'rows') loop
   if jsonb_typeof(sample)<>'object' or exists(select 1 from jsonb_object_keys(sample) as keys(key_name) where key_name not in('video_id','metric','value','quality')) or not(coalesce(sample->>'video_id','')=any(l.video_ids)) or sample->>'metric' is null or sample->>'quality' is null or jsonb_typeof(sample->'value') not in('number','null') or not(sample ? 'value') then raise exception 'cy_invalid_samples';end if;
   insert into private.cy_samples(link_id,job_id,video_id,metric,value,quality,start_date,end_date) values(l.id,j.id,sample->>'video_id',sample->>'metric',(sample->>'value')::numeric,sample->>'quality',l.start_date,l.end_date);
  end loop;
 else raise exception 'cy_invalid_operation';end if;
 update private.cy_jobs set used=true where id=j.id;insert into private.cy_events(link_id,actor,operation) values(l.id,l.owner_id,j.kind);
 return jsonb_build_object('id',l.id);
end $$;
revoke all on function public.creator_youtube_server(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.creator_youtube_server(uuid,text,jsonb) to service_role;
