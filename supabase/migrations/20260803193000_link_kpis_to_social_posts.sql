alter table public.kpi_records
  add column if not exists social_post_id uuid references public.social_posts(id) on delete set null;
create index if not exists kpi_records_social_post_idx on public.kpi_records(social_post_id) where deleted_at is null;
