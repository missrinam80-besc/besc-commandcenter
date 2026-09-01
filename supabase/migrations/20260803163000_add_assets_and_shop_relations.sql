create table public.assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 180),
  asset_type text not null default 'equipment' check (asset_type in ('equipment','computer','streaming','furniture','software','vehicle','other')),
  status text not null default 'active' check (status in ('planned','active','maintenance','loaned','retired','lost','archived')),
  serial_number text,
  owner_person_id uuid references public.community_people(id) on delete set null,
  location text,
  acquired_date date,
  purchase_value numeric(12,2) check (purchase_value is null or purchase_value >= 0),
  current_value numeric(12,2) check (current_value is null or current_value >= 0),
  supplier_id uuid references public.partners(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  event_id uuid references public.events(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  document_url text,
  notes text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.assets enable row level security;
grant select, insert, update, delete on public.assets to authenticated;
create policy "active members read assets" on public.assets for select to authenticated using (private.is_active_member(organization_id));
create policy "managers create assets" on public.assets for insert to authenticated with check (private.is_org_manager(organization_id) and created_by = (select auth.uid()));
create policy "managers update assets" on public.assets for update to authenticated using (private.is_org_manager(organization_id)) with check (private.is_org_manager(organization_id));
create policy "managers delete assets" on public.assets for delete to authenticated using (private.is_org_manager(organization_id));
create index assets_org_status_type_idx on public.assets(organization_id,status,asset_type) where deleted_at is null;
create index assets_owner_idx on public.assets(owner_person_id) where deleted_at is null;
create index assets_supplier_idx on public.assets(supplier_id) where deleted_at is null;

alter table public.shop_products
  add column product_family text not null default 'stream_graphics' check (product_family in ('stream_graphics','merchandise')),
  add column supplier_id uuid references public.partners(id) on delete set null,
  add column producer_id uuid references public.partners(id) on delete set null,
  add column project_id uuid references public.projects(id) on delete set null,
  add column campaign_id uuid references public.campaigns(id) on delete set null;

alter table public.merch_launches
  add column project_id uuid references public.projects(id) on delete set null,
  add column campaign_id uuid references public.campaigns(id) on delete set null,
  add column partner_id uuid references public.partners(id) on delete set null;

create index shop_products_supplier_idx on public.shop_products(supplier_id) where deleted_at is null;
create index shop_products_producer_idx on public.shop_products(producer_id) where deleted_at is null;
create index merch_launches_project_campaign_idx on public.merch_launches(project_id,campaign_id) where deleted_at is null;
