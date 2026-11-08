-- Local-only durable read progress. No backfill, transport, timer or activation.
create table private.rs_jobs (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 account_id uuid not null references public.social_accounts(id), requested_by uuid not null references public.profiles(id),session_id uuid not null,
 request_id uuid not null,target jsonb not null,checkpoint jsonb not null,
 kind text not null check(kind in('direct','comment')),state text not null default 'pending' check(state in('pending','processing','retry_wait','blocked','attention','completed','cancelled')),
 revision bigint not null default 0,epoch bigint not null default 0,nonce uuid,lease_until timestamptz,
 available_at timestamptz not null default clock_timestamp(),attempts bigint not null default 0,pages_committed bigint not null default 0,
 reason text,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,request_id)
);
create unique index rs_one_active_scan on private.rs_jobs(account_id,kind) where state not in('completed','cancelled');
create index rs_due on private.rs_jobs(organization_id,state,available_at);
create table private.rs_receipts (
 nonce uuid primary key,job_id uuid not null references private.rs_jobs(id),revision bigint not null,payload_hash text not null,
 inserted integer not null,result jsonb not null,created_at timestamptz not null default clock_timestamp(),unique(job_id,revision)
);
create table private.rs_events (
 id bigint generated always as identity primary key,job_id uuid not null references private.rs_jobs(id),
 operation text not null check(operation in('created','claimed','committed','retry_wait','blocked','attention','cancelled','restarted')),
 reason text,actor_id uuid references public.profiles(id),created_at timestamptz not null default clock_timestamp()
);
create index rs_history on private.rs_events(job_id,id desc);
alter table private.rs_jobs enable row level security;
alter table private.rs_receipts enable row level security;
alter table private.rs_events enable row level security;
revoke all on private.rs_jobs,private.rs_receipts,private.rs_events from public,anon,authenticated,service_role;
revoke all on sequence private.rs_events_id_seq from public,anon,authenticated,service_role;

create function private.rs_checkpoint_valid(c jsonb)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
begin
 return coalesce(jsonb_typeof(c)='object' and (c-array['v','api_version','queue','seen'])='{}'::jsonb and c->'v'='1'::jsonb
 and c->>'api_version' ~ '^v[0-9]+\.[0-9]+$' and jsonb_typeof(c->'queue')='array' and jsonb_typeof(c->'seen')='array'
 and jsonb_array_length(c->'queue')<=1000 and jsonb_array_length(c->'seen')<=10000 and octet_length(c::text)<=1000000,false);
exception when others then return false;
end $$;
revoke all on function private.rs_checkpoint_valid(jsonb) from public,anon,authenticated,service_role;

create function private.rs_initial(t jsonb,api text)
returns jsonb language sql immutable security invoker set search_path='' as $$
 select jsonb_build_object('v',1,'api_version',api,'queue',coalesce(jsonb_agg(jsonb_build_object('type',k,'id',id,'thread',id,'participants','[]'::jsonb,'expand',k='comments','after',null,'used','[]'::jsonb) order by n),'[]'),
 'seen',coalesce(jsonb_agg(k||':'||id||':'||id order by n),'[]')) from(
 select 'conversations' k,t->>'page_id' id,0::bigint n where t->>'kind'='direct'
 union all select 'comments',value,n from jsonb_array_elements_text(t->'resources') with ordinality r(value,n) where t->>'kind'='comment') q
$$;
revoke all on function private.rs_initial(jsonb,text) from public,anon,authenticated,service_role;

create function private.rs_access(j private.rs_jobs)
returns boolean language sql volatile security definer set search_path='' as $$
 select private.cy_session(j.organization_id,j.requested_by,j.session_id) and private.si_manager(j.organization_id,j.requested_by)
 and exists(select 1 from public.social_accounts a where a.id=j.account_id and a.organization_id=j.organization_id and a.deleted_at is null and a.status='connected'
 and a.platform=j.target->>'platform' and a.external_account_id=j.target->>'external_account_id'
 and a.granted_scopes @> case when j.kind='direct' then case when a.platform='instagram' then array['instagram_basic','instagram_manage_messages','pages_manage_metadata'] else array['pages_messaging','pages_manage_metadata','pages_read_engagement'] end
 else case when a.platform='instagram' then array['instagram_basic','instagram_manage_comments','pages_read_engagement'] else array['pages_read_engagement','pages_read_user_content'] end end)
$$;
revoke all on function private.rs_access(private.rs_jobs) from public,anon,authenticated,service_role;

create function private.rs_owner(o uuid,action text,job uuid,data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare row private.rs_jobs;account public.social_accounts;target jsonb;c jsonb;session uuid;request uuid;
begin
 session:=nullif(auth.jwt()->>'session_id','')::uuid;
 perform 1 from auth.users where id=auth.uid() for share;
 perform 1 from auth.sessions where id=session and user_id=auth.uid() for share;
 perform 1 from public.organization_members where organization_id=o and user_id=auth.uid() for share;
 perform 1 from public.organization_access_roles where organization_id=o and id=(select access_role_id from public.organization_members where organization_id=o and user_id=auth.uid()) for share;
 if not private.cy_session(o,auth.uid(),session) or not private.si_manager(o,auth.uid()) then raise exception 'inbox_sync_access_denied' using errcode='42501'; end if;
 if action='list' then return coalesce((select jsonb_agg(v order by created_at desc,id) from(select id,account_id,kind,state,revision,pages_committed,attempts,reason,available_at,created_at from private.rs_jobs where organization_id=o order by created_at desc,id limit 50) v),'[]');end if;
 if action='create' then
  target:=data->'target';c:=data->'checkpoint';request:=(data->>'request_id')::uuid;
  if request is null or not private.rs_checkpoint_valid(c) or jsonb_array_length(c->'queue')=0 or jsonb_typeof(target) is distinct from 'object'
   or target->>'organization_id' is distinct from o::text or target->>'kind' not in('direct','comment')
   or target->>'page_id' !~ '^[0-9]{1,64}$' or jsonb_typeof(target->'resources') is distinct from 'array' or jsonb_array_length(target->'resources')>5
   or exists(select 1 from jsonb_array_elements(target->'resources') r where jsonb_typeof(r)<>'string' or r#>>'{}' !~ '^[A-Za-z0-9_.:-]+$' or length(r#>>'{}')>256 or r#>>'{}' in('.','..'))
   or c is distinct from private.rs_initial(target,c->>'api_version')
   or (target-array['organization_id','account_id','platform','external_account_id','page_id','kind','resources'])<>'{}'::jsonb then raise exception 'inbox_sync_invalid_start';end if;
  select * into account from public.social_accounts where id=(target->>'account_id')::uuid and organization_id=o and deleted_at is null and status='connected' for update;
  if not found or account.platform is distinct from target->>'platform' or account.external_account_id is distinct from target->>'external_account_id'
   or account.platform not in('facebook','instagram') or account.platform='facebook' and target->>'page_id'<>account.external_account_id then raise exception 'inbox_sync_account_denied';end if;
  select * into row from private.rs_jobs where organization_id=o and request_id=request;
  if found then if row.target<>target or row.checkpoint->>'api_version'<>c->>'api_version' or row.requested_by<>auth.uid() then raise exception 'inbox_sync_request_conflict';end if;return jsonb_build_object('id',row.id,'state',row.state);end if;
  insert into private.rs_jobs(organization_id,account_id,requested_by,session_id,request_id,target,checkpoint,kind)values(o,account.id,auth.uid(),session,request,target,c,target->>'kind') returning * into row;
  if not private.rs_access(row) then raise exception 'inbox_sync_access_denied';end if;
  insert into private.rs_events(job_id,operation,actor_id)values(row.id,'created',auth.uid());return jsonb_build_object('id',row.id,'state',row.state);
 end if;
 select * into row from private.rs_jobs where id=job and organization_id=o;
 if not found then raise exception 'inbox_sync_unavailable';end if;
 perform 1 from public.social_accounts where id=row.account_id for update;
 select * into row from private.rs_jobs where id=job and organization_id=o for update;
 if action='read' then return jsonb_build_object('id',row.id,'account_id',row.account_id,'state',row.state,'revision',row.revision,'pages_committed',row.pages_committed,'attempts',row.attempts,'reason',row.reason,'available_at',row.available_at,
  'events',coalesce((select jsonb_agg(v order by id) from(select id,operation,reason,actor_id,created_at from private.rs_events where job_id=row.id and (nullif(data->>'events_before','') is null or id<(data->>'events_before')::bigint) order by id desc limit 51)v),'[]'));end if;
 if data->>'revision' is null or (data->>'revision')::bigint<>row.revision then raise exception 'inbox_sync_conflict' using errcode='40001';end if;
 if action='cancel' then
  update private.rs_jobs set state='cancelled',nonce=null,lease_until=null,revision=revision+1,updated_at=clock_timestamp() where id=job;
  insert into private.rs_events(job_id,operation,actor_id)values(job,'cancelled',auth.uid());
 elsif action='restart' then
  if row.state='processing' and row.lease_until>clock_timestamp() then raise exception 'inbox_sync_busy';end if;
  c:=data->'checkpoint';if not private.rs_checkpoint_valid(c) or c is distinct from private.rs_initial(row.target,row.checkpoint->>'api_version') then raise exception 'inbox_sync_invalid_start';end if;
  update private.rs_jobs set checkpoint=c,state='pending',nonce=null,lease_until=null,revision=revision+1,epoch=epoch+1,requested_by=auth.uid(),session_id=session,reason=null,available_at=clock_timestamp(),updated_at=clock_timestamp() where id=job;
  select * into row from private.rs_jobs where id=job;if not private.rs_access(row) then raise exception 'inbox_sync_access_denied';end if;
  insert into private.rs_events(job_id,operation,actor_id)values(job,'restarted',auth.uid());
 else raise exception 'inbox_sync_invalid_action';end if;
 return jsonb_build_object('id',job,'state',(select state from private.rs_jobs where id=job));
end $$;
revoke all on function private.rs_owner(uuid,text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.rs_owner(uuid,text,uuid,jsonb) to authenticated;
create function public.inbox_sync_owner(p_org uuid,p_action text,p_job uuid default null,p_data jsonb default '{}')
returns jsonb language sql volatile security invoker set search_path='' as $$ select private.rs_owner(p_org,p_action,p_job,p_data) $$;
revoke all on function public.inbox_sync_owner(uuid,text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.inbox_sync_owner(uuid,text,uuid,jsonb) to authenticated;

create function private.rs_server(job uuid,action text,data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare row private.rs_jobs;receipt private.rs_receipts;claim uuid;payload text;answer jsonb;inserted integer;next_state text;why text;wait_seconds integer;source_user uuid;source_session uuid;
begin
 select * into row from private.rs_jobs where id=job;
 if not found then raise exception 'inbox_sync_unavailable';end if;
 claim:=nullif(data->>'nonce','')::uuid;
 if action='receipt' then select * into receipt from private.rs_receipts where job_id=job and nonce=claim;return case when found then receipt.result else null end;end if;
 source_user:=row.requested_by;source_session:=row.session_id;
 perform 1 from auth.users where id=row.requested_by for share;
 perform 1 from auth.sessions where id=row.session_id and user_id=row.requested_by for share;
 perform 1 from public.organization_members where organization_id=row.organization_id and user_id=row.requested_by for share;
 perform 1 from public.organization_access_roles where organization_id=row.organization_id and id=(select access_role_id from public.organization_members where organization_id=row.organization_id and user_id=row.requested_by) for share;
 perform 1 from public.social_accounts where id=row.account_id for update;
 select * into row from private.rs_jobs where id=job for update;
 if row.requested_by<>source_user or row.session_id<>source_session then raise exception 'inbox_sync_authority_changed';end if;
 if action='claim' then
  if row.state not in('pending','retry_wait','processing') or row.state='retry_wait' and row.available_at>clock_timestamp() or row.state='processing' and row.lease_until>clock_timestamp() then return jsonb_build_object('state','skipped');end if;
  if not private.rs_access(row) then
   update private.rs_jobs set state='blocked',reason='access_changed',nonce=null,lease_until=null where id=job;
   insert into private.rs_events(job_id,operation,reason)values(job,'blocked','access_changed');return jsonb_build_object('state','blocked');
  end if;
  claim:=gen_random_uuid();update private.rs_jobs set state='processing',nonce=claim,lease_until=clock_timestamp()+interval '120 seconds',attempts=attempts+1,updated_at=clock_timestamp() where id=job;
  insert into private.rs_events(job_id,operation)values(job,'claimed');return jsonb_build_object('state','processing','id',job,'target',row.target,'checkpoint',row.checkpoint,'revision',row.revision,'nonce',claim);
 end if;
 if action='commit' then
  payload:=encode(sha256(convert_to(jsonb_build_object('messages',data->'messages','next',data->'next','done',data->'done','skipped',data->'skipped')::text,'UTF8')),'hex');
  select * into receipt from private.rs_receipts where nonce=claim and job_id=job;
  if found then if receipt.payload_hash<>payload then raise exception 'inbox_sync_receipt_conflict';end if;return receipt.result;end if;
 end if;
 if row.state<>'processing' or claim is null or row.nonce is distinct from claim or row.lease_until<clock_timestamp() or data->>'revision' is null or row.revision<>(data->>'revision')::bigint then raise exception 'inbox_sync_claim_required';end if;
 if not private.rs_access(row) then
  update private.rs_jobs set state='blocked',reason='access_changed',nonce=null,lease_until=null where id=job;
  insert into private.rs_events(job_id,operation,reason)values(job,'blocked','access_changed');return jsonb_build_object('state','blocked');
 end if;
 if action='commit' then
  if not private.rs_checkpoint_valid(data->'next') or data#>>'{next,api_version}'<>row.checkpoint->>'api_version' or jsonb_typeof(data->'messages') is distinct from 'array' or jsonb_array_length(data->'messages')>25
   or jsonb_typeof(data->'done') is distinct from 'boolean' or (data->>'done')::boolean is distinct from (jsonb_array_length(data#>'{next,queue}')=0)
   or exists(select 1 from jsonb_array_elements(data->'messages') m where m->>'kind' is distinct from row.kind or m->>'thread_id' is distinct from row.checkpoint#>>'{queue,0,thread}')
   or row.checkpoint#>>'{queue,0,type}'='conversations' and jsonb_array_length(data->'messages')<>0 then raise exception 'inbox_sync_invalid_page';end if;
  begin
   answer:=private.si_ingest(row.organization_id,row.account_id,row.target->>'external_account_id',data->'messages');inserted:=(answer->>'inserted')::integer;
  exception when others then
   get stacked diagnostics why=message_text;
   why:=case when why='social_inbox_duplicate_conflict' then 'duplicate_conflict' else 'storage_rejected' end;
   update private.rs_jobs set state='attention',reason=why,nonce=null,lease_until=null where id=job;
   insert into private.rs_events(job_id,operation,reason)values(job,'attention',why);return jsonb_build_object('state','attention');
  end;
  next_state:=case when (data->>'done')::boolean then 'completed' else 'pending' end;
  answer:=jsonb_build_object('id',job,'state',next_state,'revision',row.revision+1,'inserted',inserted,'nonce',claim);
  insert into private.rs_receipts(nonce,job_id,revision,payload_hash,inserted,result)values(claim,job,row.revision,payload,inserted,answer);
  update private.rs_jobs set checkpoint=data->'next',state=next_state,revision=revision+1,pages_committed=pages_committed+1,nonce=null,lease_until=null,reason=null,available_at=clock_timestamp(),updated_at=clock_timestamp() where id=job;
  insert into private.rs_events(job_id,operation)values(job,'committed');return answer;
 elsif action='fail' then
  why:=data->>'reason';if why is null or why not in('permissions_required','token_invalid','account_mismatch','resource_mismatch','invalid_response','unsupported_message','pagination_invalid','limit_reached','rate_limited','provider_unavailable','timeout','cancelled','response_too_large','duplicate_conflict','credentials_unavailable') then raise exception 'inbox_sync_invalid_reason';end if;
  next_state:=case when why in('rate_limited','provider_unavailable','timeout','credentials_unavailable') then 'retry_wait' when why in('permissions_required','token_invalid','account_mismatch','resource_mismatch') then 'blocked' else 'attention' end;
  wait_seconds:=greatest(1,least(3600,coalesce((data->>'retry_after')::integer,60)));
  update private.rs_jobs set state=next_state,reason=why,nonce=null,lease_until=null,available_at=clock_timestamp()+make_interval(secs=>wait_seconds),updated_at=clock_timestamp() where id=job;
  insert into private.rs_events(job_id,operation,reason)values(job,next_state,why);return jsonb_build_object('state',next_state);
 else raise exception 'inbox_sync_invalid_action';end if;
end $$;
revoke all on function private.rs_server(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.rs_server(uuid,text,jsonb) to service_role;
create function public.inbox_sync_server(p_job uuid,p_action text,p_data jsonb default '{}')
returns jsonb language sql volatile security invoker set search_path='' as $$ select private.rs_server(p_job,p_action,p_data) $$;
revoke all on function public.inbox_sync_server(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.inbox_sync_server(uuid,text,jsonb) to service_role;
