begin;
create table public.event_registration_settings (
 organization_id uuid not null references public.organizations(id) on delete cascade,
 event_id uuid not null,
 mode text not null check(mode in ('none','external','internal')),
 capacity integer check(capacity between 1 and 100000),
 external_url text check(external_url is null or (char_length(external_url)<=2000 and external_url ~* '^https?://[^[:space:]]+$')),
 notes text check(char_length(notes)<=4000),
 updated_by uuid not null references public.profiles(id), updated_at timestamptz not null default now(),
 primary key(organization_id,event_id),
 foreign key(organization_id,event_id) references public.events(organization_id,id) on delete cascade,
 check(mode<>'external' or external_url is not null)
);
create table public.event_registrations (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 event_id uuid not null,
 name text not null check(char_length(trim(name)) between 2 and 180),
 quantity integer not null default 1 check(quantity between 1 and 1000),
 status text not null default 'registered' check(status in ('registered','waitlist','attended','cancelled')),
 notes text check(char_length(notes)<=4000),
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(organization_id,event_id) references public.event_registration_settings(organization_id,event_id) on delete cascade
);
create index event_registrations_event_idx on public.event_registrations(organization_id,event_id,created_at);
alter table public.event_registration_settings enable row level security;
revoke all on public.event_registration_settings from public,anon,authenticated;
grant select,insert,update on public.event_registration_settings to authenticated;
create policy "read event_registration_settings" on public.event_registration_settings for select to authenticated using(private.is_active_member(organization_id) and exists(select 1 from public.events e where e.id=event_id and e.organization_id=event_registration_settings.organization_id and e.deleted_at is null));
create policy "insert event_registration_settings" on public.event_registration_settings for insert to authenticated with check(private.can_manage_events(organization_id) and updated_by=(select auth.uid()) and exists(select 1 from public.events e where e.id=event_id and e.organization_id=event_registration_settings.organization_id and e.deleted_at is null));
create policy "update event_registration_settings" on public.event_registration_settings for update to authenticated using(private.can_manage_events(organization_id) and exists(select 1 from public.events e where e.id=event_id and e.organization_id=event_registration_settings.organization_id and e.deleted_at is null)) with check(private.can_manage_events(organization_id) and exists(select 1 from public.events e where e.id=event_id and e.organization_id=event_registration_settings.organization_id and e.deleted_at is null));
alter table public.event_registrations enable row level security;
revoke all on public.event_registrations from public,anon,authenticated;
grant select,insert,update,delete on public.event_registrations to authenticated;
create policy "read event_registrations" on public.event_registrations for select to authenticated using(private.can_manage_events(organization_id) and exists(select 1 from public.events e where e.id=event_id and e.organization_id=event_registrations.organization_id and e.deleted_at is null));
create policy "insert event_registrations" on public.event_registrations for insert to authenticated with check(private.can_manage_events(organization_id) and created_by=(select auth.uid()) and exists(select 1 from public.events e where e.id=event_id and e.organization_id=event_registrations.organization_id and e.deleted_at is null));
create policy "update event_registrations" on public.event_registrations for update to authenticated using(private.can_manage_events(organization_id) and exists(select 1 from public.events e where e.id=event_id and e.organization_id=event_registrations.organization_id and e.deleted_at is null)) with check(private.can_manage_events(organization_id) and exists(select 1 from public.events e where e.id=event_id and e.organization_id=event_registrations.organization_id and e.deleted_at is null));
create policy "delete event_registrations" on public.event_registrations for delete to authenticated using(private.can_manage_events(organization_id) and exists(select 1 from public.events e where e.id=event_id and e.organization_id=event_registrations.organization_id and e.deleted_at is null));
create function public.guard_event_registration() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if new.organization_id<>old.organization_id or new.event_id<>old.event_id then raise exception 'registration_identity_changed' using errcode='42501'; end if;
  if tg_table_name='event_registrations' then
   if new.created_by<>old.created_by then raise exception 'registration_creator_changed' using errcode='42501'; end if;
   new.created_at=old.created_at;
  end if;
 end if;
 perform 1 from public.events e where e.id=new.event_id and e.organization_id=new.organization_id and e.deleted_at is null for share;
 if not found then raise exception 'registration_event_unavailable' using errcode='42501'; end if;
 if tg_table_name='event_registration_settings' then
  if new.updated_by is distinct from auth.uid() then raise exception 'registration_author_changed' using errcode='42501'; end if;
 else
  -- Serialize configuration changes with new entries; historic entries can still be maintained.
  perform 1 from public.event_registration_settings s where s.event_id=new.event_id and s.organization_id=new.organization_id and (tg_op='UPDATE' or s.mode='internal') for share;
  if not found then raise exception 'registration_internal_mode_required' using errcode='42501'; end if;
  new.name=btrim(new.name);
 end if;
 new.updated_at=now(); return new;
end;
$$;
revoke all on function public.guard_event_registration() from public,anon;
grant execute on function public.guard_event_registration() to authenticated;
create trigger guard_event_registration_settings before insert or update on public.event_registration_settings for each row execute function public.guard_event_registration();
create trigger guard_event_registration before insert or update on public.event_registrations for each row execute function public.guard_event_registration();
commit;
