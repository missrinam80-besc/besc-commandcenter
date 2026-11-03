-- RE03. Immutable target-balance batches; no source rows, imports or activation seeded.
alter table public.reward_ledger drop constraint reward_ledger_kind_check;
alter table public.reward_ledger add constraint reward_ledger_kind_check check(kind in ('manual','correction','activity','reserve','spend','release','fulfill','refund','external_transfer'));
create table private.re03_batches(
 id uuid primary key, organization_id uuid not null references public.organizations(id),
 broadcaster_id text not null check(broadcaster_id ~ '^[1-9][0-9]{0,19}$'),
 original_sha256 text not null check(original_sha256 ~ '^[a-f0-9]{64}$'),
 export_sha256 text not null check(export_sha256 ~ '^[a-f0-9]{64}$'), cutoff timestamptz not null,
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default clock_timestamp(),
 plan jsonb not null, plan_sha256 text not null, snapshot jsonb not null,
 status text not null default 'prepared' check(status in ('prepared','cancelled','completed')),
 completed_by uuid references public.profiles(id), completed_at timestamptz, reason text, receipt jsonb,
 unique(organization_id,id)
);
-- Separate operational release, absent/false by default. Browser managers cannot enable it.
create table private.re03_release(organization_id uuid primary key references public.organizations(id),enabled boolean not null,reason text not null,changed_at timestamptz not null default clock_timestamp());
alter table private.re03_release enable row level security;
revoke all on private.re03_release from public,anon,authenticated,service_role;
create function private.re03_set_enabled(o uuid,enabled boolean,reason text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if enabled is null or reason is null or length(trim(reason)) not between 1 and 1000 then raise exception 'invalid_fields';end if;
 perform pg_advisory_xact_lock(hashtextextended('re02:'||o::text,0));
 insert into private.re03_release values(o,enabled,trim(reason),clock_timestamp()) on conflict(organization_id) do update set enabled=excluded.enabled,reason=excluded.reason,changed_at=excluded.changed_at;
end$$;
create function public.re03_set_enabled(o uuid,enabled boolean,reason text) returns void language sql security invoker set search_path='' as $$select private.re03_set_enabled(o,enabled,reason)$$;
revoke all on function private.re03_set_enabled(uuid,boolean,text),public.re03_set_enabled(uuid,boolean,text) from public,anon,authenticated;
grant execute on function private.re03_set_enabled(uuid,boolean,text),public.re03_set_enabled(uuid,boolean,text) to service_role;
create unique index re03_one_transition_per_source on private.re03_batches(organization_id,broadcaster_id) where status='completed';
alter table private.re03_batches enable row level security;
revoke all on private.re03_batches from public,anon,authenticated,service_role;

-- Volatile: each SELECT sees a fresh snapshot after any blocking locks.
create function private.re03_snapshot(o uuid) returns jsonb
language plpgsql volatile security invoker set search_path='' as $$
declare a text;l text;n bigint;
begin
 if(select count(*) from public.reward_accounts where organization_id=o)>5000 or(select count(*) from public.reward_ledger where organization_id=o)>100000 then raise exception 'snapshot_capacity';end if;
 select coalesce(string_agg(user_id::text||'|'||xp::text||'|'||bucks::text||'|'||reserved::text,E'\n' order by user_id),'') into a from public.reward_accounts where organization_id=o;
 select count(*),coalesce(string_agg(id::text||'|'||xp_delta::text||'|'||bucks_delta::text||'|'||reserved_delta::text,E'\n' order by id),'') into n,l from public.reward_ledger where organization_id=o;
 return jsonb_build_object('accounts',encode(sha256(convert_to(a,'UTF8')),'hex'),'ledger',encode(sha256(convert_to(l,'UTF8')),'hex'),'ledgerCount',n);
end$$;
revoke all on function private.re03_snapshot(uuid) from public,anon,authenticated,service_role;

create function private.re03_transfer(o uuid,op text,d jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare batch private.re03_batches;row jsonb;plan jsonb:='[]';snap jsonb;u uuid;a public.reward_accounts;
 target bigint;delta bigint;total numeric:=0;v_id uuid:=(d->>'id')::uuid;h text;v_reason text:=trim(d->>'reason');entries integer:=0;
begin
 perform private.f1_lock();
 if not private.f2_account(o) or not private.rewards_staff(o,auth.uid()) then raise exception 'rewards_forbidden' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('re02:'||o::text,0));
 if op='state' then return jsonb_build_object('batches',coalesce((select jsonb_agg(to_jsonb(x)) from(
  select id,broadcaster_id,export_sha256,cutoff,created_at,status,plan_sha256,completed_at from private.re03_batches where organization_id=o order by created_at desc,id desc limit 25)x),'[]'));end if;
 if v_id is null then raise exception 'invalid_fields';end if;
 select * into batch from private.re03_batches where organization_id=o and re03_batches.id=v_id for update;
 if op='read' then
  if batch.id is null then raise exception 'not_found';end if;
  return to_jsonb(batch);
 end if;
 if op='prepare' then
  if exists(select 1 from unnest(array['broadcaster_id','original_sha256','export_sha256','cutoff','declared_total']) n where jsonb_typeof(d->n) is distinct from 'string') or jsonb_typeof(d->'rows') is distinct from 'array' then raise exception 'invalid_fields';end if;
  if batch.id is not null then raise exception 'batch_already_exists';end if;
  if not(d ?& array['original_sha256','broadcaster_id','export_sha256','cutoff','declared_total','rows']) or d->>'broadcaster_id' !~ '^[1-9][0-9]{0,19}$' or d->>'original_sha256' !~ '^[a-f0-9]{64}$' or d->>'export_sha256' !~ '^[a-f0-9]{64}$'
   or jsonb_typeof(d->'rows')<>'array' or jsonb_array_length(d->'rows') not between 1 and 5000
   or(d->>'cutoff')::timestamptz>clock_timestamp() or(d->>'cutoff')::timestamptz is null
   or d->>'declared_total' !~ '^(0|[1-9][0-9]{0,19})$' then raise exception 'invalid_fields';end if;
  if exists(select 1 from private.re03_batches where organization_id=o and broadcaster_id=d->>'broadcaster_id' and status='completed') then raise exception 'source_already_transferred';end if;
  if(select count(distinct x->>'twitch_user_id') from jsonb_array_elements(d->'rows') x)<>jsonb_array_length(d->'rows')
   or(select count(distinct x->>'user_id') from jsonb_array_elements(d->'rows') x)<>jsonb_array_length(d->'rows') then raise exception 'duplicate_mapping';end if;
  lock table public.reward_accounts,public.reward_ledger in share row exclusive mode;
  snap:=private.re03_snapshot(o);
  for row in select value from jsonb_array_elements(d->'rows') order by value->>'twitch_user_id' loop
   if exists(select 1 from unnest(array['twitch_user_id','user_id','target']) n where jsonb_typeof(row->n) is distinct from 'string') then raise exception 'invalid_fields';end if;
   if jsonb_typeof(row)<>'object' or not(row ?& array['twitch_user_id','user_id','target']) or row->>'twitch_user_id' !~ '^[1-9][0-9]{0,19}$' or row->>'target' !~ '^(0|[1-9][0-9]{0,12})$' then raise exception 'invalid_fields';end if;
   u:=private.reward_intake_account(o,row->>'twitch_user_id');
   if u is null or u is distinct from(row->>'user_id')::uuid then raise exception 'mapping_unverified';end if;
   select * into a from public.reward_accounts where organization_id=o and user_id=u;
   target:=(row->>'target')::bigint;delta:=target-coalesce(a.bucks,0);
   if target>9000000000000 or target<coalesce(a.reserved,0) then raise exception 'target_below_reservation_or_out_of_range';end if;
   if delta not between -2147483648 and 2147483647 then raise exception 'difference_out_of_range';end if;
   total:=total+target;
   plan:=plan||jsonb_build_array(jsonb_build_object('twitch_user_id',row->>'twitch_user_id','user_id',u,'target',target::text,'before',coalesce(a.bucks,0)::text,
    'xp',coalesce(a.xp,0)::text,'reserved',coalesce(a.reserved,0)::text,'difference',delta::text));
  end loop;
  if total<>(d->>'declared_total')::numeric then raise exception 'total_mismatch';end if;
  h:=encode(sha256(convert_to(jsonb_build_object('plan',plan,'snapshot',snap,'original',d->>'original_sha256','export',d->>'export_sha256','broadcaster',d->>'broadcaster_id','cutoff',(d->>'cutoff')::timestamptz)::text,'UTF8')),'hex');
  insert into private.re03_batches(id,organization_id,broadcaster_id,original_sha256,export_sha256,cutoff,created_by,plan,plan_sha256,snapshot)
   values(v_id,o,d->>'broadcaster_id',d->>'original_sha256',d->>'export_sha256',(d->>'cutoff')::timestamptz,auth.uid(),plan,h,snap);
  return jsonb_build_object('ok',true,'id',v_id,'plan_sha256',h,'plan',plan,'status','prepared');
 end if;
 if batch.id is null then raise exception 'not_found';end if;
 if d->>'plan_sha256' is distinct from batch.plan_sha256 then raise exception 'plan_changed';end if;
 if op='execute' and batch.status='completed' then return batch.receipt;end if;
 if batch.status<>'prepared' then raise exception 'invalid_state';end if;
 if v_reason is null or length(v_reason) not between 1 and 1000 then raise exception 'reason_required';end if;
 if op='cancel' then
  update private.re03_batches set status='cancelled',reason=v_reason where organization_id=o and re03_batches.id=v_id;
  return jsonb_build_object('ok',true,'status','cancelled');
 end if;
 if op<>'execute' then raise exception 'invalid_operation';end if;
 if not exists(select 1 from private.re03_release where organization_id=o and enabled) then raise exception 'transfer_not_released';end if;
 if d->>'confirmed' is distinct from 'true' or d->>'source_stopped' is distinct from 'true' or d->>'cutoff_confirmed' is distinct from 'true' then raise exception 'explicit_confirmation_required';end if;
 if exists(select 1 from public.reward_rules where organization_id=o and enabled)
  or exists(select 1 from private.re02_twitch_rules where organization_id=o and enabled) then raise exception 'earning_rules_must_be_paused';end if;
 if exists(select 1 from private.re03_batches where organization_id=o and broadcaster_id=batch.broadcaster_id and status='completed') then raise exception 'source_already_transferred';end if;
 -- Prevent mapping changes until the atomic booking commits. A new conflicting identity is prevented by Auth's provider uniqueness.
 for row in select value from jsonb_array_elements(batch.plan) order by value->>'user_id' loop
  u:=(row->>'user_id')::uuid;
  perform 1 from auth.users where auth.users.id=u for update;
  perform 1 from auth.identities where user_id=u for update;
  perform 1 from public.organization_members where organization_id=o and user_id=u for update;
  perform 1 from public.profiles where profiles.id=u for update;
  if private.reward_intake_account(o,row->>'twitch_user_id') is distinct from u then raise exception 'mapping_changed';end if;
 end loop;
 lock table public.reward_accounts,public.reward_ledger in share row exclusive mode;
 if private.re03_snapshot(o) is distinct from batch.snapshot then raise exception 'snapshot_changed';end if;
 for row in select value from jsonb_array_elements(batch.plan) loop
  u:=(row->>'user_id')::uuid;delta:=(row->>'difference')::bigint;
  insert into public.reward_accounts(organization_id,user_id) values(o,u) on conflict do nothing;
  if delta<>0 then
   update public.reward_accounts set bucks=(row->>'target')::bigint where organization_id=o and user_id=u;
   insert into public.reward_ledger(organization_id,user_id,actor_id,kind,bucks_delta,reason,metadata)
    values(o,u,auth.uid(),'external_transfer',delta::integer,v_reason,jsonb_build_object('source','streamelements','batch_id',v_id,'export_sha256',batch.export_sha256,'plan_sha256',batch.plan_sha256,'broadcaster_id',batch.broadcaster_id,'cutoff',batch.cutoff,'before',row->>'before','target',row->>'target'));
   entries:=entries+1;
  end if;
  select * into a from public.reward_accounts where organization_id=o and user_id=u;
  if a.bucks<>(row->>'target')::bigint or a.xp<>(row->>'xp')::bigint or a.reserved<>(row->>'reserved')::bigint then raise exception 'preservation_failed';end if;
 end loop;
 update private.re03_batches set status='completed',completed_by=auth.uid(),completed_at=clock_timestamp(),reason=v_reason,
 receipt=jsonb_build_object('ok',true,'status','completed','id',v_id,'plan_sha256',batch.plan_sha256,'bookings',entries)
 where organization_id=o and re03_batches.id=v_id returning receipt into snap;
 return snap;
end$$;
create function public.re03_transfer(o uuid,op text,d jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$select private.re03_transfer(o,op,d)$$;
revoke all on function private.re03_transfer(uuid,text,jsonb),public.re03_transfer(uuid,text,jsonb) from public,anon,service_role;
grant execute on function private.re03_transfer(uuid,text,jsonb),public.re03_transfer(uuid,text,jsonb) to authenticated;
