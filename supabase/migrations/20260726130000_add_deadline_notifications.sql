alter table public.notifications
  add column if not exists severity text not null default 'info'
    check (severity in ('info','warning','urgent')),
  add column if not exists dedupe_key text;

create unique index if not exists notifications_user_dedupe_uidx
  on public.notifications(user_id, dedupe_key)
  where dedupe_key is not null;

create table public.notification_preferences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  deadline_notifications boolean not null default true,
  assignment_notifications boolean not null default true,
  daily_digest boolean not null default true,
  weekly_digest boolean not null default true,
  reminder_days integer[] not null default array[1,3,7],
  updated_at timestamptz not null default now(),
  primary key (organization_id,user_id),
  check (array_length(reminder_days,1) is null or reminder_days <@ array[1,2,3,5,7,14,30])
);

alter table public.notification_preferences enable row level security;
grant select,insert,update,delete on public.notification_preferences to authenticated;
create policy "users read own notification preferences" on public.notification_preferences for select to authenticated
using (user_id=(select auth.uid()) and private.is_active_member(organization_id));
create policy "users create own notification preferences" on public.notification_preferences for insert to authenticated
with check (user_id=(select auth.uid()) and private.is_active_member(organization_id));
create policy "users update own notification preferences" on public.notification_preferences for update to authenticated
using (user_id=(select auth.uid()) and private.is_active_member(organization_id))
with check (user_id=(select auth.uid()) and private.is_active_member(organization_id));

create or replace function public.generate_my_notifications(p_now timestamptz default now())
returns integer language plpgsql security invoker set search_path='' as $$
declare
  current_user_id uuid := (select auth.uid());
  local_today date := (p_now at time zone 'Europe/Brussels')::date;
  inserted_count integer := 0; affected integer := 0; daily_count integer := 0; weekly_count integer := 0;
  membership_row public.organization_members%rowtype;
  preferences_row public.notification_preferences%rowtype;
begin
  if current_user_id is null then return 0; end if;
  for membership_row in select * from public.organization_members where user_id=current_user_id and status='active'
  loop
    insert into public.notification_preferences(organization_id,user_id)
    values(membership_row.organization_id,current_user_id) on conflict(organization_id,user_id) do nothing;
    select * into preferences_row from public.notification_preferences
    where organization_id=membership_row.organization_id and user_id=current_user_id;

    if preferences_row.deadline_notifications then
      with candidates as (
        select 'task'::text source_type,t.id,t.title,(t.due_at at time zone 'Europe/Brussels')::date due_date,
          '/app/taken/'||t.id::text href,'task'::public.entity_kind entity_type
        from public.tasks t where t.organization_id=membership_row.organization_id and t.deleted_at is null
          and t.status not in ('done','cancelled') and t.due_at is not null and
          (exists(select 1 from public.task_assignees a where a.task_id=t.id and a.user_id=current_user_id)
           or (t.created_by=current_user_id and not exists(select 1 from public.task_assignees a where a.task_id=t.id)))
        union all
        select 'project',p.id,p.title,p.due_date,'/app/projecten/'||p.id::text,'project'::public.entity_kind
        from public.projects p where p.organization_id=membership_row.organization_id and p.deleted_at is null
          and p.owner_id=current_user_id and p.due_date is not null and p.status not in ('done','archived')
        union all
        select 'event',e.id,e.title,(e.start_at at time zone 'Europe/Brussels')::date,'/app/events/'||e.id::text,null::public.entity_kind
        from public.events e where e.organization_id=membership_row.organization_id and e.deleted_at is null
          and e.owner_id=current_user_id and e.start_at is not null and e.status not in ('completed','cancelled','archived')
        union all
        select 'campaign',c.id,c.title,c.end_date,'/app/campagnes/'||c.id::text,null::public.entity_kind
        from public.campaigns c where c.organization_id=membership_row.organization_id and c.deleted_at is null
          and c.owner_id=current_user_id and c.end_date is not null and c.status not in ('completed','cancelled','archived')
        union all
        select 'content',c.id,c.title,c.deadline,'/app/content/'||c.id::text,null::public.entity_kind
        from public.content_items c where c.organization_id=membership_row.organization_id and c.deleted_at is null
          and c.owner_id=current_user_id and c.deadline is not null and c.status not in ('published','archived')
        union all
        select 'partner',p.id,p.name,p.next_follow_up,'/app/sponsors/'||p.id::text,null::public.entity_kind
        from public.partners p where p.organization_id=membership_row.organization_id and p.deleted_at is null
          and p.owner_id=current_user_id and p.next_follow_up is not null and p.status not in ('inactive','rejected','archived')
        union all
        select 'compliance',d.id,d.title,d.due_date,'/app/administratie',null::public.entity_kind
        from public.compliance_deadlines d where d.organization_id=membership_row.organization_id and d.deleted_at is null
          and d.responsible_id=current_user_id and d.status in ('open','planned')
        union all
        select 'knowledge',k.id,k.title,k.review_due_date,'/app/kennisbank/'||k.id::text,null::public.entity_kind
        from public.knowledge_articles k where k.organization_id=membership_row.organization_id and k.deleted_at is null
          and k.owner_id=current_user_id and k.review_due_date is not null and k.status='published'
      )
      insert into public.notifications(organization_id,user_id,type,title,body,entity_type,entity_id,href,severity,dedupe_key)
      select membership_row.organization_id,current_user_id,'deadline',
        case when due_date<local_today then 'Deadline verstreken: '||title when due_date=local_today then 'Vandaag te doen: '||title else 'Deadline nadert: '||title end,
        case when due_date<local_today then 'Deze opvolging is sinds '||to_char(due_date,'DD/MM/YYYY')||' achterstallig.'
             when due_date=local_today then 'Deze opvolging moet vandaag worden afgewerkt.'
             else 'Nog '||(due_date-local_today)::text||' dagen tot '||to_char(due_date,'DD/MM/YYYY')||'.' end,
        entity_type,id,href,case when due_date<local_today then 'urgent' when due_date=local_today then 'warning' else 'info' end,
        'deadline:'||source_type||':'||id::text||':'||case when due_date<local_today then 'overdue' else (due_date-local_today)::text end
      from candidates where due_date<local_today or due_date=local_today or (due_date-local_today)=any(preferences_row.reminder_days)
      on conflict(user_id,dedupe_key) where dedupe_key is not null do nothing;
      get diagnostics affected=row_count; inserted_count:=inserted_count+affected;
    end if;

    select count(*) into daily_count from public.tasks t
    where t.organization_id=membership_row.organization_id and t.deleted_at is null and t.status not in ('done','cancelled')
      and t.due_at is not null and (t.due_at at time zone 'Europe/Brussels')::date<=local_today
      and (exists(select 1 from public.task_assignees a where a.task_id=t.id and a.user_id=current_user_id)
        or (t.created_by=current_user_id and not exists(select 1 from public.task_assignees a where a.task_id=t.id)));
    if preferences_row.daily_digest and daily_count>0 then
      insert into public.notifications(organization_id,user_id,type,title,body,href,severity,dedupe_key)
      values(membership_row.organization_id,current_user_id,'daily_digest','Dagoverzicht',
        daily_count::text||case when daily_count=1 then ' taak vraagt' else ' taken vragen' end||' vandaag je aandacht.',
        '/app/taken?van_mij=1&periode=achterstallig',case when daily_count>3 then 'urgent' else 'warning' end,'digest:daily:'||local_today::text)
      on conflict(user_id,dedupe_key) where dedupe_key is not null do nothing;
      get diagnostics affected=row_count; inserted_count:=inserted_count+affected;
    end if;

    select count(*) into weekly_count from public.tasks t
    where t.organization_id=membership_row.organization_id and t.deleted_at is null and t.status not in ('done','cancelled')
      and t.due_at is not null and (t.due_at at time zone 'Europe/Brussels')::date<=local_today+7
      and (exists(select 1 from public.task_assignees a where a.task_id=t.id and a.user_id=current_user_id)
        or (t.created_by=current_user_id and not exists(select 1 from public.task_assignees a where a.task_id=t.id)));
    if preferences_row.weekly_digest and weekly_count>0 then
      insert into public.notifications(organization_id,user_id,type,title,body,href,severity,dedupe_key)
      values(membership_row.organization_id,current_user_id,'weekly_digest','Weekoverzicht',
        weekly_count::text||case when weekly_count=1 then ' taak heeft' else ' taken hebben' end||' deze week een deadline of achterstand.',
        '/app/taken','info','digest:weekly:'||to_char(local_today,'IYYY-IW'))
      on conflict(user_id,dedupe_key) where dedupe_key is not null do nothing;
      get diagnostics affected=row_count; inserted_count:=inserted_count+affected;
    end if;
  end loop;
  return inserted_count;
end; $$;

grant execute on function public.generate_my_notifications(timestamptz) to authenticated;
