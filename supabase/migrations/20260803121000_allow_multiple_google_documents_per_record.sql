alter table public.google_resource_links
drop constraint google_resource_links_organization_id_entity_type_entity_id_key;

create unique index google_resource_links_singleton_resource_idx
on public.google_resource_links (organization_id, entity_type, entity_id, resource_type)
where resource_type in ('folder', 'calendar_event');

create unique index google_resource_links_google_id_idx
on public.google_resource_links (organization_id, google_id);
