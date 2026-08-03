revoke all on public.record_links from authenticated;
revoke all on public.record_relationships from authenticated;

grant select, insert, update, delete on public.record_links to authenticated;
grant select, insert, update, delete on public.record_relationships to authenticated;

create index record_links_created_by_idx
on public.record_links (created_by);

create index record_relationships_created_by_idx
on public.record_relationships (created_by);
