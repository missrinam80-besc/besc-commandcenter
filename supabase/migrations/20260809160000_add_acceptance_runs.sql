create table public.acceptance_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 180),
  status text not null default 'in_progress' check (status in ('in_progress','passed','failed','accepted','archived')),
  environment text not null default 'preview' check (environment in ('local','preview','production')),
  commit_sha text,
  notes text,
  started_by uuid not null references public.profiles(id),
  completed_by uuid references public.profiles(id) on delete set null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.acceptance_check_results (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid not null references public.acceptance_runs(id) on delete cascade,
  check_key text not null,
  category text not null,
  title text not null,
  status text not null default 'pending' check (status in ('pending','passed','failed','blocked','not_applicable')),
  evidence text,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, check_key)
);

alter table public.acceptance_runs enable row level security;
alter table public.acceptance_check_results enable row level security;

grant select, insert, update on public.acceptance_runs to authenticated;
grant select, insert, update on public.acceptance_check_results to authenticated;

create policy "organization managers read acceptance runs"
on public.acceptance_runs for select to authenticated
using (private.is_org_manager(organization_id));

create policy "organization managers create acceptance runs"
on public.acceptance_runs for insert to authenticated
with check (started_by = (select auth.uid()) and private.is_org_manager(organization_id));

create policy "organization managers update acceptance runs"
on public.acceptance_runs for update to authenticated
using (private.is_org_manager(organization_id))
with check (private.is_org_manager(organization_id));

create policy "organization managers read acceptance checks"
on public.acceptance_check_results for select to authenticated
using (private.is_org_manager(organization_id));

create policy "organization managers create acceptance checks"
on public.acceptance_check_results for insert to authenticated
with check (private.is_org_manager(organization_id));

create policy "organization managers update acceptance checks"
on public.acceptance_check_results for update to authenticated
using (private.is_org_manager(organization_id))
with check (private.is_org_manager(organization_id));

create index acceptance_runs_org_started_idx
on public.acceptance_runs(organization_id, started_at desc);

create index acceptance_check_results_run_idx
on public.acceptance_check_results(run_id, category, status);
