-- Date-only facts coexist with precise timestamps. Existing timestamps stay intact.
alter table public.events add column start_date date, add column end_date date;
update public.events set
  start_date = (start_at at time zone 'Europe/Brussels')::date,
  end_date = (end_at at time zone 'Europe/Brussels')::date;

-- Also support older writers that still only supply timestamps.
create function private.align_event_dates() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.start_at is not null then
    new.start_date := (new.start_at at time zone 'Europe/Brussels')::date;
  end if;
  if new.end_at is not null then
    new.end_date := (new.end_at at time zone 'Europe/Brussels')::date;
  end if;
  return new;
end;
$$;
revoke all on function private.align_event_dates() from public;
create trigger align_event_dates before insert or update on public.events
for each row execute function private.align_event_dates();
alter table public.events add constraint events_date_order
  check (start_date is null or end_date is null or end_date >= start_date);
create index events_org_date_idx on public.events(organization_id, start_date, status)
  where deleted_at is null;
comment on column public.events.start_date is 'Brussels event date, also known when start time is unknown. start_at remains NULL in that case.';
comment on column public.events.end_date is 'Brussels event date, also known when end time is unknown. end_at remains NULL in that case.';
