-- Keep internal role codes and existing assignments. Add the two-function combination.
alter table public.organization_members drop constraint if exists organization_members_finance_role_check;
alter table public.organization_members add constraint organization_members_finance_role_check
  check (finance_role in ('none','submitter','approver','treasurer','approver_treasurer'));
alter table public.organization_access_roles drop constraint if exists organization_access_roles_finance_role_check;
alter table public.organization_access_roles add constraint organization_access_roles_finance_role_check
  check (finance_role in ('none','submitter','approver','treasurer','approver_treasurer'));

create or replace function private.is_org_admin(org_id uuid)
returns boolean language sql stable security invoker set search_path='' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.organization_members m where m.organization_id=org_id
      and m.user_id=(select auth.uid()) and m.status='active' and m.role='admin'
  )
$$;
revoke all on function private.is_org_admin(uuid) from public,anon;
grant execute on function private.is_org_admin(uuid) to authenticated;

-- Backend policies match the admin-only technical routes and actions.
drop policy if exists "manager membership update" on public.organization_members;
drop policy if exists "admins update memberships" on public.organization_members;
create policy "admins update memberships" on public.organization_members for update to authenticated
  using (private.is_org_admin(organization_id)) with check (private.is_org_admin(organization_id));
drop policy if exists "managers read access roles" on public.organization_access_roles;
drop policy if exists "admins read access roles" on public.organization_access_roles;
create policy "admins read access roles" on public.organization_access_roles for select to authenticated
  using (private.is_org_admin(organization_id));

-- Own portal access remains readable. Assigning access is exclusively admin work.
drop policy if exists "managers read portal access" on public.portal_access;
drop policy if exists "managers create portal access" on public.portal_access;
drop policy if exists "managers update portal access" on public.portal_access;
drop policy if exists "managers delete portal access" on public.portal_access;
drop policy if exists "admins manage portal access" on public.portal_access;
create policy "admins manage portal access" on public.portal_access for all to authenticated
  using (private.is_org_admin(organization_id)) with check (private.is_org_admin(organization_id));

do $$ declare t text; p record; begin
  foreach t in array array['integration_connections','social_accounts','social_sync_runs'] loop
    for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy %I on public.%I',p.policyname,t);
    end loop;
    execute format('create policy "admins manage technical integration" on public.%I for all to authenticated using(private.is_org_admin(organization_id)) with check(private.is_org_admin(organization_id))',t);
  end loop;
end $$;

-- A board role alone grants oversight, not implicit financial administration.
create or replace function private.can_manage_finance(org_id uuid)
returns boolean language sql stable security invoker set search_path='' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.organization_members m where m.organization_id=org_id
      and m.user_id=(select auth.uid()) and m.status='active'
      and (m.role='admin' or m.finance_role in ('approver','treasurer','approver_treasurer'))
  )
$$;
revoke all on function private.can_manage_finance(uuid) from public,anon;
grant execute on function private.can_manage_finance(uuid) to authenticated;

create or replace function private.can_review_approval(org_id uuid, entity text)
returns boolean language sql stable security invoker set search_path='' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.organization_members m where m.organization_id=org_id
      and m.user_id=(select auth.uid()) and m.status='active'
      and (m.role='admin' or (m.role='board' and m.finance_role in ('approver','approver_treasurer'))
        or (entity='expense' and m.finance_role in ('approver','treasurer','approver_treasurer')))
  )
$$;
revoke all on function private.can_review_approval(uuid,text) from public,anon;
grant execute on function private.can_review_approval(uuid,text) to authenticated;
drop policy if exists "authorized reviewers decide approval requests" on public.approval_requests;
create policy "authorized reviewers decide approval requests" on public.approval_requests for update to authenticated
  using (private.can_review_approval(organization_id,entity_type))
  with check (private.can_review_approval(organization_id,entity_type));

-- New financial functions belong to board/admin. Preserve unchanged legacy assignments.
create or replace function private.guard_board_function_assignment()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.finance_role in ('approver','treasurer','approver_treasurer') and new.role not in ('admin','board') then
    if tg_op='INSERT' then raise exception 'board_function_requires_board'; end if;
    if new.role is distinct from old.role or new.finance_role is distinct from old.finance_role then
      raise exception 'board_function_requires_board';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.guard_board_function_assignment() from public,anon,authenticated;
drop trigger if exists guard_board_function_assignment on public.organization_members;
create trigger guard_board_function_assignment before insert or update on public.organization_members
  for each row execute function private.guard_board_function_assignment();
