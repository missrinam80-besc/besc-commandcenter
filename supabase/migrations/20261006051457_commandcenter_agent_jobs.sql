-- Separate proposals only. No mutation of canonical dossiers and no client writes.
alter table public.commandcenter_mcp_oauth_grants
  drop constraint commandcenter_mcp_oauth_grants_scope_check;
alter table public.commandcenter_mcp_oauth_grants add constraint commandcenter_mcp_oauth_grants_scope_check
  check (scope in ('commandcenter:read', 'commandcenter:read agent_results:write'));

create table public.agent_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  created_by uuid not null references auth.users(id),
  grant_id uuid not null references public.commandcenter_mcp_oauth_grants(id),
  agent_id text not null check (agent_id = 'agt_6ac27fb6af208191a789d9e3ba077ef6'),
  request text not null check (length(request) between 5 and 4000),
  idempotency_key uuid not null,
  source_entity text not null check (source_entity in ('projects', 'events')),
  source_id uuid not null,
  source_version timestamptz not null,
  source_snapshot jsonb not null,
  dispatch_state text not null default 'prepared' check (dispatch_state in ('prepared','dispatching','accepted','unknown')),
  channel_id text check (channel_id ~ '^agtch_[A-Za-z0-9_-]+$'),
  dispatch_lease uuid,
  dispatch_lease_until timestamptz,
  conversation_url text,
  provider_run_id text,
  result_received_at timestamptz,
  review text not null default 'pending' check (review in ('pending','accepted','rejected')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  unique (organization_id, created_by, idempotency_key)
);
create table public.agent_results (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.agent_jobs(id),
  organization_id uuid not null references public.organizations(id),
  submitted_by uuid not null references auth.users(id),
  idempotency_key uuid not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create table public.agent_audit (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.agent_jobs(id),
  organization_id uuid not null references public.organizations(id),
  actor_id uuid not null references auth.users(id),
  action text not null check (action in ('job_created','dispatch_started','dispatch_accepted','dispatch_unknown','result_received','accepted','rejected')),
  created_at timestamptz not null default now()
);
create index agent_jobs_recent_idx on public.agent_jobs(organization_id, created_at desc);
create index agent_audit_job_idx on public.agent_audit(job_id, created_at);
alter table public.agent_jobs enable row level security;
alter table public.agent_results enable row level security;
alter table public.agent_audit enable row level security;
revoke all on public.agent_jobs, public.agent_results, public.agent_audit from public, anon, authenticated;
grant select, insert, update on public.agent_jobs to service_role;
grant select, insert on public.agent_results, public.agent_audit to service_role;

-- The app checks Auth account state too. Membership and grant are locked here,
-- so revocation and role changes cannot race a commit. No user metadata claims.
create function public.agent_assert_manager(p_actor uuid, p_org uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from public.organization_members where user_id=p_actor and organization_id=p_org
    and status='active' and role in ('admin','board') for share;
  if not found then raise exception 'agent_access_denied'; end if;
end $$;

create function public.claim_commandcenter_agent_dispatch(p_actor uuid,p_org uuid,p_job uuid,p_channel text,p_lease uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare j public.agent_jobs%rowtype; version_now timestamptz;
begin
  select * into j from public.agent_jobs where id=p_job and organization_id=p_org and created_by=p_actor;
  if not found then raise exception 'agent_job_denied'; end if;
  -- Lock order is grant, then job throughout all mutations.
  perform public.agent_assert_grant(p_actor,p_org,j.grant_id);
  select * into j from public.agent_jobs where id=p_job for update;
  if p_channel is null or p_channel !~ '^agtch_[A-Za-z0-9_-]+$' or p_lease is null then raise exception 'agent_channel_invalid'; end if;
  if j.channel_id is not null and j.channel_id<>p_channel then raise exception 'agent_channel_conflict'; end if;
  if j.dispatch_state='accepted' then return to_jsonb(j); end if;
  if j.expires_at<=now() or j.result_received_at is not null then raise exception 'agent_job_closed'; end if;
  if j.dispatch_state='dispatching' and j.dispatch_lease_until>now() then raise exception 'agent_dispatch_busy'; end if;
  execute format('select updated_at from public.%I where id=$1 and organization_id=$2 and deleted_at is null for share',j.source_entity)
    into version_now using j.source_id,p_org;
  if version_now is distinct from j.source_version then raise exception 'agent_source_conflict'; end if;
  update public.agent_jobs set channel_id=p_channel,dispatch_state='dispatching',dispatch_lease=p_lease,
    dispatch_lease_until=now()+interval '30 seconds' where id=j.id returning * into j;
  insert into public.agent_audit(job_id,organization_id,actor_id,action) values(j.id,p_org,p_actor,'dispatch_started');
  return to_jsonb(j);
end $$;

-- Persist the receipt even if consent was revoked during an external request.
-- Only the server may invoke this; the lease must match the claimed dispatch.
create function public.finish_commandcenter_agent_dispatch(p_actor uuid,p_org uuid,p_job uuid,p_lease uuid,p_url text,p_run text)
returns void language plpgsql security invoker set search_path = '' as $$
declare j public.agent_jobs%rowtype; state text;
begin
  select * into j from public.agent_jobs where id=p_job and organization_id=p_org and created_by=p_actor for update;
  if not found or j.dispatch_lease is distinct from p_lease or j.dispatch_state<>'dispatching' then raise exception 'agent_lease_denied'; end if;
  if p_url is not null and p_url !~ '^https://chatgpt[.]com/c/[A-Za-z0-9_-]+$' then raise exception 'agent_receipt_invalid'; end if;
  if p_run is not null and p_run !~ '^apirun_[A-Za-z0-9_-]+$' then raise exception 'agent_receipt_invalid'; end if;
  state=case when p_url is null then 'unknown' else 'accepted' end;
  update public.agent_jobs set dispatch_state=state,conversation_url=p_url,provider_run_id=p_run,dispatch_lease_until=null where id=j.id;
  insert into public.agent_audit(job_id,organization_id,actor_id,action)
    values(j.id,p_org,p_actor,case when p_url is null then 'dispatch_unknown' else 'dispatch_accepted' end);
end $$;
revoke all on function public.claim_commandcenter_agent_dispatch(uuid,uuid,uuid,text,uuid),
  public.finish_commandcenter_agent_dispatch(uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_commandcenter_agent_dispatch(uuid,uuid,uuid,text,uuid),
  public.finish_commandcenter_agent_dispatch(uuid,uuid,uuid,uuid,text,text) to service_role;
create function public.agent_assert_grant(p_actor uuid, p_org uuid, p_grant uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform public.agent_assert_manager(p_actor,p_org);
  perform 1 from public.commandcenter_mcp_oauth_grants where id=p_grant and user_id=p_actor
    and organization_id=p_org and scope='commandcenter:read agent_results:write'
    and revoked_at is null and expires_at>now() for share;
  if not found then raise exception 'agent_grant_denied'; end if;
end $$;

create function public.create_commandcenter_agent_job(p_actor uuid,p_org uuid,p_grant uuid,
  p_agent text,p_key uuid,p_request text,p_entity text,p_source uuid,p_version timestamptz)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare j public.agent_jobs%rowtype; source_row jsonb; snapshot jsonb;
begin
  perform public.agent_assert_grant(p_actor,p_org,p_grant);
  if p_entity not in ('projects','events') or p_entity is null then raise exception 'agent_invalid_source'; end if;
  -- Serialise same-user idempotency requests, including before a job exists.
  perform pg_advisory_xact_lock(hashtextextended(p_org::text||p_actor::text||p_key::text,0));
  select * into j from public.agent_jobs where organization_id=p_org and created_by=p_actor and idempotency_key=p_key;
  if found then
    if j.grant_id is distinct from p_grant or j.agent_id is distinct from p_agent or j.request is distinct from p_request
      or j.source_entity is distinct from p_entity or j.source_id is distinct from p_source or j.source_version is distinct from p_version
      then raise exception 'agent_idempotency_conflict'; end if;
    return to_jsonb(j);
  end if;
  -- Table name is a two-item server allowlist; values remain bound parameters.
  execute format('select to_jsonb(s) from public.%I s where id=$1 and organization_id=$2 and deleted_at is null for share',p_entity)
    into source_row using p_source,p_org;
  if source_row is null then raise exception 'agent_source_missing'; end if;
  if (source_row->>'updated_at')::timestamptz is distinct from p_version then raise exception 'agent_source_conflict'; end if;
  snapshot=jsonb_build_object('id',p_source,'entity',p_entity,'title',source_row->>'title',
    'status',source_row->>'status','recordVersion',source_row->>'updated_at', 'coverage','header_metadata_only');
  insert into public.agent_jobs(organization_id,created_by,grant_id,agent_id,idempotency_key,request,source_entity,source_id,source_version,source_snapshot)
    values(p_org,p_actor,p_grant,p_agent,p_key,p_request,p_entity,p_source,p_version,snapshot) returning * into j;
  insert into public.agent_audit(job_id,organization_id,actor_id,action) values(j.id,p_org,p_actor,'job_created');
  return to_jsonb(j);
end $$;

create function public.submit_commandcenter_agent_result(p_actor uuid,p_org uuid,p_grant uuid,p_job uuid,p_key uuid,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare j public.agent_jobs%rowtype; r public.agent_results%rowtype; version_now timestamptz; f jsonb;
begin
  perform public.agent_assert_grant(p_actor,p_org,p_grant);
  select * into j from public.agent_jobs where id=p_job and organization_id=p_org and created_by=p_actor and grant_id=p_grant for update;
  if not found then raise exception 'agent_job_denied'; end if;
  select * into r from public.agent_results where job_id=j.id;
  if found then
    if r.idempotency_key is distinct from p_key or r.payload is distinct from p_payload then raise exception 'agent_idempotency_conflict'; end if;
    return to_jsonb(r);
  end if;
  if j.expires_at<=now() then raise exception 'agent_job_expired'; end if;
  if p_key is null or p_payload is null or jsonb_typeof(p_payload)<>'object'
    or not (p_payload ?& array['kind','summary','sourceVersion','findings'])
    or p_payload - array['kind','summary','sourceVersion','findings'] <> '{}'::jsonb
    or jsonb_typeof(p_payload->'kind') is distinct from 'string'
    or p_payload->>'kind' not in ('evaluation','proposal','draft')
    or jsonb_typeof(p_payload->'summary') is distinct from 'string'
    or length(p_payload->>'summary') not between 1 and 2000
    or jsonb_typeof(p_payload->'sourceVersion') is distinct from 'string'
    or jsonb_typeof(p_payload->'findings') is distinct from 'array'
    then raise exception 'agent_invalid_result'; end if;
  if jsonb_array_length(p_payload->'findings')>30 then raise exception 'agent_invalid_result'; end if;
  for f in select value from jsonb_array_elements(p_payload->'findings') loop
    if jsonb_typeof(f)<>'object' or not (f ?& array['statement','classification'])
      or f-array['statement','classification'] <> '{}'::jsonb
      or jsonb_typeof(f->'statement') is distinct from 'string' or length(f->>'statement') not between 1 and 2000
      or jsonb_typeof(f->'classification') is distinct from 'string'
      or f->>'classification' not in ('confirmed','uncertain','proposal') then raise exception 'agent_invalid_result'; end if;
  end loop;
  if (p_payload->>'sourceVersion')::timestamptz is distinct from j.source_version then raise exception 'agent_source_conflict'; end if;
  execute format('select updated_at from public.%I where id=$1 and organization_id=$2 and deleted_at is null for share',j.source_entity)
    into version_now using j.source_id,p_org;
  if version_now is distinct from j.source_version then raise exception 'agent_source_conflict'; end if;
  insert into public.agent_results(job_id,organization_id,submitted_by,idempotency_key,payload)
    values(j.id,p_org,p_actor,p_key,p_payload) returning * into r;
  update public.agent_jobs set result_received_at=now() where id=j.id;
  insert into public.agent_audit(job_id,organization_id,actor_id,action) values(j.id,p_org,p_actor,'result_received');
  return to_jsonb(r);
end $$;

create function public.review_commandcenter_agent_result(p_actor uuid,p_org uuid,p_job uuid,p_review text)
returns void language plpgsql security invoker set search_path = '' as $$
declare j public.agent_jobs%rowtype; version_now timestamptz;
begin
  perform public.agent_assert_manager(p_actor,p_org);
  if p_review is null or p_review not in ('accepted','rejected') then raise exception 'agent_invalid_review'; end if;
  select * into j from public.agent_jobs where id=p_job and organization_id=p_org for update;
  if not found or j.result_received_at is null then raise exception 'agent_result_missing'; end if;
  if j.review=p_review then return; end if;
  if j.review<>'pending' then raise exception 'agent_review_conflict'; end if;
  if p_review='accepted' then
    execute format('select updated_at from public.%I where id=$1 and organization_id=$2 and deleted_at is null for share',j.source_entity)
      into version_now using j.source_id,p_org;
    if version_now is distinct from j.source_version then raise exception 'agent_source_conflict'; end if;
  end if;
  update public.agent_jobs set review=p_review,reviewed_by=p_actor,reviewed_at=now() where id=j.id;
  insert into public.agent_audit(job_id,organization_id,actor_id,action) values(j.id,p_org,p_actor,p_review);
end $$;

revoke all on function public.agent_assert_manager(uuid,uuid), public.agent_assert_grant(uuid,uuid,uuid),
  public.create_commandcenter_agent_job(uuid,uuid,uuid,text,uuid,text,text,uuid,timestamptz),
  public.submit_commandcenter_agent_result(uuid,uuid,uuid,uuid,uuid,jsonb),
  public.review_commandcenter_agent_result(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.agent_assert_manager(uuid,uuid), public.agent_assert_grant(uuid,uuid,uuid),
  public.create_commandcenter_agent_job(uuid,uuid,uuid,text,uuid,text,text,uuid,timestamptz),
  public.submit_commandcenter_agent_result(uuid,uuid,uuid,uuid,uuid,jsonb),
  public.review_commandcenter_agent_result(uuid,uuid,uuid,text) to service_role;
