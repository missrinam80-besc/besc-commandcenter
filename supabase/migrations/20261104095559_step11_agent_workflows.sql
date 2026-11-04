-- Step 11. No existing job, proposal, grant or dossier is changed.
alter table public.agent_jobs drop constraint agent_jobs_agent_id_check;
alter table public.agent_jobs add constraint agent_jobs_agent_id_check check(agent_id ~ '^agt_[A-Za-z0-9_-]+$');
alter table public.agent_jobs
  add column agent_key text not null default 'technical' check(agent_key in ('technical','management','project','event','content','creative','reporting','commerce','finance_assets')),
  add column input_version integer not null default 1 check(input_version in(1,2)),
  add column dispatch_attempts integer not null default 0 check(dispatch_attempts>=0),
  add column max_attempts integer not null default 1 check(max_attempts between 1 and 3),
  add column budget_credits integer check(budget_credits between 1 and 5),
  add column budget_approved_by uuid references auth.users(id),
  add column budget_approved_at timestamptz,
  add column provider_limit_reference text check(length(provider_limit_reference) between 5 and 300),
  add column actual_credits numeric(10,2) check(actual_credits>=0),
  add column cost_recorded_by uuid references auth.users(id),
  add column cost_recorded_at timestamptz,
  add column cancelled_at timestamptz,
  add column last_dispatch_error text check(last_dispatch_error in('credential','permission','channel','not_runnable','rate_limited','provider_unavailable','network','timeout','receipt','unknown')),
  add column provider_status text check(provider_status in('queued','in_progress','suspended','completed','failed')),
  add column provider_status_checked_at timestamptz;
alter table public.agent_jobs add constraint agent_jobs_existing_agent_check check(agent_id=case agent_key when 'technical' then 'agt_6ac27fb6af208191a789d9e3ba077ef6' when 'management' then 'agt_6ac21ea034048191906a3c309e255ec2' when 'project' then 'agt_6ac16b1dc94481919b82e8ef17905f31' when 'event' then 'agt_6ac2521609748191ae967ec5bb067871' when 'content' then 'agt_6ac24b5a708081919fa460fa6746aa99' when 'creative' then 'agt_6ac2675add148191a85978e8de3b0383' when 'reporting' then 'agt_6ac273ee22708191aabac76eeca67b6c' when 'commerce' then 'agt_6ac25de8662881918021da7236c6f102' when 'finance_assets' then 'agt_6ac23b53241081919d7791dc8200241a' end);
create table public.agent_execution_controls(
  organization_id uuid primary key references public.organizations(id),
  paused boolean not null default true,
  changed_by uuid not null references auth.users(id),
  changed_at timestamptz not null default now()
);
alter table public.agent_execution_controls enable row level security;
revoke all on public.agent_execution_controls from public,anon,authenticated;
grant select,insert,update on public.agent_execution_controls to service_role;
alter table public.agent_audit drop constraint agent_audit_action_check;
alter table public.agent_audit add constraint agent_audit_action_check check(action in(
  'job_created','dispatch_started','dispatch_accepted','dispatch_unknown','result_received','accepted','rejected',
  'budget_approved','cancelled','cost_recorded','run_status_checked'));
alter table public.agent_audit add column metadata jsonb not null default '{}'::jsonb;

create function public.create_agent_workflow_job(p_actor uuid,p_org uuid,p_grant uuid,p_agent text,p_agent_key text,
 p_key uuid,p_request text,p_entity text,p_source uuid,p_version timestamptz,p_sections jsonb,p_excerpt text,p_reference text,p_confirmed boolean)
returns jsonb language plpgsql security invoker set search_path='' set timezone='UTC' as $$
declare j public.agent_jobs%rowtype; s jsonb; ctx jsonb:='{}'; fingerprint text;
begin
 perform public.agent_assert_grant(p_actor,p_org,p_grant);
 if p_agent is null or p_agent !~ '^agt_[A-Za-z0-9_-]+$' or p_agent_key is null or p_agent_key not in
 ('technical','management','project','event','content','creative','reporting','commerce','finance_assets') then raise exception 'agent_channel_invalid';end if;
 if p_entity is null or p_entity not in('projects','events') or p_sections is null or jsonb_typeof(p_sections)<>'array'
 or jsonb_array_length(p_sections)>2 or exists(select 1 from jsonb_array_elements(p_sections) v where jsonb_typeof(v)<>'string' or v#>>'{}' not in('description','schedule'))
 or (select count(*)<>count(distinct value) from jsonb_array_elements(p_sections))
 or p_excerpt is null or length(p_excerpt)>6000 or p_reference is null or length(p_reference)>300
 or (p_excerpt<>'' and length(btrim(p_reference))<1)
 or ((p_sections<>'[]'::jsonb or p_excerpt<>'') and p_confirmed is distinct from true) then raise exception 'agent_context_invalid';end if;
 execute format('select to_jsonb(s) from public.%I s where id=$1 and organization_id=$2 and deleted_at is null for share',p_entity) into s using p_source,p_org;
 if s is null or (s->>'updated_at')::timestamptz is distinct from p_version then raise exception 'agent_source_conflict';end if;
 if p_sections ? 'description' then ctx=ctx||jsonb_build_object('description',left(coalesce(s->>'description',''),6000));end if;
 if p_sections ? 'schedule' then
  if p_entity='events' then ctx=ctx||jsonb_build_object('schedule',jsonb_build_object('start_at',s->'start_at','end_at',s->'end_at','location',s->'location','is_online',s->'is_online'));
  else ctx=ctx||jsonb_build_object('schedule',jsonb_build_object('start_date',s->'start_date','due_date',s->'due_date'));end if;
 end if;
 if p_excerpt<>'' then ctx=ctx||jsonb_build_object('user_selected_excerpt',jsonb_build_object('text',p_excerpt,'reference',p_reference,'verification','selected_by_requester_not_independently_verified'));end if;
 fingerprint=jsonb_build_array(p_org,p_actor,p_grant,p_agent,p_agent_key,btrim(p_request),p_entity,p_source,p_version,ctx)::text;
 perform pg_advisory_xact_lock(hashtextextended(fingerprint,0));
 select * into j from public.agent_jobs where organization_id=p_org and created_by=p_actor and idempotency_key=p_key;
 if found then
  if j.grant_id is distinct from p_grant or j.agent_id is distinct from p_agent or j.agent_key is distinct from p_agent_key
  or j.request is distinct from btrim(p_request) or j.source_entity is distinct from p_entity or j.source_id is distinct from p_source
  or j.source_version is distinct from p_version or coalesce(j.source_snapshot->'selectedContext','{}')<>ctx then raise exception 'agent_idempotency_conflict';end if;
  return to_jsonb(j)||jsonb_build_object('reused',true);
 end if;
 select * into j from public.agent_jobs where organization_id=p_org and created_by=p_actor and grant_id=p_grant and agent_id=p_agent
 and agent_key=p_agent_key and request=btrim(p_request) and source_entity=p_entity and source_id=p_source and source_version=p_version
 and coalesce(source_snapshot->'selectedContext','{}')=ctx and cancelled_at is null and expires_at>now() order by created_at desc limit 1;
 if found then return to_jsonb(j)||jsonb_build_object('reused',true);end if;
 insert into public.agent_jobs(organization_id,created_by,grant_id,agent_id,agent_key,input_version,idempotency_key,request,source_entity,source_id,source_version,source_snapshot)
 values(p_org,p_actor,p_grant,p_agent,p_agent_key,2,p_key,btrim(p_request),p_entity,p_source,p_version,jsonb_build_object(
 'id',p_source,'entity',p_entity,'title',s->>'title','status',s->>'status','recordVersion',s->>'updated_at',
 'coverage',case when ctx='{}'::jsonb then 'header_metadata_only' else 'explicitly_selected_context' end,
 'selectedSections',p_sections,'selectedContext',ctx,'contextApprovedBy',p_actor,'contextApprovedAt',now())) returning * into j;
 insert into public.agent_audit(job_id,organization_id,actor_id,action) values(j.id,p_org,p_actor,'job_created');
 return to_jsonb(j)||jsonb_build_object('reused',false);
end $$;

-- Keep the original ABI. Even an older server cannot bypass the new dispatch gate.
alter function public.claim_commandcenter_agent_dispatch(uuid,uuid,uuid,text,uuid) rename to step11_legacy_claim_agent_dispatch;
create function public.claim_commandcenter_agent_dispatch(p_actor uuid,p_org uuid,p_job uuid,p_channel text,p_lease uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.agent_jobs%rowtype;r jsonb;
begin
 perform public.agent_assert_manager(p_actor,p_org);
 perform 1 from public.agent_execution_controls where organization_id=p_org and not paused for share;
 if not found then raise exception 'agent_paused';end if;
 select * into j from public.agent_jobs where id=p_job and organization_id=p_org and created_by=p_actor;
 if not found then raise exception 'agent_job_denied';end if;
 perform public.agent_assert_grant(p_actor,p_org,j.grant_id);
 select * into j from public.agent_jobs where id=p_job for update;
 if j.cancelled_at is not null then raise exception 'agent_cancelled';end if;
 if j.dispatch_state='accepted' then return public.step11_legacy_claim_agent_dispatch(p_actor,p_org,p_job,p_channel,p_lease);end if;
 if j.budget_credits is null or j.budget_approved_by is null or j.provider_limit_reference is null then raise exception 'agent_budget_required';end if;
 if j.dispatch_attempts>=j.max_attempts then raise exception 'agent_attempt_limit';end if;
 r=public.step11_legacy_claim_agent_dispatch(p_actor,p_org,p_job,p_channel,p_lease);
 update public.agent_jobs set dispatch_attempts=dispatch_attempts+1,last_dispatch_error=null where id=j.id returning * into j;
 return to_jsonb(j);
end $$;

create function public.finish_agent_workflow_dispatch(p_actor uuid,p_org uuid,p_job uuid,p_lease uuid,p_url text,p_run text,p_error text)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_error is not null and p_error not in('credential','permission','channel','not_runnable','rate_limited','provider_unavailable','network','timeout','receipt','unknown') then raise exception 'agent_error_invalid';end if;
 if p_url is not null and p_error is not null then raise exception 'agent_error_invalid';end if;
 perform public.finish_commandcenter_agent_dispatch(p_actor,p_org,p_job,p_lease,p_url,p_run);
 update public.agent_jobs set last_dispatch_error=p_error where id=p_job and organization_id=p_org and created_by=p_actor;
end $$;

-- Only the existing verified chair may approve spend, pause/resume or reconcile costs.
create function public.approve_agent_workflow_budget(p_org uuid,p_job uuid,p_reference text,p_attempts integer)
returns void language plpgsql security definer set search_path='' as $$
declare a uuid:=auth.uid();j public.agent_jobs%rowtype;
begin
 perform private.f1_lock();
 if not private.f1_chair(p_org) then raise exception 'agent_access_denied';end if;
 if p_reference is null or length(btrim(p_reference)) not between 5 and 300 or p_attempts is null or p_attempts not between 1 and 3 then raise exception 'agent_budget_required';end if;
 select * into j from public.agent_jobs where id=p_job and organization_id=p_org;
 if not found or j.created_by<>a then raise exception 'agent_job_denied';end if;
 perform public.agent_assert_grant(a,p_org,j.grant_id);
 select * into j from public.agent_jobs where id=p_job for update;
 if j.cancelled_at is not null or j.result_received_at is not null or j.expires_at<=now() or j.dispatch_state in('accepted','dispatching') then raise exception 'agent_job_closed';end if;
 if p_attempts<j.dispatch_attempts then raise exception 'agent_attempt_limit';end if;
 update public.agent_jobs set budget_credits=5,budget_approved_by=a,budget_approved_at=now(),provider_limit_reference=btrim(p_reference),max_attempts=p_attempts where id=p_job;
 insert into public.agent_audit(job_id,organization_id,actor_id,action,metadata) values(p_job,p_org,a,'budget_approved',jsonb_build_object('allocated_credits',5,'max_attempts',p_attempts,'actual_provider_cost_known',false));
end $$;
create function public.set_agent_workflow_pause(p_org uuid,p_paused boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.f1_lock();
 if not private.f1_chair(p_org) or p_paused is null then raise exception 'agent_access_denied';end if;
 insert into public.agent_execution_controls(organization_id,paused,changed_by) values(p_org,p_paused,auth.uid())
 on conflict(organization_id) do update set paused=excluded.paused,changed_by=excluded.changed_by,changed_at=now();
 insert into public.audit_log(organization_id,entity_type,entity_id,action,actor_id,entity_label,metadata) values(p_org,'agent_execution_controls',p_org,'updated',auth.uid(),'Agentuitvoering',jsonb_build_object('paused',p_paused));
end $$;
create function public.record_agent_workflow_cost(p_org uuid,p_job uuid,p_credits numeric)
returns void language plpgsql security definer set search_path='' as $$
declare j public.agent_jobs%rowtype;
begin
 perform private.f1_lock();
 if not private.f1_chair(p_org) or p_credits is null or p_credits<0 or p_credits>99999999 or scale(p_credits)>2 then raise exception 'agent_access_denied';end if;
 -- Lock controls before jobs, matching dispatch order.
 insert into public.agent_execution_controls(organization_id,paused,changed_by) values(p_org,true,auth.uid()) on conflict do nothing;
 perform 1 from public.agent_execution_controls where organization_id=p_org for update;
 select * into j from public.agent_jobs where id=p_job and organization_id=p_org for update;
 if not found or j.budget_credits is null then raise exception 'agent_job_denied';end if;
 update public.agent_jobs set actual_credits=p_credits,cost_recorded_by=auth.uid(),cost_recorded_at=now() where id=p_job;
 if p_credits>j.budget_credits then update public.agent_execution_controls set paused=true,changed_by=auth.uid(),changed_at=now() where organization_id=p_org;end if;
 insert into public.agent_audit(job_id,organization_id,actor_id,action,metadata) values(p_job,p_org,auth.uid(),'cost_recorded',jsonb_build_object('credits',p_credits,'over_budget',p_credits>j.budget_credits));
end $$;

create function public.cancel_agent_workflow_job(p_actor uuid,p_org uuid,p_job uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare j public.agent_jobs%rowtype;
begin
 perform public.agent_assert_manager(p_actor,p_org);
 select * into j from public.agent_jobs where id=p_job and organization_id=p_org and created_by=p_actor for update;
 if not found then raise exception 'agent_job_denied';end if;
 if j.result_received_at is not null then raise exception 'agent_job_closed';end if;
 if j.cancelled_at is not null then return;end if;
 update public.agent_jobs set cancelled_at=now(),expires_at=least(expires_at,now()) where id=p_job;
 insert into public.agent_audit(job_id,organization_id,actor_id,action) values(p_job,p_org,p_actor,'cancelled');
end $$;

alter function public.submit_commandcenter_agent_result(uuid,uuid,uuid,uuid,uuid,jsonb) rename to step11_legacy_submit_agent_result;
create function public.submit_commandcenter_agent_result(p_actor uuid,p_org uuid,p_grant uuid,p_job uuid,p_key uuid,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.agent_jobs%rowtype;
begin
 perform public.agent_assert_grant(p_actor,p_org,p_grant);
 select * into j from public.agent_jobs where id=p_job and organization_id=p_org and created_by=p_actor and grant_id=p_grant for update;
 if not found then raise exception 'agent_job_denied';end if;
 if j.cancelled_at is not null then raise exception 'agent_cancelled';end if;
 return public.step11_legacy_submit_agent_result(p_actor,p_org,p_grant,p_job,p_key,p_payload);
end $$;

create function public.record_agent_workflow_run(p_actor uuid,p_org uuid,p_job uuid,p_run text,p_status text)
returns void language plpgsql security invoker set search_path='' as $$
declare j public.agent_jobs%rowtype;
begin
 select * into j from public.agent_jobs where id=p_job and organization_id=p_org and created_by=p_actor;
 if not found then raise exception 'agent_job_denied';end if;
 perform public.agent_assert_grant(p_actor,p_org,j.grant_id);
 select * into j from public.agent_jobs where id=p_job for update;
 if j.provider_run_id is distinct from p_run or p_run is null or p_status is null or p_status not in('queued','in_progress','suspended','completed','failed') then raise exception 'agent_receipt_invalid';end if;
 update public.agent_jobs set provider_status=p_status,provider_status_checked_at=now() where id=p_job;
 insert into public.agent_audit(job_id,organization_id,actor_id,action,metadata) values(p_job,p_org,p_actor,'run_status_checked',jsonb_build_object('status',p_status));
end $$;

revoke all on function public.create_agent_workflow_job(uuid,uuid,uuid,text,text,uuid,text,text,uuid,timestamptz,jsonb,text,text,boolean),
 public.claim_commandcenter_agent_dispatch(uuid,uuid,uuid,text,uuid),
 public.finish_agent_workflow_dispatch(uuid,uuid,uuid,uuid,text,text,text),
 public.submit_commandcenter_agent_result(uuid,uuid,uuid,uuid,uuid,jsonb),
 public.cancel_agent_workflow_job(uuid,uuid,uuid),
 public.record_agent_workflow_run(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.create_agent_workflow_job(uuid,uuid,uuid,text,text,uuid,text,text,uuid,timestamptz,jsonb,text,text,boolean),
 public.claim_commandcenter_agent_dispatch(uuid,uuid,uuid,text,uuid),
 public.finish_agent_workflow_dispatch(uuid,uuid,uuid,uuid,text,text,text),
 public.submit_commandcenter_agent_result(uuid,uuid,uuid,uuid,uuid,jsonb),
 public.cancel_agent_workflow_job(uuid,uuid,uuid),
 public.record_agent_workflow_run(uuid,uuid,uuid,text,text) to service_role;
revoke all on function public.approve_agent_workflow_budget(uuid,uuid,text,integer),public.set_agent_workflow_pause(uuid,boolean),public.record_agent_workflow_cost(uuid,uuid,numeric) from public,anon,service_role;
grant execute on function public.approve_agent_workflow_budget(uuid,uuid,text,integer),public.set_agent_workflow_pause(uuid,boolean),public.record_agent_workflow_cost(uuid,uuid,numeric) to authenticated;

-- Operator-confirmed handoff references, not a second document or accounting register.
create table public.agent_document_handoffs(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 job_id uuid not null references public.agent_jobs(id),
 artifact_sha256 text not null check(artifact_sha256 ~ '^[a-f0-9]{64}$'),
 kind text not null check(kind in('google_document','assist_manual')),
 reference text not null check(length(reference) between 5 and 500),
 period text check(length(period) between 3 and 80),
 evidence_layer text not null default 'operator_confirmed' check(evidence_layer='operator_confirmed'),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 unique(job_id,kind,artifact_sha256,reference)
);
alter table public.agent_document_handoffs enable row level security;
revoke all on public.agent_document_handoffs from public,anon,authenticated;
grant select,insert on public.agent_document_handoffs to service_role;
create function public.record_agent_document_handoff(p_actor uuid,p_org uuid,p_job uuid,p_sha text,p_kind text,p_reference text,p_period text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare j public.agent_jobs%rowtype; answer uuid;
begin
 perform public.agent_assert_manager(p_actor,p_org);
 select * into j from public.agent_jobs where id=p_job and organization_id=p_org and created_by=p_actor for share;
 if not found or j.review<>'accepted' or j.result_received_at is null then raise exception 'agent_result_missing';end if;
 if p_kind is null or p_kind not in('google_document','assist_manual') or p_sha is null or p_sha !~ '^[a-f0-9]{64}$' or p_reference is null then raise exception 'agent_handoff_invalid';end if;
 if p_kind='google_document' and p_reference !~ '^https://docs[.]google[.]com/document/d/[A-Za-z0-9_-]+(/edit)?$' then raise exception 'agent_handoff_invalid';end if;
 if p_kind='assist_manual' and (p_period is null or length(btrim(p_period))<3) then raise exception 'agent_handoff_invalid';end if;
 insert into public.agent_document_handoffs(organization_id,job_id,artifact_sha256,kind,reference,period,created_by)
 values(p_org,p_job,p_sha,p_kind,p_reference,p_period,p_actor) on conflict(job_id,kind,artifact_sha256,reference) do nothing returning id into answer;
 if answer is null then select id into answer from public.agent_document_handoffs where job_id=p_job and kind=p_kind and artifact_sha256=p_sha and reference=p_reference;end if;
 return answer;
end $$;
revoke all on function public.record_agent_document_handoff(uuid,uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.record_agent_document_handoff(uuid,uuid,uuid,text,text,text,text) to service_role;

-- Review authority is checked in the same transaction, not only in the UI.
create function public.review_agent_workflow_result(p_org uuid,p_job uuid,p_review text)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.f1_lock();
 if not private.f1_chair(p_org) then raise exception 'agent_access_denied';end if;
 perform public.review_commandcenter_agent_result(auth.uid(),p_org,p_job,p_review);
end $$;
revoke all on function public.review_agent_workflow_result(uuid,uuid,text) from public,anon,service_role;
grant execute on function public.review_agent_workflow_result(uuid,uuid,text) to authenticated;
