create table public.budget_envelopes (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check(char_length(name) between 2 and 180), category text not null default 'other' check(category in('event','content','equipment','software','marketing','merchandise','transport','venue','administration','giveaway','other')),
  status text not null default 'draft' check(status in('draft','requested','approved','active','closed','rejected','archived')), planned_amount numeric(12,2) not null default 0 check(planned_amount>=0),
  start_date date, end_date date, notes text, project_id uuid references public.projects(id) on delete set null, event_id uuid references public.events(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null, partner_id uuid references public.partners(id) on delete set null, merch_launch_id uuid references public.merch_launches(id) on delete set null,
  owner_id uuid references public.profiles(id) on delete set null, created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  check(end_date is null or start_date is null or end_date>=start_date)
);
create table public.expenses (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, budget_id uuid references public.budget_envelopes(id) on delete set null,
  title text not null check(char_length(title) between 2 and 180), category text not null default 'other' check(category in('event','content','equipment','software','marketing','merchandise','transport','venue','administration','giveaway','other')),
  status text not null default 'planned' check(status in('planned','requested','approved','paid','reimbursement_due','reimbursed','rejected','cancelled','archived')), amount numeric(12,2) not null check(amount>=0),
  expense_date date, paid_at date, supplier text, invoice_number text, proof_url text, notes text, project_id uuid references public.projects(id) on delete set null, event_id uuid references public.events(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null, partner_id uuid references public.partners(id) on delete set null, merch_launch_id uuid references public.merch_launches(id) on delete set null,
  submitted_by uuid references public.profiles(id) on delete set null, created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
alter table public.budget_envelopes enable row level security; alter table public.expenses enable row level security;
grant select,insert,update,delete on public.budget_envelopes,public.expenses to authenticated;
create policy "members read budgets" on public.budget_envelopes for select to authenticated using (private.is_active_member(organization_id));
create policy "managers create budgets" on public.budget_envelopes for insert to authenticated with check (private.is_org_manager(organization_id));
create policy "managers update budgets" on public.budget_envelopes for update to authenticated using (private.is_org_manager(organization_id)) with check (private.is_org_manager(organization_id));
create policy "managers delete budgets" on public.budget_envelopes for delete to authenticated using (private.is_org_manager(organization_id));
create policy "members read expenses" on public.expenses for select to authenticated using (private.is_active_member(organization_id));
create policy "members create expenses" on public.expenses for insert to authenticated with check (private.is_active_member(organization_id) and created_by=(select auth.uid()));
create policy "managers update expenses" on public.expenses for update to authenticated using (private.is_org_manager(organization_id)) with check (private.is_org_manager(organization_id));
create policy "managers delete expenses" on public.expenses for delete to authenticated using (private.is_org_manager(organization_id));
create index budget_envelopes_org_status_idx on public.budget_envelopes(organization_id,status) where deleted_at is null;
create index budget_envelopes_relations_idx on public.budget_envelopes(organization_id,project_id,event_id,campaign_id) where deleted_at is null;
create index expenses_org_status_date_idx on public.expenses(organization_id,status,expense_date desc) where deleted_at is null;
create index expenses_budget_idx on public.expenses(budget_id) where deleted_at is null;
create index expenses_relations_idx on public.expenses(organization_id,project_id,event_id,campaign_id) where deleted_at is null;

create or replace function public.convert_meeting_action_to_task(action_id uuid, task_priority public.priority_level default 'normal', task_due_at timestamptz default null, task_project_id uuid default null)
returns uuid language plpgsql security invoker set search_path='' as $$
declare action_row public.meeting_action_items%rowtype; new_task_id uuid;
begin
  select * into action_row from public.meeting_action_items where id=action_id for update;
  if action_row.id is null or not private.is_active_member(action_row.organization_id) then raise exception 'action_not_found'; end if;
  if action_row.task_id is not null then return action_row.task_id; end if;
  if task_project_id is not null and not exists(select 1 from public.projects p where p.id=task_project_id and p.organization_id=action_row.organization_id and p.deleted_at is null) then raise exception 'invalid_project'; end if;
  insert into public.tasks(organization_id,project_id,title,description,status,priority,due_at,created_by)
  values(action_row.organization_id,task_project_id,action_row.title,concat('Actiepunt uit vergadering. Verantwoordelijke: ',coalesce(action_row.assignee_text,'nog niet toegewezen')),'todo',task_priority,task_due_at,(select auth.uid())) returning id into new_task_id;
  update public.meeting_action_items set task_id=new_task_id,updated_at=now() where id=action_row.id;
  return new_task_id;
end $$;
revoke all on function public.convert_meeting_action_to_task(uuid,public.priority_level,timestamptz,uuid) from public,anon;
grant execute on function public.convert_meeting_action_to_task(uuid,public.priority_level,timestamptz,uuid) to authenticated;
