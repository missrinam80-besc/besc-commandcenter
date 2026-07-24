alter table public.organization_members add column finance_role text not null default 'none' check(finance_role in('none','submitter','approver','treasurer'));
alter table public.organizations add column finance_drive_url text;
alter table public.expenses add constraint expenses_paid_requires_proof check(status not in('paid','reimbursed') or proof_url is not null);
create or replace function private.can_manage_finance(org_id uuid) returns boolean language sql stable security definer set search_path='' as $$
  select (select auth.uid()) is not null and exists(select 1 from public.organization_members m where m.organization_id=org_id and m.user_id=(select auth.uid()) and m.status='active' and (m.role in('admin','board') or m.finance_role in('approver','treasurer')))
$$;
revoke all on function private.can_manage_finance(uuid) from public,anon;grant execute on function private.can_manage_finance(uuid) to authenticated;

create table public.financial_audit_log (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_type text not null check(entity_type in('budget','expense','income')), entity_id uuid not null, action text not null,
  previous_status text, new_status text, actor_id uuid references public.profiles(id) on delete set null, snapshot jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
alter table public.financial_audit_log enable row level security;grant select on public.financial_audit_log to authenticated;
create policy "finance managers read audit" on public.financial_audit_log for select to authenticated using(private.can_manage_finance(organization_id));
create index financial_audit_org_entity_idx on public.financial_audit_log(organization_id,entity_type,entity_id,created_at desc);
create or replace function private.log_financial_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.financial_audit_log(organization_id,entity_type,entity_id,action,previous_status,new_status,actor_id,snapshot)
  values(new.organization_id,case tg_table_name when 'budget_envelopes' then 'budget' when 'expenses' then 'expense' else 'income' end,new.id,case when tg_op='INSERT' then 'created' when old.status is distinct from new.status then 'status_changed' else 'updated' end,case when tg_op='UPDATE' then old.status end,new.status,(select auth.uid()),to_jsonb(new)-'deleted_at');
  return new;
end $$;
revoke all on function private.log_financial_change() from public,anon,authenticated;
create trigger audit_budget_change after insert or update on public.budget_envelopes for each row execute function private.log_financial_change();
create trigger audit_expense_change after insert or update on public.expenses for each row execute function private.log_financial_change();
create trigger audit_income_change after insert or update on public.income_entries for each row execute function private.log_financial_change();

drop policy "managers create budgets" on public.budget_envelopes;drop policy "managers update budgets" on public.budget_envelopes;drop policy "managers delete budgets" on public.budget_envelopes;
create policy "finance managers create budgets" on public.budget_envelopes for insert to authenticated with check(private.can_manage_finance(organization_id));
create policy "finance managers update budgets" on public.budget_envelopes for update to authenticated using(private.can_manage_finance(organization_id)) with check(private.can_manage_finance(organization_id));
create policy "finance managers delete budgets" on public.budget_envelopes for delete to authenticated using(private.can_manage_finance(organization_id));
drop policy "managers update expenses" on public.expenses;drop policy "managers delete expenses" on public.expenses;
create policy "finance managers update expenses" on public.expenses for update to authenticated using(private.can_manage_finance(organization_id)) with check(private.can_manage_finance(organization_id));
create policy "finance managers delete expenses" on public.expenses for delete to authenticated using(private.can_manage_finance(organization_id));
drop policy "managers create income" on public.income_entries;drop policy "managers update income" on public.income_entries;drop policy "managers delete income" on public.income_entries;
create policy "finance managers create income" on public.income_entries for insert to authenticated with check(private.can_manage_finance(organization_id));
create policy "finance managers update income" on public.income_entries for update to authenticated using(private.can_manage_finance(organization_id)) with check(private.can_manage_finance(organization_id));
create policy "finance managers delete income" on public.income_entries for delete to authenticated using(private.can_manage_finance(organization_id));
