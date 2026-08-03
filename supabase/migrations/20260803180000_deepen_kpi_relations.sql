alter table public.kpi_records
  add column if not exists task_id uuid references public.tasks(id) on delete set null,
  add column if not exists metric_definition text,
  add column if not exists collection_method text not null default 'manual'
    check (collection_method in ('manual', 'imported', 'api'));

create index if not exists kpi_records_task_idx
  on public.kpi_records(task_id)
  where deleted_at is null;
