create table if not exists public.organization_access_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  base_role public.member_role not null default 'volunteer',
  finance_role text not null default 'none' check (finance_role in ('none','submitter','approver','treasurer')),
  capabilities text[] not null default '{}',
  is_system boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, name)
);

alter table public.organization_members
  add column if not exists access_role_id uuid references public.organization_access_roles(id) on delete set null;

alter table public.organization_access_roles enable row level security;

grant select, insert, update, delete on public.organization_access_roles to authenticated;

drop policy if exists "managers read access roles" on public.organization_access_roles;
drop policy if exists "admins manage access roles" on public.organization_access_roles;

create policy "managers read access roles"
  on public.organization_access_roles
  for select
  to authenticated
  using (private.is_org_manager(organization_id));

create policy "admins manage access roles"
  on public.organization_access_roles
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.organization_members m
      where m.organization_id = organization_access_roles.organization_id
        and m.user_id = (select auth.uid())
        and m.status = 'active'
        and m.role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.organization_members m
      where m.organization_id = organization_access_roles.organization_id
        and m.user_id = (select auth.uid())
        and m.status = 'active'
        and m.role = 'admin'
    )
  );

create index if not exists organization_access_roles_org_idx
  on public.organization_access_roles(organization_id)
  where deleted_at is null;
