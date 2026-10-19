-- V2 exact opaque provider IDs. V1 is replay-only; historical receipts stay untouched.
-- Replace only the existing private operation; preserve wrapper, table and privileges.
create or replace function private.reward_intake_operation(o uuid,b text,op text,d jsonb,k text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 r private.reward_intake_receipts;
 e jsonb; h text; legacy_e jsonb; legacy_k text; stamp timestamptz; u uuid; is_new boolean:=false;
begin
 -- Machine-to-machine endpoint: auth.uid() is intentionally not the actor.
 -- The invoker wrapper plus grants and this role guard exclude browser callers.
 if current_setting('role',true)<>'service_role' then raise exception 'intake_forbidden' using errcode='42501'; end if;
 if o is null or b is null or b !~ '^[1-9][0-9]{0,19}$' then return jsonb_build_object('error','invalid_fields'); end if;
 if op='receive' then
  if d is null or jsonb_typeof(d)<>'object' or pg_column_size(d)>8192
   or (d-array['schemaVersion','simulation','kind','event_id','broadcaster_id','twitch_user_id','occurred_at','facts'])<>'{}'::jsonb
   or not d ?& array['schemaVersion','simulation','kind','event_id','broadcaster_id','twitch_user_id','occurred_at','facts']
   or d->'schemaVersion' not in ('1'::jsonb,'2'::jsonb) or d->'simulation'<>'false'::jsonb
   or jsonb_typeof(d->'kind')<>'string' or d->>'kind' not in ('twitch.follow','twitch.cheer')
   or jsonb_typeof(d->'broadcaster_id')<>'string' or d->>'broadcaster_id'<>b
   or jsonb_typeof(d->'twitch_user_id')<>'string' or d->>'twitch_user_id' !~ '^[1-9][0-9]{0,19}$'
   or jsonb_typeof(d->'event_id')<>'string'
   or octet_length(d->>'event_id') not between 1 and 128
   or (d->>'event_id') collate "C" ~ '[^!-~]'
   or (d->'schemaVersion'='1'::jsonb and d->>'event_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
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
  if d->'schemaVersion'='1'::jsonb then
   e:=jsonb_set(d,'{event_id}',to_jsonb(lower(d->>'event_id')));
   k:=encode(sha256(convert_to(jsonb_build_array(1,'intake','twitch',o,b,lower(d->>'event_id'))::text,'UTF8')),'hex');
  else
   -- Opaque provider IDs: exact ASCII bytes, no trim/lowercase/remapping.
   e:=d;
   k:=encode(sha256(convert_to(jsonb_build_array(2,'intake','twitch',o,b,d->>'event_id')::text,'UTF8')),'hex');
  end if;
  h:=encode(sha256(convert_to(e::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(o::text||':reward-intake:'||b||':'||k,0));
  select * into r from private.reward_intake_receipts where organization_id=o and broadcaster_id=b and event_key=k;
  if r.id is null and d->'schemaVersion'='2'::jsonb
   and d->>'event_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
   -- Legacy UUID receipts are immutable and V1 is replay-only after this migration.
   -- Match their original canonical content; never rewrite key, time or outcome.
   legacy_k:=encode(sha256(convert_to(jsonb_build_array(1,'intake','twitch',o,b,lower(d->>'event_id'))::text,'UTF8')),'hex');
   select * into r from private.reward_intake_receipts where organization_id=o and broadcaster_id=b and event_key=legacy_k;
   if r.id is not null then
    legacy_e:=jsonb_set(jsonb_set(d,'{schemaVersion}','1'::jsonb),'{event_id}',to_jsonb(lower(d->>'event_id')));
    h:=encode(sha256(convert_to(legacy_e::text,'UTF8')),'hex');
   end if;
  end if;
  if r.id is not null then
   if r.content_hash<>h then return jsonb_build_object('error','idempotency_conflict'); end if;
  else
   if d->'schemaVersion'='1'::jsonb then return jsonb_build_object('error','invalid_fields'); end if;
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

