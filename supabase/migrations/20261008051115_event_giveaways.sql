begin;

-- Uses the organization-scoped parent keys introduced by event_materials.
create table public.event_giveaways (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null,
  name text not null check (char_length(trim(name)) between 2 and 180),
  quantity_planned integer not null check (quantity_planned between 1 and 100000),
  quantity_received integer check (quantity_received between 0 and 100000),
  quantity_distributed integer check (quantity_distributed between 0 and 100000),
  source text not null default 'own' check (source in ('own','supplied','purchased')),
  provider text check (char_length(provider)<=300),
  responsible_person_id uuid,
  status text not null default 'needed' check (status in ('needed','arranged','received','distributing','completed','cancelled')),
  notes text check (char_length(notes)<=4000),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(organization_id,event_id) references public.events(organization_id,id) on delete cascade,
  foreign key(organization_id,responsible_person_id) references public.community_people(organization_id,id),
  check (quantity_distributed is null or quantity_distributed=0 or (quantity_received is not null and quantity_distributed<=quantity_received))
);
create index event_giveaways_event_idx on public.event_giveaways(organization_id,event_id,created_at);
create index event_giveaways_responsible_person_idx on public.event_giveaways(organization_id,responsible_person_id) where responsible_person_id is not null;

alter table public.event_giveaways enable row level security;
revoke all on public.event_giveaways from public,anon,authenticated;
grant select,insert,update,delete on public.event_giveaways to authenticated;

create policy "members read event giveaways" on public.event_giveaways for select to authenticated
  using(private.is_active_member(organization_id) and exists(
    select 1 from public.events e where e.id=event_id and e.organization_id=event_giveaways.organization_id and e.deleted_at is null
  ));
create policy "event managers insert giveaways" on public.event_giveaways for insert to authenticated
  with check(private.can_manage_events(organization_id) and created_by=(select auth.uid()) and exists(
    select 1 from public.events e where e.id=event_id and e.organization_id=event_giveaways.organization_id and e.deleted_at is null
  ));
create policy "event managers update giveaways" on public.event_giveaways for update to authenticated
  using(private.can_manage_events(organization_id)) with check(private.can_manage_events(organization_id));
create policy "event managers delete giveaways" on public.event_giveaways for delete to authenticated
  using(private.can_manage_events(organization_id) and exists(
    select 1 from public.events e where e.id=event_id and e.organization_id=event_giveaways.organization_id and e.deleted_at is null
  ));

create function public.guard_event_giveaway() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='UPDATE' then
    if new.organization_id<>old.organization_id or new.event_id<>old.event_id or new.created_by<>old.created_by then
      raise exception 'event_giveaway_identity_changed' using errcode='42501';
    end if;
    new.created_at=old.created_at;
  end if;
  perform 1 from public.events e where e.id=new.event_id and e.organization_id=new.organization_id and e.deleted_at is null for share;
  if not found then raise exception 'event_giveaway_event_unavailable' using errcode='42501'; end if;
  if new.responsible_person_id is not null and (tg_op='INSERT' or new.responsible_person_id is distinct from old.responsible_person_id) then
    perform 1 from public.community_people p where p.id=new.responsible_person_id and p.organization_id=new.organization_id and p.deleted_at is null and p.status<>'archived';
    if not found then raise exception 'event_giveaway_person_unavailable' using errcode='42501'; end if;
  end if;
  new.name=btrim(new.name);
  new.updated_at=now();
  return new;
end;
$$;
revoke all on function public.guard_event_giveaway() from public,anon;
grant execute on function public.guard_event_giveaway() to authenticated;
create trigger guard_event_giveaway before insert or update on public.event_giveaways for each row execute function public.guard_event_giveaway();
commit;
