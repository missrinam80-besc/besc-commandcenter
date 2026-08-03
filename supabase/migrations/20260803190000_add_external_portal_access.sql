create table public.portal_access (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  access_type text not null check (access_type in ('sponsor', 'streamer')),
  partner_id uuid references public.partners(id) on delete cascade,
  community_person_id uuid references public.community_people(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'suspended', 'revoked')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (access_type = 'sponsor' and partner_id is not null and community_person_id is null)
    or (access_type = 'streamer' and community_person_id is not null and partner_id is null)
  )
);

alter table public.portal_access enable row level security;
grant select, insert, update, delete on public.portal_access to authenticated;
create policy "users read own portal access" on public.portal_access for select to authenticated
  using (user_id = (select auth.uid()));
create policy "managers read portal access" on public.portal_access for select to authenticated
  using (private.is_org_manager(organization_id));
create policy "managers create portal access" on public.portal_access for insert to authenticated
  with check (private.is_org_manager(organization_id) and created_by = (select auth.uid()));
create policy "managers update portal access" on public.portal_access for update to authenticated
  using (private.is_org_manager(organization_id)) with check (private.is_org_manager(organization_id));
create policy "managers delete portal access" on public.portal_access for delete to authenticated
  using (private.is_org_manager(organization_id));
create unique index portal_access_unique_sponsor on public.portal_access(user_id, partner_id) where partner_id is not null;
create unique index portal_access_unique_streamer on public.portal_access(user_id, community_person_id) where community_person_id is not null;
create index portal_access_org_status_idx on public.portal_access(organization_id, status);

create or replace function public.portal_sponsor_dashboard(p_access_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.portal_access; result jsonb;
begin
  select * into a from public.portal_access where id=p_access_id and user_id=(select auth.uid()) and access_type='sponsor' and status='active';
  if a.id is null then raise exception 'portal_access_denied'; end if;
  select jsonb_build_object(
    'access_id',a.id,
    'partner',(select to_jsonb(p) from (select id,name,status,collaboration_type from public.partners where id=a.partner_id and deleted_at is null) p),
    'campaigns',coalesce((select jsonb_agg(to_jsonb(c) order by c.start_date desc nulls last) from (select id,title,status,start_date,end_date,value,impressions,clicks,results_summary from public.campaigns where organization_id=a.organization_id and partner_id=a.partner_id and deleted_at is null and status not in('archived','cancelled')) c),'[]'::jsonb),
    'deliverables',coalesce((select jsonb_agg(to_jsonb(d) order by d.due_date nulls last) from (select d.id,d.campaign_id,d.title,d.status,d.due_date,d.approval_status from public.campaign_deliverables d join public.campaigns c on c.id=d.campaign_id where d.organization_id=a.organization_id and c.partner_id=a.partner_id) d),'[]'::jsonb),
    'kpis',coalesce((select jsonb_agg(to_jsonb(k) order by k.period_end desc nulls last) from (select id,name,metric,value,target,unit,period_start,period_end,source,collection_method,metric_definition,campaign_id from public.kpi_records where organization_id=a.organization_id and deleted_at is null and (partner_id=a.partner_id or campaign_id in(select id from public.campaigns where partner_id=a.partner_id))) k),'[]'::jsonb)
  ) into result;
  return result;
end $$;

create or replace function public.portal_streamer_dashboard(p_access_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.portal_access; result jsonb;
begin
  select * into a from public.portal_access where id=p_access_id and user_id=(select auth.uid()) and access_type='streamer' and status='active';
  if a.id is null then raise exception 'portal_access_denied'; end if;
  select jsonb_build_object(
    'access_id',a.id,
    'person',(select to_jsonb(p) from (select id,display_name,handle,status,platforms,streamteam_level,onboarding_status from public.community_people where id=a.community_person_id and deleted_at is null) p),
    'assignments',coalesce((select jsonb_agg(to_jsonb(x) order by x.starts_at desc nulls last) from (select ca.id,ca.role_name,ca.status,ca.starts_at,ca.notes,p.id project_id,p.title project_title,e.id event_id,e.title event_title from public.community_assignments ca left join public.projects p on p.id=ca.project_id left join public.events e on e.id=ca.event_id where ca.organization_id=a.organization_id and ca.person_id=a.community_person_id and ca.status<>'cancelled') x),'[]'::jsonb),
    'kpis',coalesce((select jsonb_agg(to_jsonb(k) order by k.period_end desc nulls last) from (select id,name,metric,value,target,unit,period_start,period_end,source,collection_method,metric_definition,project_id,campaign_id,event_id from public.kpi_records where organization_id=a.organization_id and community_person_id=a.community_person_id and deleted_at is null) k),'[]'::jsonb)
  ) into result;
  return result;
end $$;

revoke all on function public.portal_sponsor_dashboard(uuid) from public;
revoke all on function public.portal_streamer_dashboard(uuid) from public;
grant execute on function public.portal_sponsor_dashboard(uuid) to authenticated;
grant execute on function public.portal_streamer_dashboard(uuid) to authenticated;
