-- Pakket 6: local-first inbox. No provider, webhook, backfill, scheduler or replies.
create table private.si_threads (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 account_id uuid not null references public.social_accounts(id), external_account_id text not null,
 platform text not null check(platform in('facebook','instagram')), kind text not null check(kind in('direct','comment')),
 external_id text not null check(length(external_id) between 1 and 256),
 status text not null default 'open' check(status in('open','in_progress','waiting','resolved')),
 assignee_id uuid references public.profiles(id), revision bigint not null default 0,
 created_at timestamptz not null default clock_timestamp(), last_message_at timestamptz not null,
 unique(account_id,kind,external_id)
);
create index si_thread_listing on private.si_threads(organization_id,created_at desc,id desc);
create table private.si_messages (
 id uuid primary key default gen_random_uuid(), thread_id uuid not null references private.si_threads(id),
 account_id uuid not null references public.social_accounts(id), external_id text not null check(length(external_id) between 1 and 256),
 sender text not null check(length(sender) between 1 and 200), body text not null check(length(body) between 1 and 8000),
 occurred_at timestamptz not null, received_at timestamptz not null default clock_timestamp(),
 unique(account_id,external_id)
);
create index si_message_timeline on private.si_messages(thread_id,occurred_at desc,id desc);
create table private.si_events (
 id bigint generated always as identity primary key, thread_id uuid not null references private.si_threads(id),
 operation text not null check(operation in('received','reopened','assigned','status','note')),
 actor_id uuid references public.profiles(id), detail jsonb not null, created_at timestamptz not null default clock_timestamp()
);
create index si_event_timeline on private.si_events(thread_id,id desc);
alter table private.si_threads enable row level security;
alter table private.si_messages enable row level security;
alter table private.si_events enable row level security;
revoke all on private.si_threads,private.si_messages,private.si_events from public,anon,authenticated,service_role;
revoke all on sequence private.si_events_id_seq from public,anon,authenticated,service_role;

create function private.si_manager(o uuid,u uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.organization_members m
 left join public.organization_access_roles r on r.id=m.access_role_id and r.organization_id=m.organization_id and r.deleted_at is null
 where m.organization_id=o and m.user_id=u and m.status='active'
 and (m.role in('admin','board') or 'manageInbox'=any(coalesce(r.capabilities,'{}'))))
$$;
revoke all on function private.si_manager(uuid,uuid) from public,anon,authenticated,service_role;

-- Internal import boundary. The only caller built in this package is the isolated fixture.
-- Store a normalized incoming text, never raw provider JSON, tokens, attachments or URLs.
create function private.si_ingest(o uuid,a uuid,external_account text,batch jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare account public.social_accounts; item jsonb; t private.si_threads; m private.si_messages;
 n integer:=0; input_kind text; sent timestamptz;
begin
 select * into account from public.social_accounts where id=a and organization_id=o and deleted_at is null and status='connected' and platform in('facebook','instagram') for update;
 if not found or account.external_account_id is distinct from external_account then raise exception 'social_inbox_account_denied'; end if;
 if jsonb_typeof(batch) is distinct from 'array' or jsonb_array_length(batch)>50 then raise exception 'social_inbox_invalid_batch'; end if;
 for item in select value from jsonb_array_elements(batch) loop
  if jsonb_typeof(item) is distinct from 'object' or (item-array['thread_id','message_id','kind','sender','body','occurred_at'])<>'{}'::jsonb
   or not (item ?& array['thread_id','message_id','kind','sender','body','occurred_at'])
   or exists(select 1 from jsonb_each(item) x where jsonb_typeof(x.value)<>'string')
   or length(item->>'thread_id') not between 1 and 256 or length(item->>'message_id') not between 1 and 256
   or length(btrim(item->>'sender')) not between 1 and 200 or length(btrim(item->>'body')) not between 1 and 8000
   or item->>'kind' not in('direct','comment') then raise exception 'social_inbox_invalid_item'; end if;
  input_kind:=item->>'kind'; sent:=(item->>'occurred_at')::timestamptz;
  if not isfinite(sent) then raise exception 'social_inbox_invalid_time'; end if;
  select * into m from private.si_messages where account_id=a and external_id=item->>'message_id';
  if found then
   select * into t from private.si_threads where id=m.thread_id;
   if t.kind<>input_kind or t.external_id<>item->>'thread_id' or m.sender<>item->>'sender' or m.body<>item->>'body' or m.occurred_at<>sent then raise exception 'social_inbox_duplicate_conflict'; end if;
   continue;
  end if;
  insert into private.si_threads(organization_id,account_id,external_account_id,platform,kind,external_id,last_message_at)
   values(o,a,external_account,account.platform,input_kind,item->>'thread_id',sent) on conflict(account_id,kind,external_id) do nothing;
  select * into t from private.si_threads where account_id=a and si_threads.kind=input_kind and external_id=item->>'thread_id' for update;
  if t.external_account_id<>external_account then raise exception 'social_inbox_account_changed'; end if;
  insert into private.si_messages(thread_id,account_id,external_id,sender,body,occurred_at) values(t.id,a,item->>'message_id',item->>'sender',item->>'body',sent);
  insert into private.si_events(thread_id,operation,detail) values(t.id,'received',jsonb_build_object('message_id',item->>'message_id'));
  if t.status='resolved' and sent>=t.last_message_at then
   insert into private.si_events(thread_id,operation,detail) values(t.id,'reopened',jsonb_build_object('from','resolved','to','open'));
  end if;
  update private.si_threads set last_message_at=greatest(last_message_at,sent),revision=revision+1,
   status=case when status='resolved' and sent>=last_message_at then 'open' else status end where id=t.id;
  n:=n+1;
 end loop;
 return jsonb_build_object('inserted',n);
end $$;
revoke all on function private.si_ingest(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.si_ingest(uuid,uuid,text,jsonb) to service_role;
create function public.social_inbox_ingest(p_org uuid,p_account uuid,p_external_account text,p_batch jsonb)
returns jsonb language sql volatile security invoker set search_path='' as $$ select private.si_ingest(p_org,p_account,p_external_account,p_batch) $$;
revoke all on function public.social_inbox_ingest(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.social_inbox_ingest(uuid,uuid,text,jsonb) to service_role;

create function private.si_owner(o uuid,action text,thread uuid,data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t private.si_threads; result jsonb; target uuid; next_status text; note text; change jsonb;
begin
 perform 1 from auth.sessions where id=nullif(auth.jwt()->>'session_id','')::uuid and user_id=auth.uid() for share;
 perform 1 from public.organization_members where organization_id=o and user_id=auth.uid() for share;
 perform 1 from public.organization_access_roles where organization_id=o and id=(select access_role_id from public.organization_members where organization_id=o and user_id=auth.uid()) for share;
 if not private.cy_session(o,auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid) or not private.si_manager(o,auth.uid()) then raise exception 'social_inbox_access_denied' using errcode='42501'; end if;
 if jsonb_typeof(data) is distinct from 'object' then raise exception 'social_inbox_invalid_action'; end if;
 if action='members' then
  return coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',coalesce(p.display_name,'Beheerder')) order by p.display_name,p.id)
   from public.organization_members m join public.profiles p on p.id=m.user_id where m.organization_id=o and private.si_manager(o,m.user_id)),'[]');
 end if;
 if action='list' then
  if coalesce(data->>'status','') not in('','open','in_progress','waiting','resolved') or coalesce(data->>'platform','') not in('','facebook','instagram') then raise exception 'social_inbox_invalid_filter'; end if;
  if nullif(data->>'before','') is not null and not exists(select 1 from private.si_threads where organization_id=o and id=(data->>'before')::uuid) then raise exception 'social_inbox_cursor_denied'; end if;
  return coalesce((select jsonb_agg(v order by created_at desc,id desc) from (
   select listing.id,listing.created_at,listing.platform,listing.kind,listing.status,listing.revision,listing.assignee_id,listing.last_message_at,a.account_name,
    (select body from private.si_messages where thread_id=listing.id order by occurred_at desc,id desc limit 1) preview
   from private.si_threads listing join public.social_accounts a on a.id=listing.account_id
   where listing.organization_id=o and (coalesce(data->>'status','')='' or listing.status=data->>'status')
    and (coalesce(data->>'platform','')='' or listing.platform=data->>'platform')
    and (coalesce(data->>'mine','')<>'true' or listing.assignee_id=auth.uid())
    and (nullif(data->>'before','') is null or (listing.created_at,listing.id)<(select created_at,id from private.si_threads where organization_id=o and id=(data->>'before')::uuid))
   order by listing.created_at desc,listing.id desc limit 26) v),'[]');
 end if;
 select * into t from private.si_threads where id=thread and organization_id=o for update;
 if not found then raise exception 'social_inbox_unavailable'; end if;
 if action='read' then
  return (to_jsonb(t)-array['external_account_id','external_id']) || jsonb_build_object(
   'account_name',(select account_name from public.social_accounts where id=t.account_id),
   'messages',coalesce((select jsonb_agg(v order by occurred_at,id) from (
    select id,sender,body,occurred_at from private.si_messages where thread_id=t.id and
     (nullif(data->>'messages_before','') is null or (occurred_at,id)<(select occurred_at,id from private.si_messages where thread_id=t.id and id=(data->>'messages_before')::uuid))
    order by occurred_at desc,id desc limit 51) v),'[]'),
   'events',coalesce((select jsonb_agg(v order by id) from (
    select id,operation,actor_id,detail,created_at from private.si_events where thread_id=t.id and
    (nullif(data->>'events_before','') is null or id<(data->>'events_before')::bigint) order by id desc limit 51) v),'[]'));
 end if;
 if action not in('assign','status','note') or data->>'revision' is null then raise exception 'social_inbox_invalid_action'; end if;
 if (data->>'revision')::bigint<>t.revision then raise exception 'social_inbox_conflict' using errcode='40001'; end if;
 if action='assign' then
  target:=nullif(data->>'assignee','')::uuid;
  if target is not null then
   perform 1 from public.organization_members where organization_id=o and user_id=target for share;
   if not private.si_manager(o,target) then raise exception 'social_inbox_assignee_denied'; end if;
  end if;
  if t.assignee_id is not distinct from target then return jsonb_build_object('revision',t.revision); end if;
  change:=jsonb_build_object('from',t.assignee_id,'to',target);
  update private.si_threads set assignee_id=target where id=t.id;
 elsif action='status' then
  next_status:=data->>'status';
  if next_status is null or next_status not in('open','in_progress','waiting','resolved') then raise exception 'social_inbox_invalid_status'; end if;
  if next_status=t.status then return jsonb_build_object('revision',t.revision); end if;
  change:=jsonb_build_object('from',t.status,'to',next_status);
  update private.si_threads set status=next_status where id=t.id;
 else
  note:=btrim(data->>'note');if note is null or length(note) not between 1 and 2000 then raise exception 'social_inbox_invalid_note'; end if;
  change:=jsonb_build_object('note',note);
 end if;
 update private.si_threads set revision=revision+1 where id=t.id;
 insert into private.si_events(thread_id,operation,actor_id,detail) values(t.id,case when action='assign' then 'assigned' else action end,auth.uid(),change);
 return jsonb_build_object('revision',t.revision+1);
end $$;
revoke all on function private.si_owner(uuid,text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.si_owner(uuid,text,uuid,jsonb) to authenticated;
create function public.social_inbox_owner(p_org uuid,p_action text,p_thread uuid default null,p_data jsonb default '{}')
returns jsonb language sql volatile security invoker set search_path='' as $$ select private.si_owner(p_org,p_action,p_thread,p_data) $$;
revoke all on function public.social_inbox_owner(uuid,text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.social_inbox_owner(uuid,text,uuid,jsonb) to authenticated;
