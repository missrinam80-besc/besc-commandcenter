begin;

-- Additional restrictive policy: existing organization/creator rules still apply.
-- Manager updates and historical records are unchanged.
drop policy if exists "expense submission cannot approve or pay" on public.expenses;
create policy "expense submission cannot approve or pay"
on public.expenses as restrictive for insert to authenticated
with check (
  private.can_manage_finance(organization_id)
  or (
    status in ('planned', 'requested', 'reimbursement_due')
    and submitted_by = (select auth.uid())
    and approved_by is null
    and approved_at is null
    and paid_at is null
    and nullif(payment_reference, '') is null
  )
);

commit;
