-- RE02. No rates, sources, approvals, client scopes or activation are seeded.
create table private.re02_approvals(
 organization_id uuid not null references public.organizations(id), guild_id text not null, kind text not null,
 rule_version integer not null, active_since timestamptz not null, actor_id uuid not null references public.profiles(id),
 primary key(organization_id,guild_id,kind)
);
create table private.re02_twitch_rules(
 organization_id uuid not null references public.organizations(id), broadcaster_id text not null check(broadcaster_id ~ '^[1-9][0-9]{0,19}$'),
 kind text not null check(kind in ('follow','cheer')), xp integer not null check(xp between 0 and 100000),
 bucks integer not null check(bucks between 0 and 100000), daily_xp integer not null check(daily_xp between xp and 1000000),
 daily_bucks integer not null check(daily_bucks between bucks and 1000000), cooldown_seconds integer not null check(cooldown_seconds between 60 and 86400),
 minimum_bits integer not null check(minimum_bits between 1 and 1000000), enabled boolean not null default false,
 version integer not null default 1, active_since timestamptz, check(xp+bucks>0),
 primary key(organization_id,broadcaster_id,kind)
);
create table private.re02_receipts(
 organization_id uuid not null references public.organizations(id), broadcaster_id text not null,
 message_id text not null check(length(message_id) between 1 and 256), facts_hash text not null,
 subscription_id text not null, kind text not null, twitch_user_id text, user_id uuid,
 occurred_at timestamptz not null, received_at timestamptz not null default clock_timestamp(),
 decision text not null, ledger_id uuid, primary key(organization_id,broadcaster_id,message_id)
);
create unique index re02_follow_once on private.re02_receipts(organization_id,broadcaster_id,twitch_user_id)
 where kind='follow' and decision='awarded';
create table private.re02_revocations(
 organization_id uuid not null references public.organizations(id), subscription_id text not null,
 received_at timestamptz not null default clock_timestamp(), primary key(organization_id,subscription_id)
);
create table private.re02_audit(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 actor_id uuid not null references public.profiles(id), action text not null, subject text not null,
 details jsonb not null, reason text not null check(length(reason) between 1 and 1000), created_at timestamptz not null default clock_timestamp()
);
do $$declare t text;begin
 foreach t in array array['re02_approvals','re02_twitch_rules','re02_receipts','re02_revocations','re02_audit'] loop
 execute format('alter table private.%I enable row level security',t);
 execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 end loop;
end$$;

-- Preserve the established monetary operation and add an approval boundary.
alter function private.reward_operation(uuid,uuid,text,text,text,jsonb,text) rename to reward_operation_re01;
create function private.reward_operation(o uuid,u uuid,c text,g text,op text,d jsonb,k text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a private.re02_approvals;r public.reward_rules;result jsonb;
begin
 if op in ('activity','activity_config','rule_save') then
  perform pg_advisory_xact_lock(hashtextextended('re02:'||o::text,0));
 end if;
 if op='activity_config' then
  return jsonb_build_object('rules',coalesce((select jsonb_agg(to_jsonb(qr)) from public.reward_rules qr
   join private.re02_approvals qa using(organization_id,guild_id,kind)
   where qr.organization_id=o and qr.guild_id=g and qr.enabled and qa.rule_version=qr.version),'[]'));
 end if;
 if op='activity' then
  select * into r from public.reward_rules where organization_id=o and guild_id=g and kind=d->>'kind' for update;
  select * into a from private.re02_approvals where organization_id=o and guild_id=g and kind=d->>'kind';
  if a.rule_version is null or a.rule_version<>r.version or not r.enabled
   or coalesce((d->>'occurred_at')::timestamptz<a.active_since,true)
   or (d->>'kind'='voice' and coalesce((d->>'started_at')::timestamptz<a.active_since,true)) then
   return jsonb_build_object('error','activity_disabled');end if;
 end if;
 if op='rule_save' then d:=d||jsonb_build_object('enabled',false);end if;
 result:=private.reward_operation_re01(o,u,c,g,op,d,k);
 if op='rule_save' and result->>'ok'='true' and exists(select 1 from public.reward_rules where organization_id=o and guild_id=d->>'guild_id' and kind=d->>'kind' and not enabled) then
  delete from private.re02_approvals where organization_id=o and guild_id=d->>'guild_id' and kind=d->>'kind';
 end if;
 return result;
end$$;
revoke all on function private.reward_operation_re01(uuid,uuid,text,text,text,jsonb,text) from public,anon,authenticated,service_role;
revoke all on function private.reward_operation(uuid,uuid,text,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function private.reward_operation(uuid,uuid,text,text,text,jsonb,text) to service_role;

create function private.re02_admin(o uuid,op text,d jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.reward_rules;t private.re02_twitch_rules;v integer;active boolean;reason text:=trim(d->>'reason');
begin
 perform private.f1_lock();
 if not private.f2_account(o) or not private.rewards_staff(o,auth.uid()) then raise exception 'rewards_forbidden' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('re02:'||o::text,0));
 if op='state' then return jsonb_build_object('discord',coalesce((select jsonb_agg(to_jsonb(qr)) from public.reward_rules qr where organization_id=o),'[]'),
  'twitch',coalesce((select jsonb_agg(to_jsonb(qt)) from private.re02_twitch_rules qt where organization_id=o),'[]'),
  'audit',coalesce((select jsonb_agg(to_jsonb(x)) from(select q.action,q.subject,q.reason,q.created_at from private.re02_audit q where organization_id=o order by created_at desc,id desc limit 25)x),'[]'));end if;
 if reason is null or length(reason) not between 1 and 1000 then raise exception 'reason_required';end if;
 if op not in ('discord_activation','twitch_save','twitch_activation') or op is null then raise exception 'invalid_operation';end if;
 if jsonb_typeof(d->'version') is distinct from 'number' or (d->>'version')::integer<0 or jsonb_typeof(d->'kind') is distinct from 'string' then raise exception 'invalid_fields';end if;
 if op='discord_activation' and (jsonb_typeof(d->'guild_id') is distinct from 'string' or d->>'kind' not in ('text','voice')) then raise exception 'invalid_fields';end if;
 if op in ('twitch_save','twitch_activation') and (jsonb_typeof(d->'broadcaster_id') is distinct from 'string' or d->>'broadcaster_id' !~ '^[1-9][0-9]{0,19}$' or d->>'kind' not in ('follow','cheer')) then raise exception 'invalid_fields';end if;
 if op<>'twitch_save' and jsonb_typeof(d->'enabled') is distinct from 'boolean' then raise exception 'invalid_fields';end if;
 if op='twitch_save' and exists(select 1 from unnest(array['xp','bucks','daily_xp','daily_bucks','cooldown_seconds','minimum_bits']) n where jsonb_typeof(d->n) is distinct from 'number') then raise exception 'invalid_fields';end if;

 if op='discord_activation' then
  select * into r from public.reward_rules where organization_id=o and guild_id=d->>'guild_id' and kind=d->>'kind' for update;
  if r.version is null or r.version<>(d->>'version')::integer then raise exception 'stale_version';end if;
  active:=(d->>'enabled')::boolean;
  if active is null or(active and cardinality(r.channel_ids)=0) then raise exception 'invalid_fields';end if;
  update public.reward_rules set enabled=active,version=version+1 where organization_id=o and guild_id=r.guild_id and kind=r.kind returning version into v;
  delete from private.re02_approvals where organization_id=o and guild_id=r.guild_id and kind=r.kind;
  if active then insert into private.re02_approvals values(o,r.guild_id,r.kind,v,clock_timestamp(),auth.uid());end if;
 elsif op='twitch_save' then
  select * into t from private.re02_twitch_rules where organization_id=o and broadcaster_id=d->>'broadcaster_id' and kind=d->>'kind' for update;
  if coalesce(t.version,0)<>(d->>'version')::integer then raise exception 'stale_version';end if;
  insert into private.re02_twitch_rules(organization_id,broadcaster_id,kind,xp,bucks,daily_xp,daily_bucks,cooldown_seconds,minimum_bits)
  values(o,d->>'broadcaster_id',d->>'kind',(d->>'xp')::integer,(d->>'bucks')::integer,(d->>'daily_xp')::integer,(d->>'daily_bucks')::integer,(d->>'cooldown_seconds')::integer,(d->>'minimum_bits')::integer)
  on conflict(organization_id,broadcaster_id,kind) do update set xp=excluded.xp,bucks=excluded.bucks,daily_xp=excluded.daily_xp,daily_bucks=excluded.daily_bucks,
   cooldown_seconds=excluded.cooldown_seconds,minimum_bits=excluded.minimum_bits,enabled=false,active_since=null,version=private.re02_twitch_rules.version+1;
 elsif op='twitch_activation' then
  select * into t from private.re02_twitch_rules where organization_id=o and broadcaster_id=d->>'broadcaster_id' and kind=d->>'kind' for update;
  if t.version is null or t.version<>(d->>'version')::integer then raise exception 'stale_version';end if;
  active:=(d->>'enabled')::boolean;if active is null then raise exception 'invalid_fields';end if;
  update private.re02_twitch_rules set enabled=active,active_since=case when active then clock_timestamp() else null end,version=version+1
   where organization_id=o and broadcaster_id=t.broadcaster_id and kind=t.kind;
 else raise exception 'invalid_operation';end if;
 insert into private.re02_audit(organization_id,actor_id,action,subject,details,reason)
 values(o,auth.uid(),op,coalesce(d->>'guild_id',d->>'broadcaster_id')||':'||(d->>'kind'),d-'reason',reason);
 return jsonb_build_object('ok',true);
end$$;
create function public.re02_admin(o uuid,op text,d jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$select private.re02_admin(o,op,d)$$;
revoke all on function private.re02_admin(uuid,text,jsonb),public.re02_admin(uuid,text,jsonb) from public,anon,service_role;
grant execute on function private.re02_admin(uuid,text,jsonb),public.re02_admin(uuid,text,jsonb) to authenticated;

-- Only the verified EventSub server adapter can enter this service-only boundary.
create function private.re02_twitch(o uuid,b text,d jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r private.re02_twitch_rules;prior private.re02_receipts;u uuid;ledger_id uuid;h text;decision text:='disabled';
 x bigint;y bigint;last_at timestamptz;stamp timestamptz:=(d->>'occurred_at')::timestamptz;a public.reward_accounts;
begin
 perform pg_advisory_xact_lock(hashtextextended('re02:'||o::text,0));
 if exists(select 1 from unnest(array['message_id','subscription_id','kind','occurred_at']) n where jsonb_typeof(d->n) is distinct from 'string') then raise exception 'invalid_fields';end if;
 if b !~ '^[1-9][0-9]{0,19}$' or length(d->>'message_id') not between 1 and 256 or length(d->>'subscription_id') not between 1 and 256
  or d->>'kind' not in ('follow','cheer','revocation') or stamp is null then raise exception 'invalid_fields';end if;
 h:=encode(sha256(convert_to(d::text,'UTF8')),'hex');
 select * into prior from private.re02_receipts where organization_id=o and broadcaster_id=b and message_id=d->>'message_id';
 if found then if prior.facts_hash<>h then raise exception 'idempotency_conflict';end if;
  return jsonb_build_object('ok',true,'decision',prior.decision,'duplicate',true);end if;
 if stamp<clock_timestamp()-interval '10 minutes' or stamp>clock_timestamp()+interval '5 seconds' then raise exception 'expired';end if;
 if d->>'kind'='revocation' then
  insert into private.re02_revocations values(o,d->>'subscription_id',clock_timestamp()) on conflict do nothing;
  decision:='revoked';
 elsif not exists(select 1 from private.re02_revocations where organization_id=o and subscription_id=d->>'subscription_id') then
  select * into r from private.re02_twitch_rules where organization_id=o and broadcaster_id=b and kind=d->>'kind' for update;
  u:=private.reward_intake_account(o,d->>'twitch_user_id');
  -- Lock and recheck the real identity, membership and user against concurrent unlink/revocation.
  if u is not null then
   perform 1 from auth.users where id=u for update;
   perform 1 from auth.identities where user_id=u for update;
   perform 1 from public.organization_members where organization_id=o and user_id=u for update;
   perform 1 from public.profiles where id=u for update;
   if private.reward_intake_account(o,d->>'twitch_user_id') is distinct from u then u:=null;end if;
  end if;
  if u is null then decision:='account_ineligible';
  elsif r.enabled and stamp>=r.active_since then
   decision:='eligible';
   if d->>'kind'='follow' and exists(select 1 from private.re02_receipts where organization_id=o and broadcaster_id=b and twitch_user_id=d->>'twitch_user_id' and kind='follow' and re02_receipts.decision='awarded') then decision:='follow_already_awarded';end if;
   if d->>'kind'='cheer' and (coalesce((d->>'bits')::integer,0)<r.minimum_bits or coalesce((d->>'anonymous')::boolean,true)) then decision:='cheer_ineligible';end if;
   insert into public.reward_accounts(organization_id,user_id) values(o,u) on conflict do nothing;
   select * into a from public.reward_accounts where organization_id=o and user_id=u for update;
   select coalesce(sum(xp_delta) filter(where created_at>=(clock_timestamp() at time zone 'UTC')::date at time zone 'UTC'),0),
    coalesce(sum(bucks_delta) filter(where created_at>=(clock_timestamp() at time zone 'UTC')::date at time zone 'UTC'),0),max((metadata->>'occurred_at')::timestamptz)
    into x,y,last_at from public.reward_ledger where organization_id=o and user_id=u and kind='activity' and metadata->>'platform'='twitch' and metadata->>'broadcaster_id'=b and metadata->>'kind'=r.kind;
   if decision='eligible' and last_at is not null and stamp<last_at+make_interval(secs=>r.cooldown_seconds) then decision:='cooldown';end if;
   if decision='eligible' and (x+r.xp>r.daily_xp or y+r.bucks>r.daily_bucks) then decision:='daily_limit';end if;
   if decision='eligible' then
    update public.reward_accounts set xp=xp+r.xp,bucks=bucks+r.bucks where organization_id=o and user_id=u;
    insert into public.reward_ledger(organization_id,user_id,actor_id,kind,xp_delta,bucks_delta,reason,metadata)
     values(o,u,u,'activity',r.xp,r.bucks,'Twitch bevestigd: '||r.kind,jsonb_build_object('platform','twitch','kind',r.kind,'broadcaster_id',b,'message_id',d->>'message_id','subscription_id',d->>'subscription_id','occurred_at',stamp,'rule_version',r.version)) returning reward_ledger.id into ledger_id;
    decision:='awarded';
   end if;
  end if;
 else decision:='subscription_revoked';end if;
 insert into private.re02_receipts values(o,b,d->>'message_id',h,d->>'subscription_id',d->>'kind',d->>'twitch_user_id',u,stamp,clock_timestamp(),decision,ledger_id);
 return jsonb_build_object('ok',true,'decision',decision,'duplicate',false);
end$$;
create function public.re02_twitch(o uuid,b text,d jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.re02_twitch(o,b,d)$$;
revoke all on function private.re02_twitch(uuid,text,jsonb),public.re02_twitch(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function private.re02_twitch(uuid,text,jsonb),public.re02_twitch(uuid,text,jsonb) to service_role;
