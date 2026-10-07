begin;

-- Composite keys prevent an event list from referencing another organization's data.
create unique index events_org_id_materials_key on public.events(organization_id,id);
create unique index assets_org_id_materials_key on public.assets(organization_id,id);
create unique index community_people_org_id_materials_key on public.community_people(organization_id,id);

create table public.event_materials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null,
  asset_id uuid,
  name text not null check (char_length(trim(name)) between 2 and 180),
  quantity integer not null default 1 check (quantity between 1 and 100000),
  source text not null default 'own' check (source in ('own','borrowed','rented','provided')),
  provider text check (char_length(provider)<=300),
  responsible_person_id uuid,
  location text check (char_length(location)<=300),
  pickup_at timestamptz,
  return_at timestamptz,
  status text not null default 'needed' check (status in ('needed','arranged','ready','in_use','returned','cancelled')),
  notes text check (char_length(notes)<=2000),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(organization_id,event_id) references public.events(organization_id,id) on delete cascade,
  foreign key(organization_id,asset_id) references public.assets(organization_id,id),
  foreign key(organization_id,responsible_person_id) references public.community_people(organization_id,id),
  check (return_at is null or pickup_at is null or return_at>=pickup_at)
);
create index event_materials_event_idx on public.event_materials(organization_id,event_id,created_at);
create index event_materials_asset_idx on public.event_materials(organization_id,asset_id) where asset_id is not null;
create index event_materials_person_idx on public.event_materials(organization_id,responsible_person_id) where responsible_person_id is not null;

alter table public.event_materials enable row level security;
revoke all on public.event_materials from public,anon,authenticated;
grant select,insert,update,delete on public.event_materials to authenticated;

create policy "members read event materials" on public.event_materials for select to authenticated
  using(private.is_active_member(organization_id) and exists(
    select 1 from public.events e where e.id=event_id and e.organization_id=event_materials.organization_id and e.deleted_at is null
  ));
create policy "event managers insert materials" on public.event_materials for insert to authenticated
  with check(private.can_manage_events(organization_id) and created_by=(select auth.uid()) and exists(
    select 1 from public.events e where e.id=event_id and e.organization_id=event_materials.organization_id and e.deleted_at is null
  ));
create policy "event managers update materials" on public.event_materials for update to authenticated
  using(private.can_manage_events(organization_id)) with check(private.can_manage_events(organization_id));
create policy "event managers delete materials" on public.event_materials for delete to authenticated
  using(private.can_manage_events(organization_id) and exists(
    select 1 from public.events e where e.id=event_id and e.organization_id=event_materials.organization_id and e.deleted_at is null
  ));

create function public.guard_event_material() returns trigger
language plpgsql security invoker set search_path='' as $$
declare asset_name text;
begin
  if tg_op='UPDATE' then
    if new.organization_id<>old.organization_id or new.event_id<>old.event_id or new.created_by<>old.created_by then
      raise exception 'event_material_identity_changed' using errcode='42501';
    end if;
    new.created_at=old.created_at;
  end if;
  perform 1 from public.events e where e.id=new.event_id and e.organization_id=new.organization_id and e.deleted_at is null for share;
  if not found then raise exception 'event_material_event_unavailable' using errcode='42501'; end if;
  if new.asset_id is not null then
    if tg_op='INSERT' or new.asset_id is distinct from old.asset_id then
      select a.name into asset_name from public.assets a where a.id=new.asset_id and a.organization_id=new.organization_id and a.deleted_at is null and a.status<>'archived';
      if not found then raise exception 'event_material_asset_unavailable' using errcode='42501'; end if;
      new.name=asset_name;
    else
      new.name=old.name;
    end if;
  end if;
  if new.responsible_person_id is not null and (tg_op='INSERT' or new.responsible_person_id is distinct from old.responsible_person_id) then
    perform 1 from public.community_people p where p.id=new.responsible_person_id and p.organization_id=new.organization_id and p.deleted_at is null and p.status<>'archived';
    if not found then raise exception 'event_material_person_unavailable' using errcode='42501'; end if;
  end if;
  new.name=btrim(new.name);
  new.updated_at=now();
  return new;
end;
$$;
revoke all on function public.guard_event_material() from public,anon;
grant execute on function public.guard_event_material() to authenticated;
create trigger guard_event_material before insert or update on public.event_materials for each row execute function public.guard_event_material();
commit;
