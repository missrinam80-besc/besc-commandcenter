begin;
create table public.event_slot_pages(
 event_id uuid primary key references public.events(id) on delete cascade,
 organization_id uuid not null references public.organizations(id),
 public_id uuid not null default gen_random_uuid() unique,published boolean not null default false,
 foreign key(organization_id,event_id) references public.events(organization_id,id));
create table public.event_time_slots(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),event_id uuid not null,
 title text not null check(char_length(btrim(title)) between 2 and 180),kind text not null check(kind in('shift','stream')),
 description text not null default '' check(char_length(description)<=4000),location text not null default '' check(char_length(location)<=300),
 starts_at timestamptz not null,ends_at timestamptz not null,capacity integer not null check(capacity between 1 and 1000),
 is_open boolean not null default true,created_at timestamptz not null default now(),
 unique(organization_id,event_id,id),foreign key(organization_id,event_id) references public.events(organization_id,id),check(ends_at>starts_at));
create index event_time_slots_event_idx on public.event_time_slots(organization_id,event_id,starts_at);
create table public.event_slot_bookings(
 id uuid primary key,organization_id uuid not null,event_id uuid not null,slot_id uuid not null,
 name text not null check(char_length(btrim(name)) between 2 and 180),email text not null check(char_length(email) between 3 and 254 and email=lower(btrim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
 status text not null check(status in('unverified','pending','confirmed','rejected','cancelled','expired')),
 source text not null check(source in('public','owner')),verification_hash text,verification_expires_at timestamptz,verified_at timestamptz,
 account_user_id uuid references public.profiles(id),discord_user_id text,channel text not null default 'email' check(channel in('email','discord')),
 ip_hash text,created_by uuid references public.profiles(id),decided_by uuid references public.profiles(id),decided_at timestamptz,
 created_at timestamptz not null default now(),schedule_id uuid unique references public.event_schedule_items(id),
 foreign key(organization_id,event_id,slot_id) references public.event_time_slots(organization_id,event_id,id),
 check(channel='email' or (account_user_id is not null and discord_user_id ~ '^[1-9][0-9]{16,19}$')));
create unique index event_slot_bookings_active_email on public.event_slot_bookings(slot_id,email) where status in('unverified','pending','confirmed');
create index event_slot_bookings_slot_idx on public.event_slot_bookings(slot_id,status);
create index event_slot_bookings_ip_idx on public.event_slot_bookings(ip_hash,created_at);
create index event_slot_bookings_rate_idx on public.event_slot_bookings(event_id,email,created_at);
alter table public.event_schedule_items add column slot_booking_id uuid unique references public.event_slot_bookings(id),add column booking_name text;
alter table public.event_schedule_items add constraint slot_schedule_name_binding check((slot_booking_id is null)=(booking_name is null));

create table private.event_slot_messages(
 id uuid primary key default gen_random_uuid(),booking_id uuid not null references public.event_slot_bookings(id),organization_id uuid not null,
 kind text not null,channel text not null check(channel in('email','discord')),recipient text not null,
 subject text not null,body text not null,
 state text not null default 'queued' check(state in('queued','leased','dispatching','sent','failed','uncertain')),
 attempts integer not null default 0,next_attempt_at timestamptz not null default now(),lease_token uuid,lease_until timestamptz,worker text,
 draft_id text,message_id text,error_code text,created_at timestamptz not null default clock_timestamp(),sent_at timestamptz,
 unique(booking_id,kind));
create index event_slot_messages_pending_idx on private.event_slot_messages(channel,state,next_attempt_at);
alter table public.event_slot_pages enable row level security;
alter table public.event_time_slots enable row level security;
alter table public.event_slot_bookings enable row level security;
alter table private.event_slot_messages enable row level security;
revoke all on public.event_slot_pages,public.event_time_slots,public.event_slot_bookings,private.event_slot_messages from public,anon,authenticated;
grant select on public.event_slot_pages,public.event_time_slots,public.event_slot_bookings to authenticated;

create function private.owns_slot_event(o uuid,e uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.events v join public.organization_members m on m.organization_id=v.organization_id and m.user_id=v.owner_id and m.status='active'
 where v.id=e and v.organization_id=o and v.owner_id=auth.uid() and v.deleted_at is null);$$;
revoke all on function private.owns_slot_event(uuid,uuid) from public,anon;
grant execute on function private.owns_slot_event(uuid,uuid) to authenticated;
create policy slot_page_owner_read on public.event_slot_pages for select to authenticated using(private.owns_slot_event(organization_id,event_id));
create policy time_slot_member_read on public.event_time_slots for select to authenticated using(private.is_active_member(organization_id) and exists(select 1 from public.events e where e.id=event_id and e.organization_id=event_time_slots.organization_id and e.deleted_at is null));
create policy slot_booking_owner_read on public.event_slot_bookings for select to authenticated using(private.owns_slot_event(organization_id,event_id));

-- Authenticated table writers cannot edit or delete the schedule projection of a booking.
create function private.guard_slot_schedule() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if (case when tg_op='INSERT' then new.slot_booking_id is not null when tg_op='DELETE' then old.slot_booking_id is not null else old.slot_booking_id is not null or new.slot_booking_id is not null or new.booking_name is distinct from old.booking_name end)
 and not exists(select 1 from pg_catalog.pg_roles where rolname=current_user and (rolsuper or rolbypassrls)) then
 raise exception 'slot_schedule_managed' using errcode='42501';end if;
 if tg_op='DELETE' then return old;end if;return new;
end$$;
create trigger guard_slot_schedule before insert or update or delete on public.event_schedule_items for each row execute function private.guard_slot_schedule();
revoke all on function private.guard_slot_schedule() from public,anon,authenticated;

-- Slots also reference the managed agenda category, even before anyone books.
create function private.guard_slot_category() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.set_key='event_schedule_items.kind' and (tg_op='DELETE' or new.value is distinct from old.value or new.organization_id is distinct from old.organization_id or new.set_key is distinct from old.set_key)
 and exists(select 1 from public.event_time_slots where organization_id=old.organization_id and kind=old.value) then raise exception 'choice_in_use';end if;
 if tg_op='DELETE' then return old;end if;return new;
end$$;
revoke all on function private.guard_slot_category() from public,anon,authenticated;
create trigger guard_slot_category before delete or update on public.dossier_choice_options for each row execute function private.guard_slot_category();

create function private.slot_enqueue(b uuid,k text,verification_url text default null) returns void language plpgsql security definer set search_path='' as $$
declare r public.event_slot_bookings; s public.event_time_slots; e public.events; content text; destination text; transport text;
begin
 select * into strict r from public.event_slot_bookings where id=b;
 select * into strict s from public.event_time_slots where id=r.slot_id;
 select * into strict e from public.events where id=r.event_id;
 content=case k when 'verify' then 'Bevestig je e-mailadres om een plek aan te vragen. Er is nog geen plek gereserveerd. Deze link is 30 minuten geldig.'
 when 'pending' then 'Je aanvraag is ontvangen en wacht op bevestiging door de eventeigenaar. Je plek telt voorlopig mee.'
 when 'confirmed' then 'Je boeking is bevestigd.' when 'rejected' then 'Je aanvraag is afgewezen. Er is geen plek voor je gereserveerd.'
 when 'cancelled' then 'Je boeking is geannuleerd. Je plek is vrijgegeven.' else null end;
 if content is null then raise exception 'invalid_message_kind';end if;
 content=content||E'\n\n'||e.title||E'\n'||s.title||E'\n'||to_char(s.starts_at at time zone 'Europe/Brussels','DD/MM/YYYY HH24:MI')||' – '||to_char(s.ends_at at time zone 'Europe/Brussels','DD/MM/YYYY HH24:MI')||' (Belgische tijd)'||E'\n'||s.location;
 if verification_url is not null then content=content||E'\n\n'||verification_url;end if;
 transport=case when k='verify' then 'email' else r.channel end;
 destination=case when transport='discord' then r.discord_user_id else r.email end;
 insert into private.event_slot_messages(booking_id,organization_id,kind,channel,recipient,subject,body)
 values(b,r.organization_id,k,transport,destination,left('BESC · '||e.title||' · '||s.title,180),content) on conflict(booking_id,kind) do nothing;
end$$;

create function private.slot_project(b uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.event_slot_bookings; s public.event_time_slots; e public.events; sid uuid;
begin
 select * into strict r from public.event_slot_bookings where id=b;
 select * into strict s from public.event_time_slots where id=r.slot_id;
 select * into strict e from public.events where id=r.event_id;
 if r.status not in('pending','confirmed','rejected','cancelled') then return;end if;
 if r.schedule_id is null and r.status in('pending','confirmed') then
  insert into public.event_schedule_items(organization_id,event_id,title,kind,starts_at,ends_at,status,location,created_by,slot_booking_id,booking_name)
  values(r.organization_id,r.event_id,s.title,s.kind,s.starts_at,s.ends_at,case when r.status='confirmed' then 'confirmed' else 'draft' end,nullif(s.location,''),e.owner_id,r.id,r.name) returning id into sid;
  update public.event_slot_bookings set schedule_id=sid where id=r.id;
 elsif r.schedule_id is not null then
  update public.event_schedule_items set status=case r.status when 'pending' then 'draft' when 'confirmed' then 'confirmed' else 'cancelled' end where id=r.schedule_id;
 end if;
end$$;

-- One lock order throughout: event -> slot -> booking. Capacity includes verified pending applications.
create function private.slot_owner_operation(o uuid,eid uuid,op text,d jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.events;s public.event_time_slots;b public.event_slot_bookings; page_id uuid;used integer;sid uuid;messages jsonb;msg private.event_slot_messages;
begin
 select * into e from public.events where id=eid and organization_id=o and deleted_at is null for share;
 if not found or e.owner_id is distinct from auth.uid() then raise exception 'slot_owner_required' using errcode='42501';end if;
 perform 1 from public.organization_members where organization_id=o and user_id=auth.uid() and status='active' for share;
 if not found then raise exception 'slot_owner_required' using errcode='42501';end if;
 if op='messages' then
  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'booking_id',m.booking_id,'kind',m.kind,'state',m.state) order by m.created_at),'[]') into messages from private.event_slot_messages m join public.event_slot_bookings booking on booking.id=m.booking_id where booking.event_id=eid and booking.organization_id=o;
  return messages;
 end if;
 if op='retry_message' then
  select m.* into msg from private.event_slot_messages m join public.event_slot_bookings booking on booking.id=m.booking_id where m.id=(d->>'id')::uuid and booking.event_id=eid and booking.organization_id=o for update of m;
  if not found or msg.state<>'failed' then raise exception 'slot_message_not_retryable';end if;
  if msg.kind='verify' and exists(select 1 from public.event_slot_bookings where id=msg.booking_id and verification_expires_at<=clock_timestamp()) then raise exception 'slot_verification_expired';end if;
  update private.event_slot_messages set state='queued',attempts=0,next_attempt_at=clock_timestamp() where id=msg.id;
  return jsonb_build_object('id',msg.booking_id);
 end if;
 if op='page' then
  insert into public.event_slot_pages(event_id,organization_id,published) values(eid,o,(d->>'published')::boolean)
  on conflict(event_id) do update set published=excluded.published returning public_id into page_id;
  return jsonb_build_object('public_id',page_id);
 end if;
 if op='save_slot' then
  perform 1 from public.dossier_choice_options where organization_id=o and set_key='event_schedule_items.kind' and value=d->>'kind' for key share;
  if not found then raise exception 'choice_unavailable';end if;
  sid=coalesce(nullif(d->>'id','')::uuid,gen_random_uuid());
  select * into s from public.event_time_slots where id=sid and event_id=eid and organization_id=o for update;
  if not found and nullif(d->>'id','') is not null then raise exception 'slot_unavailable';end if;
  select count(*) into used from public.event_slot_bookings where slot_id=sid and status in('pending','confirmed');
  if (d->>'capacity')::integer<used then raise exception 'slot_capacity_below_bookings';end if;
  if used>0 and (s.starts_at is distinct from (d->>'starts_at')::timestamptz or s.ends_at is distinct from (d->>'ends_at')::timestamptz or s.kind is distinct from d->>'kind' or s.title is distinct from btrim(d->>'title') or s.location is distinct from coalesce(d->>'location','')) then raise exception 'slot_has_bookings';end if;
  insert into public.event_time_slots(id,organization_id,event_id,title,kind,starts_at,ends_at,capacity,description,location,is_open)
  values(sid,o,eid,btrim(d->>'title'),d->>'kind',(d->>'starts_at')::timestamptz,(d->>'ends_at')::timestamptz,(d->>'capacity')::integer,coalesce(d->>'description',''),coalesce(d->>'location',''),(d->>'is_open')::boolean)
  on conflict(id) do update set title=excluded.title,kind=excluded.kind,starts_at=excluded.starts_at,ends_at=excluded.ends_at,capacity=excluded.capacity,description=excluded.description,location=excluded.location,is_open=excluded.is_open;
  return jsonb_build_object('id',sid);
 end if;
 select * into s from public.event_time_slots where id=(d->>'slot_id')::uuid and event_id=eid and organization_id=o for update;
 if not found then raise exception 'slot_unavailable';end if;
 if op='book' then
  select * into b from public.event_slot_bookings where id=(d->>'id')::uuid;
  if found then
   if b.slot_id<>s.id or b.created_by is distinct from auth.uid() or b.email<>lower(btrim(d->>'email')) or b.name<>btrim(d->>'name') then raise exception 'slot_idempotency_conflict';end if;
   return jsonb_build_object('id',b.id);
  end if;
  select count(*) into used from public.event_slot_bookings where slot_id=s.id and status in('pending','confirmed');
  if used>=s.capacity then raise exception 'slot_full';end if;
  if not s.is_open or s.starts_at<=clock_timestamp() or e.status in('completed','cancelled','archived') then raise exception 'slot_closed';end if;
  insert into public.event_slot_bookings(id,organization_id,event_id,slot_id,name,email,status,source,created_by)
  values((d->>'id')::uuid,o,eid,s.id,btrim(d->>'name'),lower(btrim(d->>'email')),'pending','owner',auth.uid()) returning * into b;
  perform private.slot_project(b.id);perform private.slot_enqueue(b.id,'pending');
  insert into public.notifications(organization_id,user_id,type,title,body,href) values(e.organization_id,e.owner_id,'event_slot_booking','Tijdslot namens inschrijver geboekt',left(b.name||' · '||s.title,500),'/app/events/'||e.id||'?tab=inschrijvingen');
  return jsonb_build_object('id',b.id);
 end if;
 select * into b from public.event_slot_bookings where id=(d->>'id')::uuid and slot_id=s.id for update;
 if not found then raise exception 'slot_booking_unavailable';end if;
 if op='decide' then
  if d->>'status'='confirmed' and e.status in('completed','cancelled','archived') then raise exception 'slot_closed';end if;
  if d->>'status' not in('confirmed','rejected','cancelled') then raise exception 'invalid_booking_status';end if;
  if b.status=d->>'status' then return jsonb_build_object('id',b.id);end if;
  if not (b.status='pending' and d->>'status' in('confirmed','rejected','cancelled') or b.status='confirmed' and d->>'status'='cancelled') then raise exception 'slot_booking_not_pending';end if;
  update public.event_slot_bookings set status=d->>'status',decided_by=auth.uid(),decided_at=clock_timestamp() where id=b.id;
  perform private.slot_project(b.id);perform private.slot_enqueue(b.id,d->>'status');
  return jsonb_build_object('id',b.id);
 end if;
 raise exception 'invalid_slot_operation';
end$$;
create function public.event_slot_owner(o uuid,eid uuid,op text,d jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.slot_owner_operation(o,eid,op,d)$$;
revoke all on function private.slot_owner_operation(uuid,uuid,text,jsonb),public.event_slot_owner(uuid,uuid,text,jsonb) from public,anon;
grant execute on function private.slot_owner_operation(uuid,uuid,text,jsonb),public.event_slot_owner(uuid,uuid,text,jsonb) to authenticated;

-- Public requests run only through server-side validation. No anon/authenticated grants on this endpoint.
create function public.event_slot_public(pid uuid,op text,d jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.event_slot_pages;e public.events;s public.event_time_slots;b public.event_slot_bookings;used integer;items jsonb;
begin
 select * into p from public.event_slot_pages where public_id=pid and published;
 if not found then raise exception 'slot_page_unavailable';end if;
 select * into e from public.events where id=p.event_id and organization_id=p.organization_id and deleted_at is null and status not in('completed','cancelled','archived') for share;
 if not found or e.owner_id is null then raise exception 'slot_page_unavailable';end if;
 perform 1 from public.organization_members where organization_id=e.organization_id and user_id=e.owner_id and status='active' for share;
 if not found then raise exception 'slot_page_unavailable';end if;
 select * into p from public.event_slot_pages where public_id=pid and published for share;
 if not found then raise exception 'slot_page_unavailable';end if;
 if op='list' then
  select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'title',v.title,'kind',v.kind,'description',v.description,'location',v.location,'starts_at',v.starts_at,'ends_at',v.ends_at,'capacity',v.capacity,'available',greatest(0,v.capacity-(select count(*) from public.event_slot_bookings counted where counted.slot_id=v.id and counted.status in('pending','confirmed')))) order by v.starts_at),'[]') into items from public.event_time_slots v where v.event_id=e.id and v.organization_id=e.organization_id and v.is_open and v.starts_at>clock_timestamp();
  return jsonb_build_object('title',e.title,'slots',items);
 end if;
 if op='verify' then
  select * into b from public.event_slot_bookings where id=(d->>'id')::uuid and event_id=e.id and organization_id=e.organization_id;
  if not found or b.verification_hash is null or b.verification_hash<>d->>'hash' then raise exception 'slot_verification_invalid';end if;
  select * into s from public.event_time_slots where id=b.slot_id for update;
  select * into b from public.event_slot_bookings where id=b.id for update;
  if b.verification_expires_at<=clock_timestamp() then raise exception 'slot_verification_expired';end if;
  if b.status in('pending','confirmed') then return jsonb_build_object('status',b.status);end if;
  if b.status<>'unverified' then raise exception 'slot_verification_expired';end if;
  if not s.is_open or s.starts_at<=clock_timestamp() then raise exception 'slot_closed';end if;
  select count(*) into used from public.event_slot_bookings where slot_id=s.id and status in('pending','confirmed');
  if used>=s.capacity then raise exception 'slot_full';end if;
  update public.event_slot_bookings set status='pending',verified_at=clock_timestamp() where id=b.id;
  perform private.slot_project(b.id);perform private.slot_enqueue(b.id,'pending');
  insert into public.notifications(organization_id,user_id,type,title,body,href) values(e.organization_id,e.owner_id,'event_slot_booking','Nieuwe tijdslotaanvraag',left(b.name||' · '||s.title,500),'/app/events/'||e.id||'?tab=inschrijvingen');
  return jsonb_build_object('status','pending');
 end if;
 if op<>'request' then raise exception 'invalid_slot_operation';end if;
 if coalesce(d->>'ip_hash','') !~ '^[a-f0-9]{64}$' then raise exception 'invalid_request_source';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('slot-ip:'||(d->>'ip_hash'),9153));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(e.id::text,7349));
 if (select count(*) from public.event_slot_bookings where ip_hash=d->>'ip_hash' and created_at>clock_timestamp()-interval '1 hour')>=20 then raise exception 'slot_rate_limited';end if;
 select * into s from public.event_time_slots where id=(d->>'slot_id')::uuid and event_id=e.id and organization_id=e.organization_id for update;
 if not found or not s.is_open or s.starts_at<=clock_timestamp() then raise exception 'slot_closed';end if;
 select * into b from public.event_slot_bookings where id=(d->>'id')::uuid;
 if found then
  if b.source<>'public' or b.slot_id<>s.id or b.email<>lower(btrim(d->>'email')) or b.name<>btrim(d->>'name') or b.channel<>coalesce(d->>'channel','email') or b.account_user_id is distinct from nullif(d->>'account_user_id','')::uuid or b.discord_user_id is distinct from nullif(d->>'discord_user_id','') then raise exception 'slot_idempotency_conflict';end if;
  return jsonb_build_object('received',true);
 end if;
 if (select count(*) from public.event_slot_bookings where event_id=e.id and email=lower(btrim(d->>'email')) and created_at>clock_timestamp()-interval '1 hour')>=5
 or (select count(*) from public.event_slot_bookings where event_id=e.id and created_at>clock_timestamp()-interval '1 hour')>=500 then raise exception 'slot_rate_limited';end if;
 update public.event_slot_bookings set status='expired' where slot_id=s.id and email=lower(btrim(d->>'email')) and status='unverified' and verification_expires_at<=clock_timestamp();
 select count(*) into used from public.event_slot_bookings where slot_id=s.id and status in('pending','confirmed');
 if used>=s.capacity then raise exception 'slot_full';end if;
 if exists(select 1 from public.event_slot_bookings where slot_id=s.id and email=lower(btrim(d->>'email')) and status in('unverified','pending','confirmed')) then return jsonb_build_object('received',true);end if;
 if d->>'hash' !~ '^[a-f0-9]{64}$' or char_length(d->>'verification_url')>2000 then raise exception 'invalid_verification';end if;
 insert into public.event_slot_bookings(id,organization_id,event_id,slot_id,name,email,status,source,verification_hash,verification_expires_at,account_user_id,discord_user_id,channel,ip_hash)
 values((d->>'id')::uuid,e.organization_id,e.id,s.id,btrim(d->>'name'),lower(btrim(d->>'email')),'unverified','public',d->>'hash',clock_timestamp()+interval '30 minutes',nullif(d->>'account_user_id','')::uuid,nullif(d->>'discord_user_id',''),coalesce(d->>'channel','email'),d->>'ip_hash') returning * into b;
 perform private.slot_enqueue(b.id,'verify',d->>'verification_url');
 return jsonb_build_object('received',true);
end$$;

create function public.event_slot_message(op text,d jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare m private.event_slot_messages; b public.event_slot_bookings;
begin
 if op='claim' then
  update public.event_slot_bookings set status='expired' where status='unverified' and verification_expires_at<=clock_timestamp() and (nullif(d->>'organization_id','') is null or organization_id=(d->>'organization_id')::uuid);
  update private.event_slot_messages set state=case when state='queued' then 'failed' else state end,body='Verificatielink verlopen.',error_code='verification_expired' where (nullif(d->>'organization_id','') is null or organization_id=(d->>'organization_id')::uuid) and kind='verify' and booking_id in(select id from public.event_slot_bookings where verification_expires_at<=clock_timestamp());
  -- An expired pre-send lease can retry; an expired dispatch is uncertain, never blindly resent.
  update private.event_slot_messages set state=case when state='dispatching' then 'uncertain' when attempts>=5 then 'failed' else 'queued' end,error_code='lease_expired' where (nullif(d->>'organization_id','') is null or organization_id=(d->>'organization_id')::uuid) and state in('leased','dispatching') and lease_until<clock_timestamp();
  select * into m from private.event_slot_messages where state='queued' and (nullif(d->>'booking_id','') is null or booking_id=(d->>'booking_id')::uuid) and channel=d->>'channel' and attempts<5 and next_attempt_at<=clock_timestamp() and not exists(select 1 from private.event_slot_messages previous where previous.booking_id=event_slot_messages.booking_id and previous.created_at<event_slot_messages.created_at and previous.state in('queued','leased','dispatching')) and (nullif(d->>'organization_id','') is null or organization_id=(d->>'organization_id')::uuid) order by created_at for update skip locked limit 1;
  if not found then return '{}'::jsonb;end if;
  update private.event_slot_messages set state='leased',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '2 minutes',worker=d->>'worker',attempts=attempts+1 where id=m.id returning * into m;
  select * into strict b from public.event_slot_bookings where id=m.booking_id;
  return to_jsonb(m)||jsonb_build_object('account_user_id',b.account_user_id,'email',b.email,'discord_user_id',b.discord_user_id);
 end if;
 select * into m from private.event_slot_messages where id=(d->>'id')::uuid and lease_token=(d->>'lease_token')::uuid and worker=d->>'worker' and (nullif(d->>'organization_id','') is null or organization_id=(d->>'organization_id')::uuid) for update;
 if not found then raise exception 'slot_message_lease_conflict';end if;
 if op='sent' and m.state='sent' and m.message_id=d->>'message_id' then return jsonb_build_object('ok',true);end if;
 if m.lease_until<=clock_timestamp() or m.state not in('leased','dispatching') then raise exception 'slot_message_lease_conflict';end if;
 if op='inspect' then select * into strict b from public.event_slot_bookings where id=m.booking_id;return to_jsonb(m)||jsonb_build_object('account_user_id',b.account_user_id);end if;
 if op='draft' and m.state='leased' then update private.event_slot_messages set draft_id=d->>'draft_id' where id=m.id;
 elsif op='dispatch' and m.state='leased' then update private.event_slot_messages set state='dispatching' where id=m.id;
 elsif op='sent' and m.state='dispatching' then update private.event_slot_messages set state='sent',message_id=d->>'message_id',sent_at=clock_timestamp(),body=case when kind='verify' then 'Verificatiemail verzonden.' else body end where id=m.id;
 elsif op='fail' then update private.event_slot_messages set state=case when m.state='dispatching' or d->>'error_code'='outcome_unknown' then 'uncertain' when attempts>=5 then 'failed' else 'queued' end,error_code=d->>'error_code',next_attempt_at=clock_timestamp()+interval '5 minutes' where id=m.id;
 elsif op='fallback' and m.channel='discord' then
  select * into strict b from public.event_slot_bookings where id=m.booking_id;
  update private.event_slot_messages set channel='email',recipient=b.email,state='queued',attempts=0,error_code='discord_unavailable' where id=m.id;
 else raise exception 'invalid_message_operation';end if;
 return jsonb_build_object('ok',true);
end$$;
revoke all on function private.slot_enqueue(uuid,text,text),private.slot_project(uuid),public.event_slot_public(uuid,text,jsonb),public.event_slot_message(text,jsonb) from public,anon,authenticated;
grant execute on function public.event_slot_public(uuid,text,jsonb),public.event_slot_message(text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
