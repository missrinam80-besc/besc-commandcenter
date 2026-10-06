-- Match existing manageProjects. Assigned-role read policy comes from the Event migration.
begin;
create or replace function private.can_manage_projects(org_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.organization_members m
    left join public.organization_access_roles r
      on r.id = m.access_role_id and r.organization_id = m.organization_id
      and r.deleted_at is null
    where m.organization_id = org_id and m.user_id = (select auth.uid())
      and m.status = 'active'
      and (m.role in ('admin','board','member') or 'manageProjects' = any(r.capabilities))
  )
$$;
revoke all on function private.can_manage_projects(uuid) from public, anon;
grant execute on function private.can_manage_projects(uuid) to authenticated;


create or replace function private.can_manage_project(project uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists(select 1 from public.projects p where p.id=project and p.deleted_at is null
    and private.can_manage_projects(p.organization_id))
$$;
revoke all on function private.can_manage_project(uuid) from public, anon;
grant execute on function private.can_manage_project(uuid) to authenticated;

-- Split the old ALL policy so physical project DELETE stays manager-only.
drop policy if exists "manager project write" on public.projects;
drop policy if exists "project managers create projects" on public.projects;
drop policy if exists "project managers update projects" on public.projects;
drop policy if exists "managers physically delete projects" on public.projects;
create policy "project managers create projects" on public.projects for insert to authenticated
  with check(private.can_manage_projects(organization_id) and deleted_at is null);
create policy "project managers update projects" on public.projects for update to authenticated
  using(private.can_manage_projects(organization_id) and deleted_at is null)
  with check(private.can_manage_projects(organization_id));
create policy "managers physically delete projects" on public.projects for delete to authenticated
  using(private.is_org_manager(organization_id));

-- Team membership never grants organization roles, credentials or capabilities.
drop policy if exists "managers manage project teams" on public.project_members;
drop policy if exists "project managers add team members" on public.project_members;
drop policy if exists "project managers update team members" on public.project_members;
drop policy if exists "project managers remove team members" on public.project_members;
create policy "project managers add team members" on public.project_members for insert to authenticated
  with check(private.can_manage_project(project_id) and exists(
    select 1 from public.projects p join public.organization_members m on m.organization_id=p.organization_id
    where p.id=project_id and m.user_id=project_members.user_id and m.status='active'));
create policy "project managers update team members" on public.project_members for update to authenticated
  using(private.can_manage_project(project_id))
  with check(private.can_manage_project(project_id) and exists(
    select 1 from public.projects p join public.organization_members m on m.organization_id=p.organization_id
    where p.id=project_id and m.user_id=project_members.user_id and m.status='active'));
create policy "project managers remove team members" on public.project_members for delete to authenticated
  using(private.can_manage_project(project_id));

drop policy if exists "managers create milestones" on public.project_milestones;
drop policy if exists "managers update milestones" on public.project_milestones;
drop policy if exists "managers delete milestones" on public.project_milestones;
create policy "managers create milestones" on public.project_milestones for insert to authenticated
  with check(created_by=(select auth.uid()) and private.can_manage_project(project_id));
create policy "managers update milestones" on public.project_milestones for update to authenticated
  using(private.can_manage_project(project_id)) with check(private.can_manage_project(project_id));
create policy "managers delete milestones" on public.project_milestones for delete to authenticated
  using(private.can_manage_project(project_id));
-- Keep existing read, organization membership, access-role and audit policies unchanged.
commit;
