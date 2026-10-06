-- Match the existing manageContent capability; assigned-role SELECT policy was added by the Event migration.
begin;
create or replace function private.can_manage_content(org_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.organization_members m
    left join public.organization_access_roles r
      on r.id = m.access_role_id and r.organization_id = m.organization_id
      and r.deleted_at is null
    where m.organization_id = org_id and m.user_id = (select auth.uid())
      and m.status = 'active'
      and (m.role in ('admin','board','member') or 'manageContent' = any(r.capabilities))
  )
$$;
revoke all on function private.can_manage_content(uuid) from public, anon;
grant execute on function private.can_manage_content(uuid) to authenticated;

drop policy if exists "managers create content" on public.content_items;
drop policy if exists "managers update content" on public.content_items;
drop policy if exists "content managers create content" on public.content_items;
drop policy if exists "content managers update content" on public.content_items;
create policy "content managers create content" on public.content_items
  for insert to authenticated with check (private.can_manage_content(organization_id));
create policy "content managers update content" on public.content_items
  for update to authenticated using (private.can_manage_content(organization_id))
  with check (private.can_manage_content(organization_id));
-- Preserve SELECT, physical DELETE, membership/role policies and audit triggers.
commit;
