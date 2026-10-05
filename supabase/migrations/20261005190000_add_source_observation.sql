-- Metadata observation only; existing rows remain unknown.
-- Apply before deploying application code that selects/writes these columns.
alter table public.google_resource_links
  add column source_version text,
  add column source_modified_at timestamptz,
  add column source_checked_at timestamptz,
  add constraint google_resource_links_source_version_format
    check (source_version is null or source_version ~ '^[0-9]+$');

comment on column public.google_resource_links.source_version is
  'Observed Google Drive version, stored as text to preserve int64 precision. Not an approval or content hash.';
comment on column public.google_resource_links.source_checked_at is
  'Time of successful metadata observation. Null means no recorded observation.';
