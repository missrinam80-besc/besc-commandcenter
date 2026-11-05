begin;
create table private.operations_state (
 organization_id uuid not null references public.organizations(id),
 target text not null check(target in('web','bot','database')),
 observed_at timestamptz not null, received_at timestamptz not null default clock_timestamp(),
 status text not null check(status in('ok','warning','critical')),
 metrics jsonb not null, checks jsonb not null, transitions jsonb not null default '[]'::jsonb,
 primary key(organization_id,target)
);
alter table private.operations_state enable row level security;
revoke all on private.operations_state from public,anon,authenticated,service_role;
comment on table private.operations_state is 'Bounded technical status cache: one row per organization/target and at most twenty status changes; no raw logs, credentials or personal data.';

create function private.ops_record_snapshot(o uuid,t text,observed timestamptz,payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare previous private.operations_state; normalized jsonb; level text; changes jsonb; answer jsonb;
begin
 if auth.role() is distinct from 'service_role' or not exists(select 1 from public.organizations where id=o) then raise exception 'ops_not_authorized' using errcode='42501';end if;
 if t is null or t not in('web','bot','database') or observed is null or observed>clock_timestamp()+interval '5 minutes' or observed<clock_timestamp()-interval '1 day'
 or jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>8192 then raise exception 'ops_invalid_snapshot' using errcode='22023';end if;
 if exists(select 1 from jsonb_object_keys(payload) k where k not in('metrics','checks')) or jsonb_typeof(payload->'metrics') is distinct from 'object' or jsonb_typeof(payload->'checks') is distinct from 'array' then raise exception 'ops_invalid_snapshot' using errcode='22023';end if;
 if jsonb_array_length(payload->'checks') not between 1 and 24 or exists(select 1 from jsonb_each(payload->'metrics') x where x.key not in('disk_total_kib','disk_free_kib','disk_used_pct','inode_used_pct','mem_total_kib','mem_available_kib','swap_used_kib','journal_bytes','failed_units','containers_running','expected_containers','db_bytes','connections','long_transactions','deadlocks') or jsonb_typeof(x.value)<>'number') then raise exception 'ops_invalid_snapshot' using errcode='22023';end if;
 if exists(select 1 from jsonb_each(payload->'metrics') x where (x.value::text)::numeric<0 or (x.value::text)::numeric>1000000000000000) then raise exception 'ops_invalid_snapshot' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements(payload->'checks') x where jsonb_typeof(x) is distinct from 'object' or not(x ?& array['code','level']) or exists(select 1 from jsonb_object_keys(x) k where k not in('code','level'))
 or jsonb_typeof(x->'code') is distinct from 'string' or jsonb_typeof(x->'level') is distinct from 'string' or x->>'code' not in('disk','memory','inodes','container_cc','container_website','container_caddy','container_bot','http_cc','http_website','docker','systemd','log_rotation','database','long_transactions','clock_sync','journal_limit','probe','https_cc','https_website') or x->>'level' not in('ok','warning','critical')) then raise exception 'ops_invalid_snapshot' using errcode='22023';end if;
 if (select count(*) from jsonb_array_elements(payload->'checks'))<>(select count(distinct x->>'code') from jsonb_array_elements(payload->'checks') x) then raise exception 'ops_invalid_snapshot' using errcode='22023';end if;
 select jsonb_agg(x order by x->>'code') into normalized from jsonb_array_elements(payload->'checks') x;
 level:=case when exists(select 1 from jsonb_array_elements(normalized) x where x->>'level'='critical') then 'critical' when exists(select 1 from jsonb_array_elements(normalized) x where x->>'level'='warning') then 'warning' else 'ok' end;
 perform pg_advisory_xact_lock(hashtextextended(o::text||':'||t,0));
 select * into previous from private.operations_state where organization_id=o and target=t;
 if found and previous.observed_at>observed then raise exception 'ops_stale_snapshot' using errcode='40001';end if;
 changes:=coalesce(previous.transitions,'[]'::jsonb);
 if previous.checks is distinct from normalized then
  changes:=changes||jsonb_build_array(jsonb_build_object('at',observed,'status',level,'checks',normalized));
  select coalesce(jsonb_agg(x order by n),'[]'::jsonb) into changes from jsonb_array_elements(changes) with ordinality e(x,n) where n>jsonb_array_length(changes)-20;
 end if;
 insert into private.operations_state(organization_id,target,observed_at,status,metrics,checks,transitions)
 values(o,t,observed,level,payload->'metrics',normalized,changes)
 on conflict(organization_id,target) do update set observed_at=excluded.observed_at,received_at=clock_timestamp(),status=excluded.status,metrics=excluded.metrics,checks=excluded.checks,transitions=excluded.transitions;
 answer:=jsonb_build_object('target',t,'status',level,'recorded',true);return answer;
end$$;

create function private.ops_read_status(o uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$declare answer jsonb;begin
 if not private.f2_account(o) or not exists(select 1 from public.organization_members where organization_id=o and user_id=auth.uid() and role='admin' and status='active') then raise exception 'ops_not_authorized' using errcode='42501';end if;
 select jsonb_agg(jsonb_build_object('target',e.target,'observed_at',s.observed_at,'received_at',s.received_at,
 'status',case when s.target is null then 'pending' when s.observed_at<clock_timestamp()-interval '15 minutes' then 'stale' else s.status end,
 'metrics',coalesce(s.metrics,'{}'::jsonb),'checks',coalesce(s.checks,'[]'::jsonb),'transitions',coalesce(s.transitions,'[]'::jsonb)) order by e.target)
 into answer from(values('web'),('bot'),('database')) e(target) left join private.operations_state s on s.organization_id=o and s.target=e.target;
 return answer;
end$$;

create function private.ops_database_snapshot(o uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$declare metrics jsonb;begin
 if auth.role() is distinct from 'service_role' or not exists(select 1 from public.organizations where id=o) then raise exception 'ops_not_authorized' using errcode='42501';end if;
 select jsonb_build_object('db_bytes',pg_database_size(current_database()),'connections',(select count(*) from pg_stat_activity where datname=current_database()),'long_transactions',(select count(*) from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() and xact_start<clock_timestamp()-interval '5 minutes'),'deadlocks',coalesce((select deadlocks from pg_stat_database where datname=current_database()),0)) into metrics;
 return jsonb_build_object('metrics',metrics,'checks',jsonb_build_array(jsonb_build_object('code','database','level','ok'),jsonb_build_object('code','long_transactions','level',case when(metrics->>'long_transactions')::int>0 then 'warning' else 'ok' end)));
end$$;

create function public.ops_record_snapshot(p_organization_id uuid,p_target text,p_observed_at timestamptz,p_snapshot jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.ops_record_snapshot(p_organization_id,p_target,p_observed_at,p_snapshot)$$;
create function public.ops_read_status(p_organization_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$select private.ops_read_status(p_organization_id)$$;
create function public.ops_database_snapshot(p_organization_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$select private.ops_database_snapshot(p_organization_id)$$;
revoke all on function private.ops_record_snapshot(uuid,text,timestamptz,jsonb),private.ops_read_status(uuid),private.ops_database_snapshot(uuid),public.ops_record_snapshot(uuid,text,timestamptz,jsonb),public.ops_read_status(uuid),public.ops_database_snapshot(uuid) from public,anon,authenticated,service_role;
grant execute on function private.ops_record_snapshot(uuid,text,timestamptz,jsonb),private.ops_database_snapshot(uuid),public.ops_record_snapshot(uuid,text,timestamptz,jsonb),public.ops_database_snapshot(uuid) to service_role;
grant execute on function private.ops_read_status(uuid),public.ops_read_status(uuid) to authenticated;
commit;
