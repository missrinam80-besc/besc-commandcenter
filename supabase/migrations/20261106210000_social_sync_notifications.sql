alter table public.notification_preferences
  add column social_sync_notifications boolean not null default true;

-- Per recipient incident state; no credentials or provider error payloads.
create table private.social_sync_notification_state (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  account_id uuid not null references public.social_accounts(id) on delete cascade,
  incident_id uuid not null default gen_random_uuid(),
  reason text not null check(reason in('expired','failed','partial','overdue')),
  active boolean not null default true,
  opened_at timestamptz not null,
  primary key(user_id,account_id)
);
alter table private.social_sync_notification_state enable row level security;
revoke all on private.social_sync_notification_state from public,anon;
grant select,insert,update on private.social_sync_notification_state to authenticated,service_role;
create policy social_alert_own_state on private.social_sync_notification_state
  for all to authenticated
  using(user_id=(select auth.uid()) and private.is_org_manager(organization_id))
  with check(user_id=(select auth.uid()) and private.is_org_manager(organization_id)
    and exists(select 1 from public.social_accounts a where a.id=account_id
      and a.organization_id=social_sync_notification_state.organization_id));

-- Once a reader loses management access, historical social details are hidden too.
create policy social_alert_manager_read on public.notifications as restrictive
  for select to authenticated using(type<>'social_sync' or private.is_org_manager(organization_id));

-- Invoker: authenticated callers see only their own active organizations through RLS.
-- The service role uses the same logic to fan out from the existing cron endpoint.
create function public.refresh_social_sync_notifications(p_now timestamptz default now())
returns integer language plpgsql security invoker set search_path='' as $$
declare
  candidate record; prior private.social_sync_notification_state;
  v_reason text; alert_title text; alert_body text; key text;
  eligible boolean; affected integer; total integer:=0;
begin
  for candidate in
    select m.organization_id,m.user_id,a.id account_id,a.account_name,a.status,
      a.sync_enabled,a.deleted_at,a.last_sync_at,a.created_at,
      greatest(coalesce(a.sync_interval_minutes,1440),15) interval_minutes,
      r.status run_status
    from public.organization_members m
    join public.social_accounts a on a.organization_id=m.organization_id
    left join public.notification_preferences p on p.organization_id=m.organization_id and p.user_id=m.user_id
    left join lateral (
      select status from public.social_sync_runs
      where organization_id=a.organization_id and social_account_id=a.id
        and status in('succeeded','partial','failed')
      order by created_at desc,id desc limit 1
    ) r on true
    where m.status='active' and m.role in('admin','board')
      and (current_user='service_role' or m.user_id=(select auth.uid()))
      and coalesce(p.social_sync_notifications,true)
      and a.platform in('youtube','twitch','facebook','instagram','threads')
    order by m.user_id,a.id
  loop
    perform pg_advisory_xact_lock(hashtextextended(candidate.user_id::text||':'||candidate.account_id::text,0));
    select * into prior from private.social_sync_notification_state
      where user_id=candidate.user_id and account_id=candidate.account_id for update;
    eligible:=candidate.sync_enabled and candidate.deleted_at is null
      and candidate.status in('connected','expired','error');
    v_reason:=case
      when not eligible then null
      when candidate.status='expired' then 'expired'
      when candidate.status='error' or candidate.run_status='failed' then 'failed'
      when candidate.run_status='partial' then 'partial'
      when coalesce(candidate.last_sync_at,candidate.created_at)
        +make_interval(mins=>candidate.interval_minutes+30)<p_now then 'overdue'
      else null end;
    if v_reason is not null then
      if prior.user_id is null or not prior.active then
        insert into private.social_sync_notification_state(organization_id,user_id,account_id,reason,opened_at)
          values(candidate.organization_id,candidate.user_id,candidate.account_id,v_reason,p_now)
          on conflict(user_id,account_id) do update set incident_id=gen_random_uuid(),reason=excluded.reason,active=true,opened_at=excluded.opened_at
          returning * into prior;
      else
        update private.social_sync_notification_state s set reason=v_reason
          where s.user_id=candidate.user_id and s.account_id=candidate.account_id;
      end if;
      alert_title:='Socialsynchronisatie vraagt aandacht';
      alert_body:=candidate.account_name||': '||case v_reason
        when 'expired' then 'de toegang is verlopen. Controleer de koppeling.'
        when 'failed' then 'de laatste synchronisatie is mislukt. Controleer de integratielogs.'
        when 'partial' then 'de laatste synchronisatie is slechts gedeeltelijk uitgevoerd. Controleer de integratielogs.'
        else 'de dagelijkse of ingestelde synchronisatie is meer dan 30 minuten te laat. Controleer de planner en integratielogs.' end;
      key:='social-sync:'||candidate.account_id::text||':'||prior.incident_id::text;
      insert into public.notifications(organization_id,user_id,type,title,body,href,severity,dedupe_key)
        values(candidate.organization_id,candidate.user_id,'social_sync',alert_title,alert_body,'/app/integraties/logs','warning',key)
        on conflict(user_id,dedupe_key) where dedupe_key is not null do update
          set title=excluded.title,body=excluded.body,severity=excluded.severity
          where notifications.body is distinct from excluded.body;
      get diagnostics affected=row_count;total:=total+affected;
    elsif prior.user_id is not null and prior.active then
      update private.social_sync_notification_state set active=false
        where user_id=candidate.user_id and account_id=candidate.account_id;
      update public.notifications set
        title=case when not eligible then 'Socialbewaking niet actief'
          when candidate.run_status='succeeded' and candidate.last_sync_at>=prior.opened_at then 'Socialsynchronisatie hersteld'
          else 'Socialwaarschuwing vervallen' end,
        body=candidate.account_name||case when not eligible then ': automatische bewaking voor dit account is uitgeschakeld.'
          when candidate.run_status='succeeded' and candidate.last_sync_at>=prior.opened_at then ': de synchronisatie is weer actueel.'
          else ': de oorzaak is niet meer actueel; een nieuwe geslaagde synchronisatie is nog niet bevestigd.' end,
        severity='info',read_at=null
        where user_id=candidate.user_id and dedupe_key='social-sync:'||candidate.account_id::text||':'||prior.incident_id::text;
    end if;
  end loop;
  return total;
end $$;
revoke all on function public.refresh_social_sync_notifications(timestamptz) from public,anon;
grant execute on function public.refresh_social_sync_notifications(timestamptz) to authenticated,service_role;

create or replace function public.refresh_my_notifications(p_now timestamptz default now())
returns integer language plpgsql security invoker set search_path='' as $$
begin
  return public.generate_my_notifications(p_now)
    +public.generate_my_operational_notifications(p_now)
    +public.refresh_social_sync_notifications(p_now);
end $$;
