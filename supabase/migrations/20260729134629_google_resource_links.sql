create table public.google_resource_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_type text not null check (entity_type in ('project','event','meeting','partner','campaign')),
  entity_id uuid not null,
  resource_type text not null check (resource_type in ('folder','document','calendar_event')),
  google_id text not null,
  name text not null,
  mime_type text,
  web_url text not null,
  drive_id text,
  parent_id text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, entity_type, entity_id, resource_type)
);

alter table public.google_resource_links enable row level security;
grant select, insert, update, delete on public.google_resource_links to authenticated;

create policy "members read google resource links"
on public.google_resource_links for select to authenticated
using (private.is_active_member(organization_id));

create policy "managers create google resource links"
on public.google_resource_links for insert to authenticated
with check (private.is_org_manager(organization_id) and created_by = (select auth.uid()));

create policy "managers update google resource links"
on public.google_resource_links for update to authenticated
using (private.is_org_manager(organization_id))
with check (private.is_org_manager(organization_id));

create policy "managers delete google resource links"
on public.google_resource_links for delete to authenticated
using (private.is_org_manager(organization_id));

create index google_resource_links_entity_idx
on public.google_resource_links (organization_id, entity_type, entity_id);
