create extension if not exists pgcrypto;
create schema if not exists private;

create type public.member_role as enum ('admin','board','member','volunteer');
create type public.member_status as enum ('pending','active','suspended');
create type public.inbox_status as enum ('new','reviewing','waiting','processed','rejected','archived');
create type public.task_status as enum ('todo','doing','waiting','review','done','cancelled');
create type public.project_status as enum ('idea','planned','active','blocked','done','archived');
create type public.priority_level as enum ('low','normal','high','urgent');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);
insert into public.organizations(name,slug) values ('BESC vzw','besc') on conflict(slug) do nothing;
create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.member_role not null default 'volunteer',
  status public.member_status not null default 'pending',
  joined_at timestamptz not null default now(),
  primary key (organization_id,user_id)
);
create table public.projects (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  title text not null, description text, status public.project_status not null default 'idea', priority public.priority_level not null default 'normal',
  owner_id uuid references public.profiles(id), start_date date, due_date date, drive_url text,
  created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table public.inbox_items (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  title text not null, description text, source text not null default 'manual', status public.inbox_status not null default 'new', priority public.priority_level not null default 'normal',
  reviewer_id uuid references public.profiles(id), converted_project_id uuid references public.projects(id),
  created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table public.tasks (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), project_id uuid references public.projects(id) on delete set null,
  source_inbox_id uuid references public.inbox_items(id) on delete set null, title text not null, description text,
  status public.task_status not null default 'todo', priority public.priority_level not null default 'normal', due_at timestamptz,
  created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), completed_at timestamptz, deleted_at timestamptz
);
create table public.task_assignees (task_id uuid references public.tasks(id) on delete cascade, user_id uuid references public.profiles(id) on delete cascade, primary key(task_id,user_id));

alter table public.profiles enable row level security; alter table public.organizations enable row level security; alter table public.organization_members enable row level security;
alter table public.projects enable row level security; alter table public.inbox_items enable row level security; alter table public.tasks enable row level security; alter table public.task_assignees enable row level security;
grant select,insert,update,delete on public.profiles,public.organizations,public.organization_members,public.projects,public.inbox_items,public.tasks,public.task_assignees to authenticated;

create function private.is_active_member(org_id uuid) returns boolean language sql stable security definer set search_path='' as $$
  select (select auth.uid()) is not null and exists(select 1 from public.organization_members m where m.organization_id=org_id and m.user_id=(select auth.uid()) and m.status='active')
$$;
create function private.is_org_manager(org_id uuid) returns boolean language sql stable security definer set search_path='' as $$
  select (select auth.uid()) is not null and exists(select 1 from public.organization_members m where m.organization_id=org_id and m.user_id=(select auth.uid()) and m.status='active' and m.role in ('admin','board'))
$$;
revoke all on function private.is_active_member(uuid), private.is_org_manager(uuid) from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.is_active_member(uuid), private.is_org_manager(uuid) to authenticated;

create policy "own profile read" on public.profiles for select to authenticated using (id=(select auth.uid()));
create policy "own profile update" on public.profiles for update to authenticated using (id=(select auth.uid())) with check (id=(select auth.uid()));
create policy "member organization read" on public.organizations for select to authenticated using (private.is_active_member(id));
create policy "membership self or manager read" on public.organization_members for select to authenticated using (user_id=(select auth.uid()) or private.is_org_manager(organization_id));
create policy "manager membership update" on public.organization_members for update to authenticated using (private.is_org_manager(organization_id)) with check (private.is_org_manager(organization_id));
create policy "active member project read" on public.projects for select to authenticated using (private.is_active_member(organization_id));
create policy "manager project write" on public.projects for all to authenticated using (private.is_org_manager(organization_id)) with check (private.is_org_manager(organization_id));
create policy "active member task read" on public.tasks for select to authenticated using (private.is_active_member(organization_id));
create policy "active member task insert" on public.tasks for insert to authenticated with check (private.is_active_member(organization_id) and created_by=(select auth.uid()));
create policy "active member task update" on public.tasks for update to authenticated using (private.is_active_member(organization_id)) with check (private.is_active_member(organization_id));
create policy "manager inbox access" on public.inbox_items for all to authenticated using (private.is_org_manager(organization_id)) with check (private.is_org_manager(organization_id));
create policy "member assignee read" on public.task_assignees for select to authenticated using (exists(select 1 from public.tasks t where t.id=task_id and private.is_active_member(t.organization_id)));

create index tasks_org_status_due_idx on public.tasks(organization_id,status,due_at) where deleted_at is null;
create index projects_org_status_idx on public.projects(organization_id,status) where deleted_at is null;
create index inbox_org_status_idx on public.inbox_items(organization_id,status) where deleted_at is null;

create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,display_name,avatar_url) values(new.id,coalesce(new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name',split_part(new.email,'@',1)),new.raw_user_meta_data->>'avatar_url') on conflict(id) do nothing;
  insert into public.organization_members(organization_id,user_id,role,status)
    select id,new.id,'volunteer','pending' from public.organizations where slug='besc'
    on conflict(organization_id,user_id) do nothing;
  return new;
end; $$;
revoke all on function public.handle_new_user() from public,anon,authenticated;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
