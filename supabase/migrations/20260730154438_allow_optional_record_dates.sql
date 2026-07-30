alter table public.governance_mandates
  alter column start_date drop not null;

alter table public.governance_mandates
  drop constraint if exists governance_mandates_check;

alter table public.governance_mandates
  add constraint governance_mandates_date_order_check
  check (start_date is null or end_date is null or end_date >= start_date);

alter table public.compliance_deadlines
  alter column due_date drop not null;

alter table public.kpi_records
  alter column period_start drop not null,
  alter column period_end drop not null;

alter table public.kpi_records
  drop constraint if exists kpi_records_check;

alter table public.kpi_records
  add constraint kpi_records_period_order_check
  check (period_start is null or period_end is null or period_end >= period_start);
