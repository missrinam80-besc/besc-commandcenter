-- RE01: additive refund state and bounded, independently paged management views.
-- No seed, saldo import, automatic earning, client scope or existing row update.
alter table public.reward_requests drop constraint reward_requests_status_check;
alter table public.reward_requests add constraint reward_requests_status_check check(status in ('pending','approved','rejected','cancelled','fulfilled','refunded'));
alter table public.reward_ledger drop constraint reward_ledger_kind_check;
alter table public.reward_ledger add constraint reward_ledger_kind_check check(kind in ('manual','correction','activity','reserve','spend','release','fulfill','refund'));

create function private.reward_manage_view(o uuid,u uuid,d jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
 section text:=d->>'section'; q text:=lower(trim(coalesce(d->>'search','')));
 state text:=coalesce(d->>'status','all'); off integer:=coalesce((d->>'offset')::integer,0);
 items jsonb; result jsonb; more boolean;
begin
 if not private.rewards_staff(o,u) then raise exception 'rewards_forbidden' using errcode='42501';end if;
 if section not in ('requests','participants','catalog','ledger','rules') or section is null or length(q)>120 or off<0 or off>99975
  or state not in ('all','pending','approved','rejected','cancelled','fulfilled','refunded') then return jsonb_build_object('error','invalid_fields');end if;
 if section='rules' then
  return jsonb_build_object('rules',coalesce((select jsonb_agg(to_jsonb(r) order by r.guild_id,r.kind) from public.reward_rules r where r.organization_id=o),'[]'::jsonb),
   'settings',coalesce((select to_jsonb(s) from public.reward_settings s where s.organization_id=o),'{}'::jsonb),
   'servers',coalesce((select jsonb_agg(jsonb_build_object('guild_id',s.guild_id,'name',s.name) order by s.guild_id) from public.discord_bot_servers s where s.organization_id=o),'[]'::jsonb));
 elsif section='requests' then
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id desc),'[]'::jsonb) into items from (
   select r.*,p.display_name from public.reward_requests r join public.profiles p on p.id=r.user_id where r.organization_id=o
    and (state='all' or r.status=state) and (q='' or strpos(lower(r.title||' '||coalesce(p.display_name,'')||' '||r.user_id::text),q)>0)
   order by r.created_at desc,r.id desc limit 26 offset off) x;
 elsif section='participants' then
  select coalesce(jsonb_agg(to_jsonb(x) order by lower(coalesce(x.display_name,'')),x.user_id),'[]'::jsonb) into items from (
   select p.id user_id,p.display_name,coalesce(a.xp,0) xp,coalesce(a.bucks,0) bucks,coalesce(a.reserved,0) reserved,private.rewards_member(o,p.id) eligible
   from public.profiles p left join public.reward_accounts a on a.organization_id=o and a.user_id=p.id
   where (a.user_id is not null or private.rewards_member(o,p.id)) and (q='' or strpos(lower(coalesce(p.display_name,'')||' '||p.id::text),q)>0)
   order by lower(coalesce(p.display_name,'')),p.id limit 26 offset off) x;
 elsif section='catalog' then
  select coalesce(jsonb_agg(to_jsonb(x) order by lower(x.title),x.id),'[]'::jsonb) into items from (
   select r.*,case when r.stock is null then null else greatest(0,r.stock-(select count(*) from public.reward_requests a where a.organization_id=o and a.reward_id=r.id and a.status in ('pending','approved','fulfilled'))) end available_stock
   from public.reward_catalog r where r.organization_id=o and (q='' or strpos(lower(r.title),q)>0)
   order by lower(r.title),r.id limit 26 offset off) x;
 else
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id desc),'[]'::jsonb) into items from (
   select l.*,p.display_name,exists(select 1 from public.reward_ledger c where c.organization_id=o and c.correction_of=l.id) corrected,
    actor.display_name actor_name
   from public.reward_ledger l join public.profiles p on p.id=l.user_id join public.profiles actor on actor.id=l.actor_id
   where l.organization_id=o and (q='' or strpos(lower(coalesce(p.display_name,'')||' '||l.user_id::text||' '||l.reason),q)>0)
   order by l.created_at desc,l.id desc limit 26 offset off) x;
 end if;
 more:=jsonb_array_length(items)>25;
 select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into items from jsonb_array_elements(items) with ordinality a(value,ord) where ord<=25;
 result:=jsonb_build_object(section,items,'has_more',more);
 if section='participants' then result:=result||jsonb_build_object('accounts',items);end if;
 return result;
end $$;
revoke all on function private.reward_manage_view(uuid,uuid,jsonb) from public,anon,authenticated;

create or replace function private.reward_operation(o uuid,u uuid,c text,g text,op text,d jsonb,k text)
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
 if op in ('grant','correct','catalog_save','rule_save','levels_save','decide','fulfill','refund','manage') and not staff then
  raise exception 'rewards_forbidden' using errcode='42501';
 end if;
 if op in ('account','catalog','requests','request','cancel','activity') and not member then
  return jsonb_build_object('error','linked_membership_required');
 end if;
 if op='manage' and d ? 'section' then return private.reward_manage_view(o,u,d); end if;
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
   return jsonb_build_object('requests',coalesce((select jsonb_agg(to_jsonb(x)) from (select id,title,description,price,status,reason,version,created_at,decided_at from public.reward_requests where organization_id=o and user_id=u order by created_at desc,id desc limit 25 offset off) x),'[]'::jsonb));
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
 if op not in ('grant','correct','catalog_save','rule_save','levels_save','decide','fulfill','refund','request','cancel','activity')
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
  if op in ('cancel','decide','fulfill','refund') then
   select * into req from public.reward_requests where organization_id=o and id=(d->>'id')::uuid for update;
   if req.id is null or (op='cancel' and req.user_id<>u) then raise exception 'not_found'; end if;
   if req.version is distinct from (d->>'version')::integer then raise exception 'stale_version'; end if;
   target:=req.user_id;
  end if;
  -- Staff can reject/release a former member's reservation, but cannot grant
  -- them more points or approve a reward after their identity is removed.
  if not private.rewards_member(o,target) and not (op='decide' and d->>'decision'='rejected') and op not in ('fulfill','refund') then raise exception 'linked_membership_required'; end if;
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
   if op='refund' then
    if req.status<>'approved' then raise exception 'refund_unavailable'; end if;
    if req.user_id=u then raise exception 'self_approval_forbidden'; end if;
    if d->'confirmed' is distinct from 'true'::jsonb then raise exception 'invalid_fields'; end if;
    why:=trim(d->>'reason');
    select * into prior from public.reward_ledger where organization_id=o and request_id=req.id and kind='spend';
    if prior.id is null or prior.bucks_delta<>-req.price or exists(select 1 from public.reward_ledger where correction_of=prior.id) then raise exception 'refund_unavailable'; end if;
    db:=req.price;corr:=prior.id;entry_kind:='refund';
    update public.reward_requests set status='refunded',reason=why,decided_by=u,decided_at=now(),version=version+1 where id=req.id;
   elsif op='fulfill' then
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

-- CREATE OR REPLACE retains the existing narrow ACLs and owner.
revoke all on function private.reward_operation(uuid,uuid,text,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function private.reward_operation(uuid,uuid,text,text,text,jsonb,text) to service_role;
