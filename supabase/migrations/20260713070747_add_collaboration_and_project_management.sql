create table public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key(project_id,user_id)
);
create table public.project_milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null check(char_length(title) between 1 and 180),
  due_date date,
  is_done boolean not null default false,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create type public.entity_kind as enum ('task','project');
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_type public.entity_kind not null,
  entity_id uuid not null,
  body text not null check(char_length(body) between 1 and 5000),
  author_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  edited_at timestamptz
);
create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_type public.entity_kind not null,
  entity_id uuid not null,
  action text not null,
  actor_id uuid not null references public.profiles(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.project_members enable row level security;
alter table public.project_milestones enable row level security;
alter table public.comments enable row level security;
alter table public.activity_events enable row level security;
grant select,insert,update,delete on public.project_members,public.project_milestones,public.comments,public.activity_events to authenticated;

create policy "members read project teams" on public.project_members for select to authenticated using (exists(select 1 from public.projects p where p.id=project_id and private.is_active_member(p.organization_id)));
create policy "managers manage project teams" on public.project_members for all to authenticated using (exists(select 1 from public.projects p where p.id=project_id and private.is_org_manager(p.organization_id))) with check (exists(select 1 from public.projects p where p.id=project_id and private.is_org_manager(p.organization_id)));
create policy "members read milestones" on public.project_milestones for select to authenticated using (exists(select 1 from public.projects p where p.id=project_id and private.is_active_member(p.organization_id)));
create policy "managers create milestones" on public.project_milestones for insert to authenticated with check (created_by=(select auth.uid()) and exists(select 1 from public.projects p where p.id=project_id and private.is_org_manager(p.organization_id)));
create policy "managers update milestones" on public.project_milestones for update to authenticated using (exists(select 1 from public.projects p where p.id=project_id and private.is_org_manager(p.organization_id))) with check (exists(select 1 from public.projects p where p.id=project_id and private.is_org_manager(p.organization_id)));
create policy "managers delete milestones" on public.project_milestones for delete to authenticated using (exists(select 1 from public.projects p where p.id=project_id and private.is_org_manager(p.organization_id)));
create policy "members read comments" on public.comments for select to authenticated using (private.is_active_member(organization_id));
create policy "members create comments" on public.comments for insert to authenticated with check (author_id=(select auth.uid()) and private.is_active_member(organization_id));
create policy "authors update comments" on public.comments for update to authenticated using (author_id=(select auth.uid())) with check (author_id=(select auth.uid()) and private.is_active_member(organization_id));
create policy "authors or managers delete comments" on public.comments for delete to authenticated using (author_id=(select auth.uid()) or private.is_org_manager(organization_id));
create policy "members read activity" on public.activity_events for select to authenticated using (private.is_active_member(organization_id));
create policy "members create activity" on public.activity_events for insert to authenticated with check (actor_id=(select auth.uid()) and private.is_active_member(organization_id));

create index project_members_user_idx on public.project_members(user_id);
create index project_milestones_project_due_idx on public.project_milestones(project_id,due_date);
create index comments_entity_idx on public.comments(organization_id,entity_type,entity_id,created_at);
create index activity_entity_idx on public.activity_events(organization_id,entity_type,entity_id,created_at desc);
