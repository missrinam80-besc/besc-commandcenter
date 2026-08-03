alter table public.campaign_deliverables
  add column community_person_id uuid references public.community_people(id) on delete set null;

create index campaign_deliverables_community_person_idx
  on public.campaign_deliverables(community_person_id)
  where community_person_id is not null;

alter table public.community_onboarding_items
  add column item_type text not null default 'onboarding'
    check (item_type in ('onboarding', 'coaching', 'training')),
  add column notes text;

create index community_onboarding_type_idx
  on public.community_onboarding_items(organization_id, person_id, item_type, completed);

create or replace function private.portal_streamer_dashboard(p_access_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.portal_access;
  result jsonb;
begin
  select * into a
  from public.portal_access
  where id = p_access_id
    and user_id = (select auth.uid())
    and access_type = 'streamer'
    and status = 'active';

  if a.id is null then
    raise exception 'portal_access_denied';
  end if;

  select jsonb_build_object(
    'access_id', a.id,
    'person', (
      select to_jsonb(p)
      from (
        select id, display_name, handle, status, platforms, streamteam_level, onboarding_status
        from public.community_people
        where id = a.community_person_id and deleted_at is null
      ) p
    ),
    'assignments', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.starts_at desc nulls last)
      from (
        select ca.id, ca.role_name, ca.status, ca.starts_at, ca.notes,
          p.id project_id, p.title project_title, e.id event_id, e.title event_title
        from public.community_assignments ca
        left join public.projects p on p.id = ca.project_id
        left join public.events e on e.id = ca.event_id
        where ca.organization_id = a.organization_id
          and ca.person_id = a.community_person_id
          and ca.status <> 'cancelled'
      ) x
    ), '[]'::jsonb),
    'deliverables', coalesce((
      select jsonb_agg(to_jsonb(d) order by d.due_date nulls last)
      from (
        select cd.id, cd.title, cd.status, cd.approval_status, cd.due_date, cd.notes,
          c.id campaign_id, c.title campaign_title
        from public.campaign_deliverables cd
        join public.campaigns c on c.id = cd.campaign_id
        where cd.organization_id = a.organization_id
          and cd.community_person_id = a.community_person_id
          and cd.status <> 'cancelled'
          and c.deleted_at is null
      ) d
    ), '[]'::jsonb),
    'development', coalesce((
      select jsonb_agg(to_jsonb(o) order by o.completed, o.due_date nulls last, o.created_at)
      from (
        select id, title, item_type, completed, completed_at, due_date, notes, created_at
        from public.community_onboarding_items
        where organization_id = a.organization_id
          and person_id = a.community_person_id
      ) o
    ), '[]'::jsonb),
    'kpis', coalesce((
      select jsonb_agg(to_jsonb(k) order by k.period_end desc nulls last)
      from (
        select id, name, metric, value, target, unit, period_start, period_end,
          source, collection_method, metric_definition, project_id, campaign_id, event_id
        from public.kpi_records
        where organization_id = a.organization_id
          and community_person_id = a.community_person_id
          and deleted_at is null
      ) k
    ), '[]'::jsonb)
  ) into result;

  return result;
end $$;

revoke all on function private.portal_streamer_dashboard(uuid) from public, anon;
grant execute on function private.portal_streamer_dashboard(uuid) to authenticated;
