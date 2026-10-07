begin;

-- Uses the organization-scoped parent keys introduced by event_materials.
create table public.event_schedule_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null,
  title text not null check (char_length(trim(title)) between 2 and 180),
  kind text not null default 'program' check (kind in ('program','stream','runbook','shift')),
  person_id uuid,
  location text check (char_length(location)<=300),
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'draft' check (status in ('draft','confirmed','completed','cancelled')),
  notes text check (char_length(notes)<=4000),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(organization_id,event_id) references public.events(organization_id,id) on delete cascade,
  foreign key(organization_id,person_id) references public.community_people(organization_id,id),
  check (ends_at is null or (starts_at is not null and ends_at>starts_at))
);
create index event_schedule_items_event_idx on public.event_schedule_items(organization_id,event_id,starts_at,created_at);
create index event_schedule_items_person_idx on public.event_schedule_items(organization_id,person_id) where person_id is not null;

alter table public.event_schedule_items enable row level security;
revoke all on public.event_schedule_items from public,anon,authenticated;
grant select,insert,update,delete on public.event_schedule_items to authenticated;

create policy "members read event schedule" on public.event_schedule_items for select to authenticated
  using(private.is_active_member(organization_id) and exists(
    select 1 from public.events e where e.id=event_id and e.organization_id=event_schedule_items.organization_id and e.deleted_at is null
  ));
create policy "event managers insert schedule" on public.event_schedule_items for insert to authenticated
  with check(private.can_manage_events(organization_id) and created_by=(select auth.uid()) and exists(
    select 1 from public.events e where e.id=event_id and e.organization_id=event_schedule_items.organization_id and e.deleted_at is null
  ));
create policy "event managers update schedule" on public.event_schedule_items for update to authenticated
  using(private.can_manage_events(organization_id)) with check(private.can_manage_events(organization_id));
create policy "event managers delete schedule" on public.event_schedule_items for delete to authenticated
  using(private.can_manage_events(organization_id) and exists(
    select 1 from public.events e where e.id=event_id and e.organization_id=event_schedule_items.organization_id and e.deleted_at is null
  ));

create function public.guard_event_schedule() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='UPDATE' then
    if new.organization_id<>old.organization_id or new.event_id<>old.event_id or new.created_by<>old.created_by then
      raise exception 'event_schedule_identity_changed' using errcode='42501';
    end if;
    new.created_at=old.created_at;
  end if;
  perform 1 from public.events e where e.id=new.event_id and e.organization_id=new.organization_id and e.deleted_at is null for share;
  if not found then raise exception 'event_schedule_event_unavailable' using errcode='42501'; end if;
  if new.person_id is not null and (tg_op='INSERT' or new.person_id is distinct from old.person_id) then
    perform 1 from public.community_people p where p.id=new.person_id and p.organization_id=new.organization_id and p.deleted_at is null and p.status<>'archived';
    if not found then raise exception 'event_schedule_person_unavailable' using errcode='42501'; end if;
  end if;
  new.title=btrim(new.title);
  new.updated_at=now();
  return new;
end;
$$;
revoke all on function public.guard_event_schedule() from public,anon;
grant execute on function public.guard_event_schedule() to authenticated;
create trigger guard_event_schedule before insert or update on public.event_schedule_items for each row execute function public.guard_event_schedule();
commit;
