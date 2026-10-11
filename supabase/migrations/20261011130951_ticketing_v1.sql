-- Bot RPCs are service_role-only. Staff uses session-bound wrappers and private
-- functions with live membership checks. Direct staff writes are deliberately denied.
create or replace function private.ticket_staff(p_org uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.organization_members m
 left join public.organization_access_roles r on r.id=m.access_role_id
   and r.organization_id=m.organization_id and r.deleted_at is null
 where m.organization_id=p_org and m.user_id=p_user and m.status='active'
 and (m.role in ('admin','board') or 'manageTickets'=any(coalesce(r.capabilities,'{}'))));
$$;
revoke all on function private.ticket_staff(uuid,uuid) from public,anon,authenticated;
grant execute on function private.ticket_staff(uuid,uuid) to service_role;
create or replace function private.can_manage_tickets(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select private.ticket_staff(p_org,auth.uid());
$$;
revoke all on function private.can_manage_tickets(uuid) from public,anon;
grant execute on function private.can_manage_tickets(uuid) to authenticated,service_role;

create table public.support_tickets (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 client_id text not null, guild_id text not null check(guild_id ~ '^[1-9][0-9]{16,19}$'),
 requester_discord_id text not null check(requester_discord_id ~ '^[1-9][0-9]{16,19}$'),
 subject text not null check(length(subject) between 1 and 160),
 status text not null default 'open' check(status in ('open','in_progress','waiting_requester','closed')),
 assigned_to uuid references public.profiles(id) on delete set null,
 version integer not null default 1, parent_channel_id text not null check(parent_channel_id ~ '^[1-9][0-9]{16,19}$'),
 thread_id text check(thread_id ~ '^[1-9][0-9]{16,19}$'),
 link_status text not null default 'pending' check(link_status in ('pending','linked','failed','uncertain')),
 last_error text, created_at timestamptz not null default now(), closed_at timestamptz,
 purge_at timestamptz,
 unique(guild_id,thread_id), unique(organization_id,id),
 check((status='closed')=(closed_at is not null))
);
-- Deadline is always derived from the recorded closure, never from delivery state.
create function private.ticket_deadline() returns trigger language plpgsql set search_path='' as $$
begin new.purge_at := new.closed_at + interval '180 days'; return new; end $$;
create trigger ticket_deadline before insert or update on public.support_tickets
 for each row execute function private.ticket_deadline();
revoke all on function private.ticket_deadline() from public,anon,authenticated;

create table public.support_ticket_messages (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 ticket_id uuid not null, direction text not null check(direction in ('requester','staff','internal')),
 author_discord_id text, author_user_id uuid references public.profiles(id) on delete set null,
 content text not null check(length(content) between 1 and 4000), source_message_id text,
 created_at timestamptz not null default now(),
 foreign key(organization_id,ticket_id) references public.support_tickets(organization_id,id) on delete cascade,
 unique(ticket_id,source_message_id)
);
create table public.support_ticket_audit (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, ticket_id uuid not null,
 actor_user_id uuid, actor_discord_id text, action text not null, created_at timestamptz not null default now(),
 foreign key(organization_id,ticket_id) references public.support_tickets(organization_id,id) on delete cascade
);
create table public.support_ticket_deliveries (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, ticket_id uuid,
 message_id uuid references public.support_ticket_messages(id) on delete cascade,
 client_id text not null, guild_id text not null, parent_channel_id text not null, thread_id text, marker_ticket_id uuid,
 kind text not null check(kind in ('create_thread','send_message','close_thread','delete_thread')),
 payload jsonb not null default '{}', sequence bigint generated always as identity,
 state text not null default 'pending' check(state in ('pending','leased','delivered','failed','uncertain')),
 lease_token uuid, worker_id text, leased_until timestamptz, attempts integer not null default 0,
 next_attempt_at timestamptz not null default now(), last_error text, result_id text,
 created_at timestamptz not null default now(),
 foreign key(organization_id,ticket_id) references public.support_tickets(organization_id,id) on delete cascade
);
create table public.support_ticket_idempotency (
 organization_id uuid not null, client_id text not null, operation text not null, key text not null,
 actor text not null, request_hash text not null, ticket_id uuid,
 response jsonb, tombstone boolean not null default false, created_at timestamptz not null default now(),
 primary key(organization_id,client_id,operation,key)
);
create table public.support_ticket_rate_limits (
 organization_id uuid not null, client_id text not null, bucket text not null, window_at timestamptz not null,
 count integer not null, primary key(organization_id,client_id,bucket)
);
create index tickets_org_status on public.support_tickets(organization_id,status,created_at desc);
create index tickets_retention on public.support_tickets(purge_at) where status='closed';
create index ticket_messages_order on public.support_ticket_messages(ticket_id,created_at,id);
create index deliveries_claim on public.support_ticket_deliveries(organization_id,client_id,next_attempt_at,sequence) where state<>'delivered';

do $$ declare t text; begin
 foreach t in array array['support_tickets','support_ticket_messages','support_ticket_audit','support_ticket_deliveries','support_ticket_idempotency','support_ticket_rate_limits'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public, anon, authenticated',t);
  execute format('grant all on public.%I to service_role',t);
  if t not in ('support_ticket_idempotency','support_ticket_rate_limits') then
   execute format('grant select on public.%I to authenticated',t);
   execute format('create policy ticket_staff_read on public.%I for select to authenticated using(private.can_manage_tickets(organization_id))',t);
  end if;
 end loop;
end $$;
grant usage,select on sequence public.support_ticket_deliveries_sequence_seq to service_role;

create function public.ticket_bot_operation(p_org uuid,p_client text,p_guild text,p_op text,p_data jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 t public.support_tickets; d public.support_ticket_deliveries; idem public.support_ticket_idempotency;
 actor text:=p_data->>'discord_user_id'; idem_key text:=p_data->>'idempotency_key';
 ticket uuid; message uuid; result jsonb; count_used integer; item record; claimed jsonb:='[]';
begin
 -- Identity and scope are checked by the authenticated API; org/client/guild are
 -- supplied exclusively from server configuration, never request overrides.
 if p_op not in ('create','own','ingest','claim','complete','fail') then raise exception 'invalid_operation'; end if;
 insert into public.support_ticket_rate_limits values(p_org,p_client,'client',clock_timestamp(),1)
 on conflict(organization_id,client_id,bucket) do update set
 count=case when support_ticket_rate_limits.window_at < clock_timestamp()-interval '1 minute' then 1 else support_ticket_rate_limits.count+1 end,
 window_at=case when support_ticket_rate_limits.window_at < clock_timestamp()-interval '1 minute' then clock_timestamp() else support_ticket_rate_limits.window_at end
 returning count into count_used;
 if count_used>120 then return jsonb_build_object('error','rate_limited'); end if;
 if actor is not null then
  insert into public.support_ticket_rate_limits values(p_org,p_client,'actor:'||actor,clock_timestamp(),1)
  on conflict(organization_id,client_id,bucket) do update set
  count=case when support_ticket_rate_limits.window_at < clock_timestamp()-interval '1 minute' then 1 else support_ticket_rate_limits.count+1 end,
  window_at=case when support_ticket_rate_limits.window_at < clock_timestamp()-interval '1 minute' then clock_timestamp() else support_ticket_rate_limits.window_at end
  returning count into count_used;
  if count_used>30 then return jsonb_build_object('error','rate_limited'); end if;
 end if;
 if p_op in ('create','ingest') then
  insert into public.support_ticket_idempotency(organization_id,client_id,operation,key,actor,request_hash,ticket_id)
  values(p_org,p_client,p_op,idem_key,actor,p_data->>'request_hash',case when p_op='ingest' then (p_data->>'ticket_id')::uuid else null end) on conflict do nothing;
  select * into idem from public.support_ticket_idempotency where organization_id=p_org and client_id=p_client and operation=p_op and key=idem_key for update;
  if idem.actor<>actor or idem.request_hash<>p_data->>'request_hash' then return jsonb_build_object('error','idempotency_conflict'); end if;
  if idem.tombstone then return jsonb_build_object('error','ticket_expired'); end if;
  if idem.response is not null then return idem.response; end if;
 end if;
 if p_op='create' then
  if actor !~ '^[1-9][0-9]{16,19}$' or length(p_data->>'subject') not between 1 and 160
   or length(p_data->>'content') not between 1 and 4000 then raise exception 'invalid_request'; end if;
  -- Interactions older than 24h cannot create tickets, even after tombstone expiry.
  if to_timestamp(((idem_key::numeric / 4194304)::bigint + 1420070400000)/1000.0) < now()-interval '24 hours'
   or to_timestamp(((idem_key::numeric / 4194304)::bigint + 1420070400000)/1000.0) > now()+interval '5 minutes' then
   return jsonb_build_object('error','interaction_expired');
  end if;
  insert into public.support_tickets(organization_id,client_id,guild_id,requester_discord_id,subject,parent_channel_id)
   values(p_org,p_client,p_guild,actor,p_data->>'subject',p_data->>'parent_channel_id') returning * into t;
  insert into public.support_ticket_messages(organization_id,ticket_id,direction,author_discord_id,content)
   values(p_org,t.id,'requester',actor,p_data->>'content') returning id into message;
  insert into public.support_ticket_deliveries(organization_id,ticket_id,client_id,guild_id,parent_channel_id,kind,payload)
   values(p_org,t.id,p_client,p_guild,t.parent_channel_id,'create_thread',jsonb_build_object('marker','besc-ticket-'||t.id,'requester_discord_id',actor));
  insert into public.support_ticket_deliveries(organization_id,ticket_id,message_id,client_id,guild_id,parent_channel_id,kind,payload)
   values(p_org,t.id,message,p_client,p_guild,t.parent_channel_id,'send_message',jsonb_build_object('message_id',message,'content',p_data->>'content'));
  insert into public.support_ticket_audit(organization_id,ticket_id,actor_discord_id,action) values(p_org,t.id,actor,'created');
  result:=jsonb_build_object('ticketId',t.id,'status',t.status,'linkStatus',t.link_status,'threadId',null);
 elsif p_op in ('own','ingest') then
  select * into t from public.support_tickets where id=(p_data->>'ticket_id')::uuid and organization_id=p_org and client_id=p_client and guild_id=p_guild and requester_discord_id=actor for update;
  if t.id is null then return jsonb_build_object('error','ticket_unavailable'); end if;
  if p_op='own' then
   return jsonb_build_object('ticketId',t.id,'status',t.status,'linkStatus',t.link_status,'threadId',t.thread_id,
    'messages',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'direction',m.direction,'content',m.content,'createdAt',m.created_at) order by m.created_at,m.id)
      from (select * from public.support_ticket_messages where ticket_id=t.id and direction<>'internal' order by created_at desc,id desc limit 50) m),'[]'::jsonb));
  end if;
  if t.status='closed' then return jsonb_build_object('error','ticket_closed'); end if;
  if t.link_status<>'linked' or t.thread_id<>p_data->>'thread_id' or t.parent_channel_id<>p_data->>'parent_channel_id' then return jsonb_build_object('error','thread_not_allowed'); end if;
  insert into public.support_ticket_messages(organization_id,ticket_id,direction,author_discord_id,content,source_message_id)
   values(p_org,t.id,'requester',actor,p_data->>'content',p_data->>'source_message_id')
   on conflict(ticket_id,source_message_id) do nothing returning id into message;
  if message is null then return jsonb_build_object('error','source_conflict'); end if;
  update public.support_tickets set status=case when status='waiting_requester' then 'in_progress' else status end,version=version+1 where id=t.id;
  insert into public.support_ticket_audit(organization_id,ticket_id,actor_discord_id,action) values(p_org,t.id,actor,'requester_message');
  result:=jsonb_build_object('messageId',message,'ticketId',t.id);
 elsif p_op='claim' then
  -- No blind retry after a crash: expired leases become reconciliation work.
  update public.support_ticket_deliveries set state='uncertain',lease_token=null,worker_id=null,leased_until=null,last_error='lease_expired'
   where organization_id=p_org and client_id=p_client and guild_id=p_guild and state='leased' and leased_until<=now();
  for item in select q.* from public.support_ticket_deliveries q
   where q.organization_id=p_org and q.client_id=p_client and q.guild_id=p_guild
    and q.state in ('pending','uncertain') and q.next_attempt_at<=now() and q.attempts<8
    and not exists(select 1 from public.support_ticket_deliveries earlier where earlier.organization_id=q.organization_id
      and earlier.client_id=q.client_id and earlier.guild_id=q.guild_id
      and coalesce(earlier.ticket_id::text,earlier.thread_id)=coalesce(q.ticket_id::text,q.thread_id)
      and earlier.sequence<q.sequence and earlier.state<>'delivered')
   order by q.sequence for update skip locked limit 5 loop
   update public.support_ticket_deliveries set state='leased',lease_token=gen_random_uuid(),worker_id=p_data->>'worker_id',leased_until=now()+interval '60 seconds',attempts=attempts+1
    where id=item.id returning * into d;
   select * into t from public.support_tickets where id=d.ticket_id;
   claimed:=claimed||jsonb_build_array(jsonb_build_object('id',d.id,'ticketId',d.ticket_id,'kind',d.kind,'payload',d.payload,
    'guildId',d.guild_id,'parentChannelId',d.parent_channel_id,'threadId',coalesce(t.thread_id,d.thread_id),
    'ticketStatus',t.status,'ticketMarker','besc-ticket-'||coalesce(t.id,d.marker_ticket_id)::text,
    'leaseToken',d.lease_token,'leasedUntil',d.leased_until,'reconcile',item.state='uncertain','nonce',d.sequence::text,'allowedMentions',jsonb_build_object('parse','[]'::jsonb)));
  end loop;
  return jsonb_build_object('deliveries',claimed);
 else
  select * into d from public.support_ticket_deliveries where id=(p_data->>'delivery_id')::uuid and organization_id=p_org and client_id=p_client and guild_id=p_guild for update;
  if d.id is null then return jsonb_build_object('error','delivery_unavailable'); end if;
  if d.state<>'leased' or d.lease_token is distinct from (p_data->>'lease_token')::uuid or d.worker_id is distinct from p_data->>'worker_id' or d.leased_until<=now() then return jsonb_build_object('error','lease_conflict'); end if;
  if p_op='fail' then
   update public.support_ticket_deliveries set state=case when (p_data->>'uncertain')::boolean then 'uncertain' when attempts>=8 then 'failed' else 'pending' end,
    last_error=p_data->>'error_code',next_attempt_at=now()+make_interval(secs=>least(3600,power(2,attempts)::integer)),lease_token=null,worker_id=null,leased_until=null where id=d.id;
   if d.kind='create_thread' then update public.support_tickets set link_status=case when (p_data->>'uncertain')::boolean then 'uncertain' else 'failed' end,last_error=p_data->>'error_code' where id=d.ticket_id; end if;
   return jsonb_build_object('recorded',true);
  end if;
  select * into t from public.support_tickets where id=d.ticket_id for update;
  if p_data->>'thread_absent'='true' then
   -- The trusted worker must prove absence by Discord lookup. A closed ticket
   -- must never cause a fresh thread solely to deliver its close operation.
   if not ((d.kind in ('create_thread','close_thread') and t.status='closed' and t.thread_id is null)
     or (d.kind='delete_thread' and p_data->>'thread_id' is not distinct from d.thread_id)) then
    return jsonb_build_object('error','invalid_delivery_result');
   end if;
   update public.support_ticket_deliveries set state='delivered',payload='{}',lease_token=null,worker_id=null,leased_until=null,last_error=null where id=d.id;
   if d.kind='create_thread' then
    update public.support_ticket_deliveries set state='delivered',payload='{}',last_error=null where ticket_id=t.id and kind='send_message' and state='pending';
   end if;
   return jsonb_build_object('recorded',true);
  end if;
  if d.kind='create_thread' then
   if p_data->>'parent_channel_id' is distinct from d.parent_channel_id or p_data->>'requester_discord_id' is distinct from t.requester_discord_id
     or p_data->>'requester_added' is distinct from 'true' or p_data->>'invitable' is distinct from 'false'
     or coalesce(p_data->>'thread_id','') !~ '^[1-9][0-9]{16,19}$' then return jsonb_build_object('error','invalid_delivery_result'); end if;
   if t.thread_id is not null and t.thread_id<>p_data->>'thread_id' then return jsonb_build_object('error','thread_conflict'); end if;
   update public.support_tickets set thread_id=p_data->>'thread_id',link_status='linked',last_error=null where id=t.id;
  else
   if p_data->>'thread_id' is distinct from coalesce(t.thread_id,d.thread_id) then return jsonb_build_object('error','thread_not_allowed'); end if;
   if d.kind='send_message' and coalesce(p_data->>'message_id','') !~ '^[1-9][0-9]{16,19}$' then return jsonb_build_object('error','invalid_delivery_result'); end if;
  end if;
  update public.support_ticket_deliveries set state='delivered',result_id=coalesce(p_data->>'message_id',p_data->>'thread_id'),payload='{}',lease_token=null,worker_id=null,leased_until=null,last_error=null where id=d.id;
  return jsonb_build_object('recorded',true);
 end if;
 if p_op in ('create','ingest') then
  update public.support_ticket_idempotency set response=result,ticket_id=t.id where organization_id=p_org and client_id=p_client and operation=p_op and key=idem_key;
 end if;
 return result;
end $$;
revoke all on function public.ticket_bot_operation(uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.ticket_bot_operation(uuid,text,text,text,jsonb) to service_role;

create function private.ticket_staff_action(p_org uuid,p_ticket uuid,p_version integer,p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.support_tickets; message uuid; actor uuid:=auth.uid(); new_status text;
begin
 if actor is null or not private.ticket_staff(p_org,actor) then raise exception 'ticket_forbidden' using errcode='42501'; end if;
 select * into t from public.support_tickets where organization_id=p_org and id=p_ticket for update;
 if t.id is null then return jsonb_build_object('error','ticket_unavailable'); end if;
 if t.version<>p_version then return jsonb_build_object('error','version_conflict'); end if;
 if t.status='closed' and p_action<>'recover' then return jsonb_build_object('error','ticket_closed'); end if;
 if p_action='assign' then
  if p_data->>'assigned_to' is not null and not private.ticket_staff(p_org,(p_data->>'assigned_to')::uuid) then return jsonb_build_object('error','assignee_forbidden'); end if;
  update public.support_tickets set assigned_to=(p_data->>'assigned_to')::uuid where id=t.id;
 elsif p_action in ('internal','reply') then
  if length(p_data->>'content') not between 1 and 4000 or p_data->>'content' is null then return jsonb_build_object('error','invalid_content'); end if;
  if p_action='reply' and t.link_status<>'linked' then return jsonb_build_object('error','thread_unavailable'); end if;
  insert into public.support_ticket_messages(organization_id,ticket_id,direction,author_user_id,content)
   values(p_org,t.id,case when p_action='internal' then 'internal' else 'staff' end,actor,p_data->>'content') returning id into message;
  if p_action='reply' then
   insert into public.support_ticket_deliveries(organization_id,ticket_id,message_id,client_id,guild_id,parent_channel_id,kind,payload)
    values(p_org,t.id,message,t.client_id,t.guild_id,t.parent_channel_id,'send_message',jsonb_build_object('message_id',message,'content',p_data->>'content'));
  end if;
 elsif p_action='status' then
  new_status:=p_data->>'status';
  if new_status is null or new_status not in ('open','in_progress','waiting_requester','closed') then return jsonb_build_object('error','invalid_status'); end if;
  if new_status='closed' then
   -- Pending replies retain their order. Closure is delivered only after them.
   insert into public.support_ticket_deliveries(organization_id,ticket_id,client_id,guild_id,parent_channel_id,kind)
    values(p_org,t.id,t.client_id,t.guild_id,t.parent_channel_id,'close_thread');
  end if;
  update public.support_tickets set status=new_status,closed_at=case when new_status='closed' then now() else null end where id=t.id;
 elsif p_action='recover' then
  -- A human requests reconciliation, never a blind resend.
  update public.support_ticket_deliveries set state='uncertain',attempts=0,next_attempt_at=now(),lease_token=null,worker_id=null,leased_until=null
   where ticket_id=t.id and state in ('failed','uncertain');
 else return jsonb_build_object('error','invalid_action'); end if;
 update public.support_tickets set version=version+1 where id=t.id returning * into t;
 insert into public.support_ticket_audit(organization_id,ticket_id,actor_user_id,action) values(p_org,t.id,actor,p_action);
 return jsonb_build_object('ticketId',t.id,'version',t.version);
end $$;
revoke all on function private.ticket_staff_action(uuid,uuid,integer,text,jsonb) from public,anon;
grant execute on function private.ticket_staff_action(uuid,uuid,integer,text,jsonb) to authenticated;
create function public.ticket_staff_action(p_org uuid,p_ticket uuid,p_version integer,p_action text,p_data jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select private.ticket_staff_action(p_org,p_ticket,p_version,p_action,p_data);
$$;
revoke all on function public.ticket_staff_action(uuid,uuid,integer,text,jsonb) from public,anon;
grant execute on function public.ticket_staff_action(uuid,uuid,integer,text,jsonb) to authenticated;

-- Maintenance is deliberately not scheduled by this migration. A separate,
-- approved job invokes this service-only function. Discord deletion keeps IDs only.
create function public.purge_support_tickets() returns integer language plpgsql security invoker set search_path='' as $$
declare t public.support_tickets; removed integer:=0;
begin
 for t in select * from public.support_tickets where purge_at<=now() and status='closed' for update skip locked limit 100 loop
  if exists(select 1 from public.support_ticket_deliveries where ticket_id=t.id and state='leased' and leased_until>now()) then continue; end if;
  -- Retain the neutral marker as an ID even if a crashed thread creation never
  -- reported its mapping. Cleanup must search active AND archived private threads.
  insert into public.support_ticket_deliveries(organization_id,client_id,guild_id,parent_channel_id,thread_id,marker_ticket_id,kind)
   values(t.organization_id,t.client_id,t.guild_id,t.parent_channel_id,t.thread_id,t.id,'delete_thread');
  update public.support_ticket_idempotency set response=null,ticket_id=null,actor='',request_hash='',tombstone=true where ticket_id=t.id;
  delete from public.support_tickets where id=t.id;
  removed:=removed+1;
 end loop;
 delete from public.support_ticket_idempotency where tombstone and created_at<now()-interval '30 days';
 delete from public.support_ticket_rate_limits where window_at<now()-interval '1 day';
 delete from public.support_ticket_idempotency where response is null and not tombstone and created_at<now()-interval '1 day';
 delete from public.support_ticket_deliveries where ticket_id is null and state='delivered';
 return removed;
end $$;
revoke all on function public.purge_support_tickets() from public,anon,authenticated;
grant execute on function public.purge_support_tickets() to service_role;

create function private.ticket_staff_candidates(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.ticket_staff(p_org,auth.uid()) then raise exception 'ticket_forbidden' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',m.user_id,'name',coalesce(p.display_name,m.user_id::text)) order by p.display_name,m.user_id)
 from public.organization_members m join public.profiles p on p.id=m.user_id
 where m.organization_id=p_org and m.status='active' and private.ticket_staff(p_org,m.user_id)),'[]'::jsonb);
end $$;
revoke all on function private.ticket_staff_candidates(uuid) from public,anon;
grant execute on function private.ticket_staff_candidates(uuid) to authenticated;
create function public.ticket_staff_candidates(p_org uuid) returns jsonb language sql security invoker set search_path='' as $$
 select private.ticket_staff_candidates(p_org);
$$;
revoke all on function public.ticket_staff_candidates(uuid) from public,anon;
grant execute on function public.ticket_staff_candidates(uuid) to authenticated;

create function private.ticket_retry_cleanup(p_delivery uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare d public.support_ticket_deliveries;
begin
 select * into d from public.support_ticket_deliveries where id=p_delivery for update;
 if d.id is null or auth.uid() is null or not private.ticket_staff(d.organization_id,auth.uid()) then raise exception 'ticket_forbidden' using errcode='42501'; end if;
 if d.ticket_id is not null or d.kind<>'delete_thread' or d.state not in ('failed','uncertain') then return false; end if;
 update public.support_ticket_deliveries set state='uncertain',attempts=0,next_attempt_at=now(),lease_token=null,worker_id=null,leased_until=null where id=d.id;
 return true;
end $$;
revoke all on function private.ticket_retry_cleanup(uuid) from public,anon;
grant execute on function private.ticket_retry_cleanup(uuid) to authenticated;
create function public.ticket_retry_cleanup(p_delivery uuid) returns boolean language sql security invoker set search_path='' as $$
 select private.ticket_retry_cleanup(p_delivery);
$$;
revoke all on function public.ticket_retry_cleanup(uuid) from public,anon;
grant execute on function public.ticket_retry_cleanup(uuid) to authenticated;
