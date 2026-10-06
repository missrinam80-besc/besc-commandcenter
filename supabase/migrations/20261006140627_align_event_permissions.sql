-- Match the existing manageEvents capability without granting role administration.
begin;

drop policy if exists "members read assigned access role" on public.organization_access_roles;
create policy "members read assigned access role"
  on public.organization_access_roles for select to authenticated
  using (
    deleted_at is null and exists (
      select 1 from public.organization_members m
      where m.user_id = (select auth.uid()) and m.status = 'active'
        and m.organization_id = organization_access_roles.organization_id
        and m.access_role_id = organization_access_roles.id
    )
  );

-- Invoker privileges retain membership/role RLS; the caller can read their own role.
create or replace function private.can_manage_events(org_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.organization_members m
    left join public.organization_access_roles r
      on r.id = m.access_role_id and r.organization_id = m.organization_id
      and r.deleted_at is null
    where m.organization_id = org_id and m.user_id = (select auth.uid())
      and m.status = 'active'
      and (m.role in ('admin','board','member') or 'manageEvents' = any(r.capabilities))
  )
$$;
revoke all on function private.can_manage_events(uuid) from public, anon;
grant execute on function private.can_manage_events(uuid) to authenticated;

drop policy if exists "managers create events" on public.events;
drop policy if exists "managers update events" on public.events;
drop policy if exists "event managers create events" on public.events;
drop policy if exists "event managers update events" on public.events;
create policy "event managers create events" on public.events
  for insert to authenticated with check (private.can_manage_events(organization_id));
create policy "event managers update events" on public.events
  for update to authenticated using (private.can_manage_events(organization_id))
  with check (private.can_manage_events(organization_id));
-- Existing read and physical-delete policies remain unchanged.
commit;
