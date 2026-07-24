drop policy if exists "managers manage migration links" on public.migration_source_links;
drop policy if exists "managers manage legacy records" on public.legacy_records;

create policy "managers create migration links" on public.migration_source_links
for insert to authenticated with check (private.is_org_manager(organization_id));
create policy "managers update migration links" on public.migration_source_links
for update to authenticated using (private.is_org_manager(organization_id))
with check (private.is_org_manager(organization_id));
create policy "managers delete migration links" on public.migration_source_links
for delete to authenticated using (private.is_org_manager(organization_id));

create policy "managers create legacy records" on public.legacy_records
for insert to authenticated with check (private.is_org_manager(organization_id));
create policy "managers update legacy records" on public.legacy_records
for update to authenticated using (private.is_org_manager(organization_id))
with check (private.is_org_manager(organization_id));
create policy "managers delete legacy records" on public.legacy_records
for delete to authenticated using (private.is_org_manager(organization_id));

create index migration_source_links_imported_by_idx
  on public.migration_source_links (imported_by);
create index legacy_records_created_by_idx
  on public.legacy_records (created_by);
