alter table public.budget_envelopes add column approved_by uuid references public.profiles(id) on delete set null, add column approved_at timestamptz;
alter table public.expenses add column approved_by uuid references public.profiles(id) on delete set null, add column approved_at timestamptz;
create table public.income_entries (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, budget_id uuid references public.budget_envelopes(id) on delete set null,
  title text not null check(char_length(title) between 2 and 180), income_type text not null default 'other' check(income_type in('sponsorship','donation','membership','merchandise','ticketing','grant','refund','other')),
  status text not null default 'expected' check(status in('expected','invoiced','received','cancelled','archived')), amount numeric(12,2) not null check(amount>=0), expected_date date, received_at date,
  payer text, invoice_number text, proof_url text, notes text, project_id uuid references public.projects(id) on delete set null, event_id uuid references public.events(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null, partner_id uuid references public.partners(id) on delete set null, merch_launch_id uuid references public.merch_launches(id) on delete set null,
  created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
alter table public.income_entries enable row level security; grant select,insert,update,delete on public.income_entries to authenticated;
create policy "members read income" on public.income_entries for select to authenticated using (private.is_active_member(organization_id));
create policy "managers create income" on public.income_entries for insert to authenticated with check (private.is_org_manager(organization_id));
create policy "managers update income" on public.income_entries for update to authenticated using (private.is_org_manager(organization_id)) with check (private.is_org_manager(organization_id));
create policy "managers delete income" on public.income_entries for delete to authenticated using (private.is_org_manager(organization_id));
create index income_entries_org_status_date_idx on public.income_entries(organization_id,status,expected_date desc) where deleted_at is null;
create index income_entries_budget_idx on public.income_entries(budget_id) where deleted_at is null;
