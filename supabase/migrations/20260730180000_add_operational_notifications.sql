alter table public.notification_preferences
add column if not exists follow_up_notifications boolean not null default true;

create or replace function public.generate_my_operational_notifications(p_now timestamptz default now())
returns integer
language plpgsql
security invoker
set search_path=''
as $$
declare
  current_user_id uuid := (select auth.uid());
  local_today date := (p_now at time zone 'Europe/Brussels')::date;
  inserted_count integer := 0;
  affected integer := 0;
  membership_row public.organization_members%rowtype;
  preferences_row public.notification_preferences%rowtype;
begin
  if current_user_id is null then return 0; end if;

  for membership_row in
    select *
    from public.organization_members
    where user_id=current_user_id and status='active'
  loop
    insert into public.notification_preferences(organization_id,user_id)
    values(membership_row.organization_id,current_user_id)
    on conflict(organization_id,user_id) do nothing;

    select * into preferences_row
    from public.notification_preferences
    where organization_id=membership_row.organization_id and user_id=current_user_id;

    if preferences_row.follow_up_notifications then
      update public.notifications
      set type='sponsor_follow_up'
      where organization_id=membership_row.organization_id
        and user_id=current_user_id
        and type='deadline'
        and dedupe_key like 'deadline:partner:%';

      with event_gaps as (
        select
          e.id,
          e.title,
          e.start_at,
          not exists(
            select 1 from public.google_resource_links g
            where g.organization_id=e.organization_id
              and g.entity_type='event'
              and g.entity_id=e.id
              and g.resource_type='document'
          ) missing_runbook,
          not exists(
            select 1 from public.google_resource_links g
            where g.organization_id=e.organization_id
              and g.entity_type='event'
              and g.entity_id=e.id
              and g.resource_type='calendar_event'
              and g.name not like '[VERWIJDERD]%'
          ) missing_calendar
        from public.events e
        where e.organization_id=membership_row.organization_id
          and e.deleted_at is null
          and e.status in ('confirmed','production')
          and e.start_at is not null
          and (e.start_at at time zone 'Europe/Brussels')::date between local_today and local_today+30
          and (e.owner_id=current_user_id or membership_row.role in ('admin','board'))
      )
      insert into public.notifications(
        organization_id,user_id,type,title,body,entity_id,href,severity,dedupe_key
      )
      select
        membership_row.organization_id,
        current_user_id,
        'event_readiness',
        'Eventvoorbereiding onvolledig: '||title,
        concat_ws(' en ',
          case when missing_runbook then 'het draaiboek ontbreekt' end,
          case when missing_calendar then 'de Google Calendar-koppeling ontbreekt' end
        )||'.',
        id,
        '/app/events/'||id::text,
        case when (start_at at time zone 'Europe/Brussels')::date<=local_today+7 then 'urgent' else 'warning' end,
        'event-readiness:'||id::text||':'||to_char(local_today,'IYYY-IW')
      from event_gaps
      where missing_runbook or missing_calendar
      on conflict(user_id,dedupe_key) where dedupe_key is not null do nothing;
      get diagnostics affected=row_count;
      inserted_count:=inserted_count+affected;

      with meeting_gaps as (
        select
          m.id,
          m.title,
          m.meeting_at,
          (
            nullif(trim(coalesce(m.minutes_url,'')),'') is null
            and not exists(
              select 1 from public.google_resource_links g
              where g.organization_id=m.organization_id
                and g.entity_type='meeting'
                and g.entity_id=m.id
                and g.resource_type='document'
            )
          ) missing_minutes,
          (
            select count(*)
            from public.meeting_action_items a
            where a.organization_id=m.organization_id
              and a.meeting_id=m.id
              and a.status in ('todo','doing')
          ) open_actions
        from public.meetings m
        where m.organization_id=membership_row.organization_id
          and m.deleted_at is null
          and m.status not in ('cancelled','archived')
          and m.meeting_at is not null
          and (m.meeting_at at time zone 'Europe/Brussels')::date<=local_today
          and (m.created_by=current_user_id or membership_row.role in ('admin','board'))
      )
      insert into public.notifications(
        organization_id,user_id,type,title,body,entity_id,href,severity,dedupe_key
      )
      select
        membership_row.organization_id,
        current_user_id,
        'meeting_follow_up',
        'Vergadering vraagt opvolging: '||title,
        concat_ws(' en ',
          case when missing_minutes then 'de notulen ontbreken' end,
          case when open_actions>0 then open_actions::text||case when open_actions=1 then ' actiepunt staat nog open' else ' actiepunten staan nog open' end end
        )||'.',
        id,
        '/app/vergaderingen/'||id::text,
        case when open_actions>0 then 'warning' else 'info' end,
        'meeting-follow-up:'||id::text||':'||to_char(local_today,'IYYY-IW')
      from meeting_gaps
      where missing_minutes or open_actions>0
      on conflict(user_id,dedupe_key) where dedupe_key is not null do nothing;
      get diagnostics affected=row_count;
      inserted_count:=inserted_count+affected;
    end if;
  end loop;

  return inserted_count;
end;
$$;

create or replace function public.refresh_my_notifications(p_now timestamptz default now())
returns integer
language plpgsql
security invoker
set search_path=''
as $$
declare
  base_count integer := 0;
  operational_count integer := 0;
begin
  base_count := public.generate_my_notifications(p_now);
  operational_count := public.generate_my_operational_notifications(p_now);
  return base_count+operational_count;
end;
$$;

grant execute on function public.generate_my_operational_notifications(timestamptz) to authenticated;
grant execute on function public.refresh_my_notifications(timestamptz) to authenticated;
