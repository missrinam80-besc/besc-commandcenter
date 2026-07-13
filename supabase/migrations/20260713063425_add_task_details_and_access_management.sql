create table public.task_checklist_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 240),
  is_done boolean not null default false,
  position integer not null default 0,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.task_checklist_items enable row level security;
grant select,insert,update,delete on public.task_checklist_items to authenticated;

create policy "active members read checklists" on public.task_checklist_items
for select to authenticated using (
  exists(select 1 from public.tasks t where t.id=task_id and private.is_active_member(t.organization_id))
);
create policy "active members create checklists" on public.task_checklist_items
for insert to authenticated with check (
  created_by=(select auth.uid()) and exists(select 1 from public.tasks t where t.id=task_id and private.is_active_member(t.organization_id))
);
create policy "active members update checklists" on public.task_checklist_items
for update to authenticated using (
  exists(select 1 from public.tasks t where t.id=task_id and private.is_active_member(t.organization_id))
) with check (
  exists(select 1 from public.tasks t where t.id=task_id and private.is_active_member(t.organization_id))
);
create policy "managers delete checklists" on public.task_checklist_items
for delete to authenticated using (
  exists(select 1 from public.tasks t where t.id=task_id and private.is_org_manager(t.organization_id))
);

create policy "managers read organization profiles" on public.profiles
for select to authenticated using (
  exists(select 1 from public.organization_members viewer
    join public.organization_members subject on subject.organization_id=viewer.organization_id
    where viewer.user_id=(select auth.uid()) and viewer.status='active' and viewer.role in ('admin','board') and subject.user_id=profiles.id)
);

create policy "active members read organization profiles" on public.profiles
for select to authenticated using (
  exists(select 1 from public.organization_members viewer
    join public.organization_members subject on subject.organization_id=viewer.organization_id
    where viewer.user_id=(select auth.uid()) and viewer.status='active' and subject.user_id=profiles.id)
);

create policy "active members assign tasks" on public.task_assignees
for insert to authenticated with check (
  exists(select 1 from public.tasks t where t.id=task_id and private.is_active_member(t.organization_id))
);
create policy "active members unassign tasks" on public.task_assignees
for delete to authenticated using (
  exists(select 1 from public.tasks t where t.id=task_id and private.is_active_member(t.organization_id))
);

create index task_checklist_task_position_idx on public.task_checklist_items(task_id,position);
