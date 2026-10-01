alter table public.email_communications
  add column if not exists deleted_at timestamptz;

create index if not exists email_communications_org_deleted_idx
  on public.email_communications(organization_id, deleted_at, updated_at desc);
