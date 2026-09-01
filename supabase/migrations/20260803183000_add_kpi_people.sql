alter table public.kpi_records
  add column if not exists community_person_id uuid references public.community_people(id) on delete set null;

create index if not exists kpi_records_community_person_idx
  on public.kpi_records(community_person_id)
  where deleted_at is null;
