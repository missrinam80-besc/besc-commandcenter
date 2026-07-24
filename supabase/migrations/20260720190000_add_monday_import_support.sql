create table public.migration_source_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_system text not null,
  source_workspace text,
  source_board_id text,
  source_item_id text not null,
  target_table text not null check (target_table in ('projects','inbox_items','tasks','legacy_records')),
  target_id uuid not null,
  source_url text,
  source_payload jsonb not null default '{}'::jsonb,
  imported_by uuid not null references public.profiles(id),
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, source_system, source_item_id, target_table)
);

create table public.legacy_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  category text not null default 'Overige',
  suggested_module text,
  lifecycle text not null default 'active_or_unknown',
  source_status text,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.migration_source_links enable row level security;
alter table public.legacy_records enable row level security;

grant select, insert, update, delete on public.migration_source_links, public.legacy_records to authenticated;

create policy "members read migration links" on public.migration_source_links
for select to authenticated using (private.is_active_member(organization_id));

create policy "managers manage migration links" on public.migration_source_links
for all to authenticated using (private.is_org_manager(organization_id))
with check (private.is_org_manager(organization_id));

create policy "members read legacy records" on public.legacy_records
for select to authenticated using (private.is_active_member(organization_id));

create policy "managers manage legacy records" on public.legacy_records
for all to authenticated using (private.is_org_manager(organization_id))
with check (private.is_org_manager(organization_id));

create index migration_source_links_source_idx
  on public.migration_source_links (organization_id, source_system, source_board_id, source_item_id);

create index migration_source_links_target_idx
  on public.migration_source_links (target_table, target_id);

create index legacy_records_org_module_idx
  on public.legacy_records (organization_id, suggested_module, lifecycle)
  where deleted_at is null;

