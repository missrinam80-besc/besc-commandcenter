-- No seed rewards, earning rates, channel selection or automatic activation.
create function private.rewards_staff(o uuid, u uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.organization_members m join auth.users a on a.id=m.user_id
 left join public.organization_access_roles r on r.id=m.access_role_id and r.organization_id=m.organization_id and r.deleted_at is null
 where m.organization_id=o and m.user_id=u and m.status='active' and (a.banned_until is null or a.banned_until<=now())
 and (m.role in ('admin','board') or 'manageRewards'=any(coalesce(r.capabilities,'{}'))));
$$;
create function private.rewards_member(o uuid, u uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.organization_members m
 join public.profiles p on p.id=m.user_id join auth.users a on a.id=p.id
 join auth.identities i on i.user_id=p.id and i.provider='discord'
 where m.organization_id=o and m.user_id=u and m.status='active'
 and m.role in ('admin','board','member','volunteer') and (a.banned_until is null or a.banned_until<=now())
 and p.discord_user_id ~ '^[1-9][0-9]{16,19}$'
 and p.discord_user_id=coalesce(i.identity_data->>'provider_id',i.identity_data->>'sub',i.provider_id));
$$;
create function private.rewards_read(o uuid,u uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.rewards_staff(o,auth.uid()) or (u=auth.uid() and private.rewards_member(o,u));
$$;
revoke all on function private.rewards_staff(uuid,uuid),private.rewards_member(uuid,uuid),private.rewards_read(uuid,uuid) from public,anon,authenticated;
grant execute on function private.rewards_read(uuid,uuid) to authenticated;

create table public.reward_accounts(
 organization_id uuid not null references public.organizations(id), user_id uuid not null references public.profiles(id),
 xp bigint not null default 0 check(xp between 0 and 9000000000000),
 bucks bigint not null default 0 check(bucks between 0 and 9000000000000),
 reserved bigint not null default 0 check(reserved>=0 and reserved<=bucks),
 primary key(organization_id,user_id)
);
create table public.reward_catalog(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 title text not null check(length(title) between 1 and 120), description text not null check(length(description)<=2000),
 price integer not null check(price between 1 and 1000000), active boolean not null default false,
 stock integer check(stock between 0 and 1000000), version integer not null default 1,
 unique(organization_id,id)
);
create table public.reward_requests(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, user_id uuid not null,
 reward_id uuid not null, title text not null, description text not null, price integer not null check(price>0),
 status text not null default 'pending' check(status in ('pending','approved','rejected','cancelled','fulfilled')),
 reason text not null default '', decided_by uuid references public.profiles(id),
 created_at timestamptz not null default now(), decided_at timestamptz, version integer not null default 1,
 foreign key(organization_id,user_id) references public.reward_accounts(organization_id,user_id),
 foreign key(organization_id,reward_id) references public.reward_catalog(organization_id,id), unique(organization_id,id)
);
create table public.reward_ledger(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, user_id uuid not null,
 actor_id uuid not null references public.profiles(id), kind text not null check(kind in ('manual','correction','activity','reserve','spend','release','fulfill')),
 xp_delta integer not null default 0, bucks_delta integer not null default 0, reserved_delta integer not null default 0,
 reason text not null check(length(reason) between 1 and 1000), request_id uuid, correction_of uuid,
 metadata jsonb not null default '{}', created_at timestamptz not null default clock_timestamp(),
 foreign key(organization_id,user_id) references public.reward_accounts(organization_id,user_id),
 foreign key(organization_id,request_id) references public.reward_requests(organization_id,id),
 unique(organization_id,id), foreign key(organization_id,correction_of) references public.reward_ledger(organization_id,id)
);
create unique index reward_one_correction on public.reward_ledger(correction_of) where correction_of is not null;
create table public.reward_rules(
 organization_id uuid not null references public.organizations(id), guild_id text not null check(guild_id ~ '^[1-9][0-9]{16,19}$'),
 kind text not null check(kind in ('text','voice')), channel_ids text[] not null default '{}',
 xp integer not null check(xp between 0 and 100000), bucks integer not null check(bucks between 0 and 100000),
 cooldown_seconds integer not null check(cooldown_seconds between 60 and 86400),
 daily_xp integer not null check(daily_xp between 0 and 1000000), daily_bucks integer not null check(daily_bucks between 0 and 1000000),
 enabled boolean not null default false, version integer not null default 1,
 voice_min_participants integer not null default 2 check(voice_min_participants between 1 and 1000),
 exclude_muted boolean not null default true, exclude_deafened boolean not null default true, exclude_afk boolean not null default true,
 check(xp>0 or bucks>0), check(daily_xp>=xp and daily_bucks>=bucks),
 primary key(organization_id,guild_id,kind)
);
create table public.reward_settings(
 organization_id uuid primary key references public.organizations(id),
 level_thresholds bigint[] not null default '{}', version integer not null default 1
);
create table public.reward_idempotency(
 organization_id uuid not null, client_id text not null, operation text not null, key text not null,
 request_hash text not null, response jsonb, created_at timestamptz not null default now(),
 primary key(organization_id,client_id,operation,key)
);
create index reward_ledger_account_time on public.reward_ledger(organization_id,user_id,created_at desc,id);
create index reward_request_queue on public.reward_requests(organization_id,status,created_at desc,id);

do $$ declare t text; begin
 foreach t in array array['reward_accounts','reward_catalog','reward_requests','reward_ledger','reward_rules','reward_settings','reward_idempotency'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
  if t in ('reward_accounts','reward_requests','reward_ledger') then
   execute format('grant select on public.%I to authenticated',t);
   execute format('create policy reward_read on public.%I for select to authenticated using(private.rewards_read(organization_id,user_id))',t);
  end if;
 end loop;
end $$;
-- Other reads also go through the scoped operation so draft catalog, settings and
-- rules never become visible through an unguarded service-role adapter.

create function private.reward_operation(o uuid,u uuid,c text,g text,op text,d jsonb,k text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 staff boolean:=private.rewards_staff(o,u); member boolean:=private.rewards_member(o,u);
 a public.reward_accounts; item public.reward_catalog; req public.reward_requests;
 rule public.reward_rules; prior public.reward_ledger; idem public.reward_idempotency;
 target uuid:=u; result jsonb; h text; dx integer:=0; db integer:=0; dr integer:=0;
 why text; entry_kind text; rid uuid; corr uuid; v integer; off integer;
 earned_x bigint; earned_b bigint; last_at timestamptz; end_at timestamptz; start_at timestamptz; last_end timestamptz;
 thresholds bigint[]; channels text[]; used integer;
begin
 if op='activity_config' then
  return jsonb_build_object('rules',coalesce((select jsonb_agg(to_jsonb(r)) from public.reward_rules r where r.organization_id=o and r.guild_id=g and r.enabled),'[]'::jsonb));
 end if;
 if u is null or (not staff and not member) then raise exception 'rewards_forbidden' using errcode='42501'; end if;
 if jsonb_typeof(d)<>'object' then return jsonb_build_object('error','invalid_fields'); end if;
 if op in ('grant','correct','catalog_save','rule_save','levels_save','decide','fulfill','manage') and not staff then
  raise exception 'rewards_forbidden' using errcode='42501';
 end if;
 if op in ('account','catalog','requests','request','cancel','activity') and not member then
  return jsonb_build_object('error','linked_membership_required');
 end if;
 if op in ('account','catalog','requests','manage','activity_config') then
  off:=coalesce((d->>'offset')::integer,0);
  if off<0 or off>99975 then return jsonb_build_object('error','invalid_fields'); end if;
  if op='account' then
   select * into a from public.reward_accounts where organization_id=o and user_id=u;
   return jsonb_build_object('xp',coalesce(a.xp,0),'bucks',coalesce(a.bucks,0),'reserved',coalesce(a.reserved,0),'available',coalesce(a.bucks-a.reserved,0),
    'level',(select count(*) from public.reward_settings s,unnest(s.level_thresholds) t where s.organization_id=o and t<=coalesce(a.xp,0)),
    'ledger',coalesce((select jsonb_agg(to_jsonb(l)) from (select id,kind,xp_delta,bucks_delta,reserved_delta,reason,created_at from public.reward_ledger where organization_id=o and user_id=u order by created_at desc,id desc limit 25 offset off) l),'[]'::jsonb));
  elsif op='catalog' then
   return jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(x)) from (select r.id,r.title,r.description,r.price,r.version,
     case when r.stock is null then null else greatest(0,r.stock-(select count(*) from public.reward_requests q where q.organization_id=o and q.reward_id=r.id and q.status in ('pending','approved','fulfilled'))) end as available_stock
    from public.reward_catalog r where r.organization_id=o and r.active order by r.title,r.id limit 25 offset off) x),'[]'::jsonb));
  elsif op='requests' then
   return jsonb_build_object('requests',coalesce((select jsonb_agg(to_jsonb(x)) from (select id,title,price,status,reason,version,created_at,decided_at from public.reward_requests where organization_id=o and user_id=u order by created_at desc,id desc limit 25 offset off) x),'[]'::jsonb));
  elsif op='activity_config' then
   -- Service-only wrapper; never exposes other guilds, user records or secrets.
   return jsonb_build_object('rules',coalesce((select jsonb_agg(to_jsonb(r)) from public.reward_rules r where r.organization_id=o and r.guild_id=g and r.enabled),'[]'::jsonb));
  else
   return jsonb_build_object('catalog',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.reward_catalog where organization_id=o order by title,id limit 25 offset off) x),'[]'::jsonb),
    'requests',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.reward_requests where organization_id=o order by (status='pending') desc,created_at desc,id desc limit 25 offset off) x),'[]'::jsonb),
    'accounts',coalesce((select jsonb_agg(to_jsonb(x)) from (select acct.*,p.display_name from public.reward_accounts acct join public.profiles p on p.id=acct.user_id where acct.organization_id=o order by acct.user_id limit 25 offset off) x),'[]'::jsonb),
    'participants',coalesce((select jsonb_agg(to_jsonb(x)) from (select m.user_id,p.display_name from public.organization_members m join public.profiles p on p.id=m.user_id where m.organization_id=o and private.rewards_member(o,m.user_id) order by m.user_id limit 25 offset off) x),'[]'::jsonb),
    'rules',coalesce((select jsonb_agg(to_jsonb(r)) from public.reward_rules r where r.organization_id=o),'[]'::jsonb),
    'settings',coalesce((select to_jsonb(s) from public.reward_settings s where s.organization_id=o),'{}'::jsonb),
    'servers',coalesce((select jsonb_agg(jsonb_build_object('guild_id',s.guild_id,'name',s.name)) from public.discord_bot_servers s where s.organization_id=o),'[]'::jsonb),
    'ledger',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.reward_ledger where organization_id=o order by created_at desc,id desc limit 25 offset off) x),'[]'::jsonb));
  end if;
 end if;
 if op not in ('grant','correct','catalog_save','rule_save','levels_save','decide','fulfill','request','cancel','activity')
  or k is null or length(k) not between 8 and 128 then return jsonb_build_object('error','invalid_fields'); end if;
 h:=encode(sha256(convert_to(jsonb_build_object('actor',u,'guild',g,'data',d)::text,'UTF8')),'hex');
 insert into public.reward_idempotency values(o,c,op,k,h,null,now()) on conflict do nothing;
 select * into idem from public.reward_idempotency where organization_id=o and client_id=c and operation=op and key=k for update;
 if idem.request_hash<>h then return jsonb_build_object('error','idempotency_conflict'); end if;
 if idem.response is not null then return idem.response; end if;
 -- The inner block makes rejected operations atomic while persisting their
 -- deterministic business outcome for safe retries with the same key.
 begin
 if op='catalog_save' then
  if length(trim(d->>'title')) not between 1 and 120 or length(d->>'description')>2000 or (d->>'price')::integer not between 1 and 1000000 then raise exception 'invalid_fields'; end if;
  rid:=coalesce((d->>'id')::uuid,gen_random_uuid());
  select * into item from public.reward_catalog where organization_id=o and id=rid for update;
  if item.id is not null and item.version is distinct from (d->>'version')::integer then raise exception 'stale_version'; end if;
  if item.id is null and d->>'id' is not null then raise exception 'not_found'; end if;
  select count(*) into used from public.reward_requests where organization_id=o and reward_id=rid and status in ('pending','approved','fulfilled');
  if d->>'stock' is not null and (d->>'stock')::integer<used then raise exception 'stock_reserved'; end if;
  insert into public.reward_catalog(id,organization_id,title,description,price,active,stock)
   values(rid,o,trim(d->>'title'),d->>'description',(d->>'price')::integer,coalesce((d->>'active')::boolean,false),(d->>'stock')::integer)
   on conflict(id) do update set title=excluded.title,description=excluded.description,price=excluded.price,active=excluded.active,stock=excluded.stock,version=public.reward_catalog.version+1 where public.reward_catalog.organization_id=o;
  result:=jsonb_build_object('id',rid,'ok',true);
 elsif op='rule_save' then
  if d->>'guild_id' !~ '^[1-9][0-9]{16,19}$' or d->>'kind' not in ('text','voice') or jsonb_typeof(d->'channel_ids')<>'array' then raise exception 'invalid_fields'; end if;
  if not exists(select 1 from public.discord_bot_servers s where s.organization_id=o and s.guild_id=d->>'guild_id') then raise exception 'server_unavailable'; end if;
  select array_agg(x) into channels from jsonb_array_elements_text(d->'channel_ids') x;
  if coalesce(cardinality(channels),0)>100 or exists(select 1 from unnest(channels) x where x !~ '^[1-9][0-9]{16,19}$') then raise exception 'invalid_fields'; end if;
  if (d->>'enabled')::boolean and coalesce(cardinality(channels),0)=0 then raise exception 'channels_required'; end if;
  -- Serialize creation too, not only updates, for reliable version checks.
  perform pg_advisory_xact_lock(hashtextextended(o::text||':rule:'||(d->>'guild_id')||':'||(d->>'kind'),0));
  select * into rule from public.reward_rules where organization_id=o and guild_id=d->>'guild_id' and kind=d->>'kind' for update;
  if coalesce(rule.version,0)<>coalesce((d->>'version')::integer,0) then raise exception 'stale_version'; end if;
  insert into public.reward_rules(organization_id,guild_id,kind,channel_ids,xp,bucks,cooldown_seconds,daily_xp,daily_bucks,enabled,voice_min_participants,exclude_muted,exclude_deafened,exclude_afk)
   values(o,d->>'guild_id',d->>'kind',coalesce(channels,'{}'),(d->>'xp')::integer,(d->>'bucks')::integer,(d->>'cooldown_seconds')::integer,(d->>'daily_xp')::integer,(d->>'daily_bucks')::integer,coalesce((d->>'enabled')::boolean,false),coalesce((d->>'voice_min_participants')::integer,2),coalesce((d->>'exclude_muted')::boolean,true),coalesce((d->>'exclude_deafened')::boolean,true),coalesce((d->>'exclude_afk')::boolean,true))
   on conflict(organization_id,guild_id,kind) do update set channel_ids=excluded.channel_ids,xp=excluded.xp,bucks=excluded.bucks,cooldown_seconds=excluded.cooldown_seconds,daily_xp=excluded.daily_xp,daily_bucks=excluded.daily_bucks,enabled=excluded.enabled,voice_min_participants=excluded.voice_min_participants,exclude_muted=excluded.exclude_muted,exclude_deafened=excluded.exclude_deafened,exclude_afk=excluded.exclude_afk,version=public.reward_rules.version+1;
  result:=jsonb_build_object('ok',true);
 elsif op='levels_save' then
  select array_agg(x::bigint order by ord) into thresholds from jsonb_array_elements_text(d->'thresholds') with ordinality t(x,ord);
  thresholds:=coalesce(thresholds,'{}');
  if cardinality(thresholds)>100 or exists(select 1 from unnest(thresholds) with ordinality t(x,n) where x<=0 or x>9000000000000 or (n>1 and x<=thresholds[n-1])) then raise exception 'invalid_fields'; end if;
  perform pg_advisory_xact_lock(hashtextextended(o::text||':levels',0));
  select version into v from public.reward_settings where organization_id=o for update;
  if coalesce(v,0)<>coalesce((d->>'version')::integer,0) then raise exception 'stale_version'; end if;
  insert into public.reward_settings values(o,thresholds,1) on conflict(organization_id) do update set level_thresholds=excluded.level_thresholds,version=public.reward_settings.version+1;
  result:=jsonb_build_object('ok',true);
 else
  if op in ('grant','correct') then target:=(d->>'user_id')::uuid; end if;
  if op in ('cancel','decide','fulfill') then
   select * into req from public.reward_requests where organization_id=o and id=(d->>'id')::uuid for update;
   if req.id is null or (op='cancel' and req.user_id<>u) then raise exception 'not_found'; end if;
   if req.version is distinct from (d->>'version')::integer then raise exception 'stale_version'; end if;
   target:=req.user_id;
  end if;
  -- Staff can reject/release a former member's reservation, but cannot grant
  -- them more points or approve a reward after their identity is removed.
  if not private.rewards_member(o,target) and not (op='decide' and d->>'decision'='rejected') and op<>'fulfill' then raise exception 'linked_membership_required'; end if;
  insert into public.reward_accounts(organization_id,user_id) values(o,target) on conflict do nothing;
  select * into a from public.reward_accounts where organization_id=o and user_id=target for update;
  if op='grant' then
   dx:=(d->>'xp')::integer; db:=(d->>'bucks')::integer;
   if dx<0 or db<0 or dx>1000000 or db>1000000 or (dx=0 and db=0) then raise exception 'invalid_fields'; end if;
   why:=trim(d->>'reason'); entry_kind:='manual';
  elsif op='correct' then
   select * into prior from public.reward_ledger where organization_id=o and user_id=target and id=(d->>'entry_id')::uuid;
   if prior.id is null or prior.kind not in ('manual','activity') or exists(select 1 from public.reward_ledger where correction_of=prior.id) then raise exception 'correction_unavailable'; end if;
   dx:=-prior.xp_delta; db:=-prior.bucks_delta; corr:=prior.id; why:=trim(d->>'reason'); entry_kind:='correction';
  elsif op='activity' then
   select * into rule from public.reward_rules where organization_id=o and guild_id=g and kind=d->>'kind';
   if rule.organization_id is null or not rule.enabled or not coalesce(d->>'channel_id'=any(rule.channel_ids),false) then raise exception 'activity_disabled'; end if;
   end_at:=(d->>'occurred_at')::timestamptz;
   if end_at is null or end_at<clock_timestamp()-interval '2 minutes' or end_at>clock_timestamp()+interval '5 seconds' then raise exception 'activity_expired'; end if;
   if d->>'kind'='voice' then
    start_at:=(d->>'started_at')::timestamptz;
    select max((metadata->>'occurred_at')::timestamptz) into last_end from public.reward_ledger where organization_id=o and user_id=u and kind='activity' and metadata->>'guild_id'=g and metadata->>'kind'='voice';
    if start_at is null or end_at-start_at<interval '60 seconds' or end_at-start_at>interval '75 seconds' or (last_end is not null and start_at<last_end)
     or coalesce((d->>'eligible_participants')::integer,0)<rule.voice_min_participants or (rule.exclude_muted and coalesce((d->>'muted')::boolean,true)) or (rule.exclude_deafened and coalesce((d->>'deafened')::boolean,true)) or (rule.exclude_afk and coalesce((d->>'afk')::boolean,true)) then raise exception 'voice_ineligible'; end if;
   end if;
   select max(created_at),coalesce(sum(xp_delta) filter(where created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'),0),coalesce(sum(bucks_delta) filter(where created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'),0)
    into last_at,earned_x,earned_b from public.reward_ledger where organization_id=o and user_id=u and kind='activity' and metadata->>'guild_id'=g and metadata->>'kind'=d->>'kind';
   if last_at is not null and last_at>clock_timestamp()-make_interval(secs=>rule.cooldown_seconds) then raise exception 'cooldown'; end if;
   dx:=least(rule.xp,greatest(0,rule.daily_xp-earned_x)); db:=least(rule.bucks,greatest(0,rule.daily_bucks-earned_b));
   if dx=0 and db=0 then raise exception 'daily_limit'; end if;
   why:=case when rule.kind='voice' then 'Discord voiceactiviteit' else 'Discord tekstactiviteit' end; entry_kind:='activity';
  elsif op='request' then
   select * into item from public.reward_catalog where organization_id=o and id=(d->>'reward_id')::uuid for update;
   if item.id is null or not item.active then raise exception 'reward_unavailable'; end if;
   if item.version is distinct from (d->>'version')::integer then raise exception 'stale_version'; end if;
   if a.bucks-a.reserved<item.price then raise exception 'insufficient_bucks'; end if;
   if item.stock is not null and (select count(*) from public.reward_requests where organization_id=o and reward_id=item.id and status in ('pending','approved','fulfilled'))>=item.stock then raise exception 'out_of_stock'; end if;
   insert into public.reward_requests(organization_id,user_id,reward_id,title,description,price) values(o,u,item.id,item.title,item.description,item.price) returning * into req;
   rid:=req.id; dr:=item.price; why:='Aangevraagd: '||item.title; entry_kind:='reserve';
  else
   rid:=req.id;
   if op='fulfill' then
    if req.status<>'approved' then raise exception 'invalid_state'; end if;
    update public.reward_requests set status='fulfilled',version=version+1 where id=req.id;
    why:='Afgehandeld: '||req.title; entry_kind:='fulfill';
   else
    if req.status<>'pending' then raise exception 'invalid_state'; end if;
    if op='decide' and req.user_id=u then raise exception 'self_approval_forbidden'; end if;
    if op='decide' and coalesce(d->>'decision','') not in ('approved','rejected') then raise exception 'invalid_fields'; end if;
    if op='decide' and d->>'decision'='rejected' and length(trim(coalesce(d->>'reason','')))=0 then raise exception 'reason_required'; end if;
    dr:=-req.price;
    if op='decide' and d->>'decision'='approved' then db:=-req.price; entry_kind:='spend'; why:='Goedgekeurd: '||req.title;
    else entry_kind:='release'; why:=case when op='cancel' then 'Geannuleerd: '||req.title else trim(d->>'reason') end; end if;
    update public.reward_requests set status=case when op='cancel' then 'cancelled' else d->>'decision' end,reason=coalesce(d->>'reason',''),decided_by=u,decided_at=now(),version=version+1 where id=req.id;
   end if;
  end if;
  if why is null or length(why) not between 1 and 1000 or dx is null or db is null then raise exception 'reason_required'; end if;
  if a.xp+dx<0 or a.bucks+db<a.reserved+dr then raise exception 'insufficient_bucks'; end if;
  update public.reward_accounts set xp=xp+dx,bucks=bucks+db,reserved=reserved+dr where organization_id=o and user_id=target;
  insert into public.reward_ledger(organization_id,user_id,actor_id,kind,xp_delta,bucks_delta,reserved_delta,reason,request_id,correction_of,metadata)
   values(o,target,u,entry_kind,dx,db,dr,why,rid,corr,case when op='activity' then jsonb_build_object('kind',d->>'kind','guild_id',g,'channel_id',d->>'channel_id','occurred_at',end_at,'rule_version',rule.version) else '{}'::jsonb end);
  result:=jsonb_build_object('ok',true,'requestId',rid,'xpDelta',dx,'bucksDelta',db,'reservedDelta',dr);
 end if;
 exception
  when raise_exception then result:=jsonb_build_object('error',sqlerrm);
  when invalid_text_representation or invalid_parameter_value or numeric_value_out_of_range or check_violation or not_null_violation or datetime_field_overflow then result:=jsonb_build_object('error','invalid_fields');
 end;
 update public.reward_idempotency set response=result where organization_id=o and client_id=c and operation=op and key=k;
 return result;
end $$;
revoke all on function private.reward_operation(uuid,uuid,text,text,text,jsonb,text) from public,anon,authenticated;

create function public.rewards_web(op text,d jsonb default '{}',k text default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
 if op='activity' or op='activity_config' then raise exception 'rewards_forbidden' using errcode='42501'; end if;
 return private.reward_web_bridge((d->>'organization_id')::uuid,op,d-'organization_id',k);
end $$;
create function private.reward_web_bridge(o uuid,op text,d jsonb,k text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if op in ('activity','activity_config') then raise exception 'rewards_forbidden' using errcode='42501'; end if;
 return private.reward_operation(o,auth.uid(),'web',null,op,d,k);
end
$$;
revoke all on function public.rewards_web(text,jsonb,text),private.reward_web_bridge(uuid,text,jsonb,text) from public,anon;
grant execute on function public.rewards_web(text,jsonb,text),private.reward_web_bridge(uuid,text,jsonb,text) to authenticated;

create function public.rewards_bot(o uuid,u uuid,c text,g text,op text,d jsonb default '{}',k text default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
 if op not in ('account','catalog','requests','request','cancel','activity','activity_config') then raise exception 'rewards_forbidden' using errcode='42501'; end if;
 return private.reward_operation(o,u,c,g,op,d,k);
end $$;
revoke all on function public.rewards_bot(uuid,uuid,text,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.rewards_bot(uuid,uuid,text,text,text,jsonb,text),private.reward_operation(uuid,uuid,text,text,text,jsonb,text) to service_role;
