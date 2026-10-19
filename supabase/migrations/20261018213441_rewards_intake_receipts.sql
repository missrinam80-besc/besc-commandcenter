-- Receipt intake only. No call to the rewards ledger, no grant/award operation.
-- Private helpers need owner access to auth.identities; only the CC service role
-- can enter them. Browser roles never gain access to Auth or this receipt table.
create table private.reward_intake_receipts (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 broadcaster_id text not null check (broadcaster_id ~ '^[1-9][0-9]{0,19}$'),
 event_key text not null check (event_key ~ '^[a-f0-9]{64}$'),
 content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
 event_data jsonb not null,
 -- Historical binding, deliberately no FK that could prevent Auth-user removal.
 user_id uuid,
 decision text not null check (decision in ('held','rejected')),
 reason text not null check (reason in ('earning_disabled','account_ineligible')),
 received_at timestamptz not null default clock_timestamp(),
 unique (organization_id,broadcaster_id,event_key),
 check ((decision='held' and user_id is not null and reason='earning_disabled')
     or (decision='rejected' and user_id is null and reason='account_ineligible'))
);
alter table private.reward_intake_receipts enable row level security;
revoke all on private.reward_intake_receipts from public,anon,authenticated,service_role;

create function private.reward_intake_account(o uuid,t text) returns uuid
language sql volatile security definer set search_path='' as $$
 select case when count(*)=1 then (array_agg(i.user_id))[1] else null end
 from auth.identities i join auth.users a on a.id=i.user_id
 join public.profiles p on p.id=a.id
 join public.organization_members m on m.user_id=a.id and m.organization_id=o
 where i.provider='twitch' and i.provider_id=t
 and (jsonb_typeof(i.identity_data->'sub')='string' or jsonb_typeof(i.identity_data->'provider_id')='string')
 and (not i.identity_data ? 'sub' or (jsonb_typeof(i.identity_data->'sub')='string' and i.identity_data->>'sub'=t))
 and (not i.identity_data ? 'provider_id' or (jsonb_typeof(i.identity_data->'provider_id')='string' and i.identity_data->>'provider_id'=t))
 and m.status='active' and m.role in ('admin','board','member','volunteer')
 and a.deleted_at is null and (a.banned_until is null or a.banned_until<=clock_timestamp())
 and p.discord_user_id ~ '^[1-9][0-9]{16,19}$'
 and exists(select 1 from auth.identities di where di.user_id=a.id and di.provider='discord'
   and di.provider_id=p.discord_user_id
   and (not di.identity_data ? 'sub' or (jsonb_typeof(di.identity_data->'sub')='string' and di.identity_data->>'sub'=p.discord_user_id))
   and (not di.identity_data ? 'provider_id' or (jsonb_typeof(di.identity_data->'provider_id')='string' and di.identity_data->>'provider_id'=p.discord_user_id)));
$$;
revoke all on function private.reward_intake_account(uuid,text) from public,anon,authenticated,service_role;

create function private.reward_intake_operation(o uuid,b text,op text,d jsonb,k text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 r private.reward_intake_receipts;
 e jsonb; h text; stamp timestamptz; u uuid; is_new boolean:=false;
begin
 -- Machine-to-machine endpoint: auth.uid() is intentionally not the actor.
 -- The invoker wrapper plus grants and this role guard exclude browser callers.
 if current_setting('role',true)<>'service_role' then raise exception 'intake_forbidden' using errcode='42501'; end if;
 if o is null or b is null or b !~ '^[1-9][0-9]{0,19}$' then return jsonb_build_object('error','invalid_fields'); end if;
 if op='receive' then
  if d is null or jsonb_typeof(d)<>'object' or pg_column_size(d)>8192
   or (d-array['schemaVersion','simulation','kind','event_id','broadcaster_id','twitch_user_id','occurred_at','facts'])<>'{}'::jsonb
   or not d ?& array['schemaVersion','simulation','kind','event_id','broadcaster_id','twitch_user_id','occurred_at','facts']
   or d->'schemaVersion'<>'1'::jsonb or d->'simulation'<>'false'::jsonb
   or jsonb_typeof(d->'kind')<>'string' or d->>'kind' not in ('twitch.follow','twitch.cheer')
   or jsonb_typeof(d->'broadcaster_id')<>'string' or d->>'broadcaster_id'<>b
   or jsonb_typeof(d->'twitch_user_id')<>'string' or d->>'twitch_user_id' !~ '^[1-9][0-9]{0,19}$'
   or jsonb_typeof(d->'event_id')<>'string' or d->>'event_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
   or jsonb_typeof(d->'occurred_at')<>'string' or d->>'occurred_at' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
   or jsonb_typeof(d->'facts')<>'object' then return jsonb_build_object('error','invalid_fields'); end if;
  if (d->>'kind'='twitch.follow' and d->'facts'<>'{}'::jsonb)
   or (d->>'kind'='twitch.cheer' and (
      not (d->'facts') ?& array['bits','is_anonymous']
      or ((d->'facts')-array['bits','is_anonymous'])<>'{}'::jsonb
      or jsonb_typeof(d->'facts'->'bits')<>'number' or d->'facts'->>'bits' !~ '^[1-9][0-9]{0,6}$'
      or (d->'facts'->>'bits')::numeric>1000000 or d->'facts'->'is_anonymous'<>'false'::jsonb))
   then return jsonb_build_object('error','invalid_fields'); end if;
  stamp:=(d->>'occurred_at')::timestamptz;
  e:=jsonb_set(d,'{event_id}',to_jsonb(lower(d->>'event_id')));
  -- A provider message cannot change actor/kind and become a second receipt.
  k:=encode(sha256(convert_to(jsonb_build_array(1,'intake','twitch',o,b,lower(d->>'event_id'))::text,'UTF8')),'hex');
  h:=encode(sha256(convert_to(e::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(o::text||':reward-intake:'||b||':'||k,0));
  select * into r from private.reward_intake_receipts where organization_id=o and broadcaster_id=b and event_key=k;
  if found then
   if r.content_hash<>h then return jsonb_build_object('error','idempotency_conflict'); end if;
  else
   if stamp<clock_timestamp()-interval '120 seconds' or stamp>clock_timestamp()+interval '5 seconds'
    then return jsonb_build_object('error','event_time_out_of_range'); end if;
   u:=private.reward_intake_account(o,e->>'twitch_user_id');
   insert into private.reward_intake_receipts(organization_id,broadcaster_id,event_key,content_hash,event_data,user_id,decision,reason)
   values(o,b,k,h,e,u,case when u is null then 'rejected' else 'held' end,
     case when u is null then 'account_ineligible' else 'earning_disabled' end) returning * into r;
   is_new:=true;
  end if;
 elsif op='receipt' then
  if k is null or k !~ '^[a-f0-9]{64}$' or d is distinct from '{}'::jsonb then return jsonb_build_object('error','invalid_fields'); end if;
  select * into r from private.reward_intake_receipts where organization_id=o and broadcaster_id=b and event_key=k;
  if not found then return jsonb_build_object('error','not_found'); end if;
 else return jsonb_build_object('error','not_found');
 end if;
 -- Recheck even on receipt reads/replays. Original outcome/binding never changes.
 u:=private.reward_intake_account(o,r.event_data->>'twitch_user_id');
 return jsonb_build_object('schemaVersion',1,'mode','intake_only','receiptId',r.id,
   'eventKey',r.event_key,'receivedAt',r.received_at,'decision',r.decision,'reason',r.reason,
   'persisted',true,'awarded',false,'earningEnabled',false,'identityChecked',true,
   'accountCheckPassed',coalesce(u=r.user_id,false),'providerProofVerified',false,'replay',not is_new);
exception
 when invalid_text_representation or invalid_parameter_value or numeric_value_out_of_range
   or datetime_field_overflow then return jsonb_build_object('error','invalid_fields');
end $$;
revoke all on function private.reward_intake_operation(uuid,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function private.reward_intake_operation(uuid,text,text,jsonb,text) to service_role;

create function public.rewards_intake(o uuid,b text,op text,d jsonb default '{}',k text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if current_user<>'service_role' then raise exception 'intake_forbidden' using errcode='42501'; end if;
 return private.reward_intake_operation(o,b,op,d,k);
end $$;
revoke all on function public.rewards_intake(uuid,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.rewards_intake(uuid,text,text,jsonb,text) to service_role;
