create index financial_documents_income_idx
on public.financial_documents(income_id)
where deleted_at is null;

create index financial_documents_budget_idx
on public.financial_documents(budget_id)
where deleted_at is null;

create index financial_documents_created_by_idx
on public.financial_documents(created_by);

create index financial_documents_verified_by_idx
on public.financial_documents(verified_by)
where verified_by is not null;
