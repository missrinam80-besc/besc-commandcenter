alter table public.expenses
  add column claimant_name text,
  add column payment_reference text,
  add column declaration_url text;

create table public.financial_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  document_type text not null check(document_type in('invoice','receipt','credit_note','bank_statement','contract','subsidy','declaration','other')),
  title text not null check(char_length(title) between 2 and 180),
  document_date date,
  fiscal_year integer not null check(fiscal_year between 2000 and 2200),
  status text not null default 'linked' check(status in('missing','linked','verified','archived')),
  drive_url text,
  document_number text,
  counterparty text,
  amount numeric(12,2) check(amount is null or amount >= 0),
  expense_id uuid references public.expenses(id) on delete set null,
  income_id uuid references public.income_entries(id) on delete set null,
  budget_id uuid references public.budget_envelopes(id) on delete set null,
  notes text,
  created_by uuid not null references public.profiles(id),
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check(status = 'missing' or drive_url is not null)
);

alter table public.financial_documents enable row level security;
grant select, insert, update, delete on public.financial_documents to authenticated;

create policy "finance managers read documents"
on public.financial_documents for select to authenticated
using(private.can_manage_finance(organization_id));

create policy "finance managers create documents"
on public.financial_documents for insert to authenticated
with check(private.can_manage_finance(organization_id) and created_by = (select auth.uid()));

create policy "finance managers update documents"
on public.financial_documents for update to authenticated
using(private.can_manage_finance(organization_id))
with check(private.can_manage_finance(organization_id));

create policy "finance managers delete documents"
on public.financial_documents for delete to authenticated
using(private.can_manage_finance(organization_id));

create index financial_documents_org_year_status_idx
on public.financial_documents(organization_id, fiscal_year, status)
where deleted_at is null;

create index financial_documents_relations_idx
on public.financial_documents(expense_id, income_id, budget_id)
where deleted_at is null;
