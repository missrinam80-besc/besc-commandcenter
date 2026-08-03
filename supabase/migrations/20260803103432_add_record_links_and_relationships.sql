create table public.record_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_type text not null check (entity_type in (
    'project', 'event', 'campaign', 'content', 'partner', 'community_person',
    'social_post', 'meeting', 'task', 'shop_product', 'merch_launch',
    'administration', 'finance'
  )),
  entity_id uuid not null,
  label text not null check (char_length(trim(label)) between 1 and 120),
  url text not null check (url ~ '^https?://'),
  link_type text not null default 'reference' check (link_type in (
    'reference', 'publication', 'briefing', 'document', 'website', 'other'
  )),
  position integer not null default 0 check (position >= 0),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, entity_type, entity_id, url)
);

create table public.record_relationships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_type text not null check (source_type in (
    'project', 'event', 'campaign', 'content', 'partner', 'community_person',
    'social_post', 'meeting', 'task', 'shop_product', 'merch_launch',
    'administration', 'finance'
  )),
  source_id uuid not null,
  target_type text not null check (target_type in (
    'project', 'event', 'campaign', 'content', 'partner', 'community_person',
    'social_post', 'meeting', 'task', 'shop_product', 'merch_launch',
    'administration', 'finance'
  )),
  target_id uuid not null,
  relationship_type text not null default 'related' check (
    char_length(trim(relationship_type)) between 1 and 80
  ),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check (source_type <> target_type or source_id <> target_id),
  unique (organization_id, source_type, source_id, target_type, target_id, relationship_type)
);

alter table public.record_links enable row level security;
alter table public.record_relationships enable row level security;

grant select, insert, update, delete on public.record_links to authenticated;
grant select, insert, update, delete on public.record_relationships to authenticated;

create policy "active members read record links"
on public.record_links for select
to authenticated
using (private.is_active_member(organization_id));

create policy "managers create record links"
on public.record_links for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and private.is_org_manager(organization_id)
);

create policy "managers update record links"
on public.record_links for update
to authenticated
using (private.is_org_manager(organization_id))
with check (private.is_org_manager(organization_id));

create policy "managers delete record links"
on public.record_links for delete
to authenticated
using (private.is_org_manager(organization_id));

create policy "active members read record relationships"
on public.record_relationships for select
to authenticated
using (private.is_active_member(organization_id));

create policy "managers create record relationships"
on public.record_relationships for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and private.is_org_manager(organization_id)
);

create policy "managers update record relationships"
on public.record_relationships for update
to authenticated
using (private.is_org_manager(organization_id))
with check (private.is_org_manager(organization_id));

create policy "managers delete record relationships"
on public.record_relationships for delete
to authenticated
using (private.is_org_manager(organization_id));

create index record_links_entity_idx
on public.record_links (organization_id, entity_type, entity_id, position, created_at);

create index record_relationships_source_idx
on public.record_relationships (organization_id, source_type, source_id, created_at);

create index record_relationships_target_idx
on public.record_relationships (organization_id, target_type, target_id, created_at);
