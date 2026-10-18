-- Extend the existing isolated rewards fixture; never run against Cloud.
alter table auth.users add column deleted_at timestamptz;
create index fixture_provider_lookup on auth.identities(provider,provider_id);
