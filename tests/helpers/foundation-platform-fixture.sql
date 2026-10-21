-- Isolated platform SHAPE fixture. Never run against Cloud or existing databases.
-- Auth, Storage and Vault behavior is not implemented or accepted by this fixture.
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create schema storage;
create schema vault;
grant usage on schema auth, storage to authenticated, service_role;
create table auth.users (
  id uuid primary key, email text, raw_user_meta_data jsonb default '{}',
  email_confirmed_at timestamptz, banned_until timestamptz, deleted_at timestamptz
);
create table auth.identities (id uuid default gen_random_uuid(), user_id uuid references auth.users(id), provider text, provider_id text, identity_data jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid, owner_id text, metadata jsonb);
alter table storage.objects enable row level security;
create function storage.foldername(text) returns text[] language sql immutable as $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
create table vault.fixture_secrets (id uuid primary key, decrypted_secret text);
create view vault.decrypted_secrets as select id,decrypted_secret from vault.fixture_secrets;
create function vault.create_secret(text,text,text) returns uuid language plpgsql as $$ begin raise exception 'fixture_vault_not_implemented'; end $$;
create function vault.update_secret(uuid,text) returns void language plpgsql as $$ begin raise exception 'fixture_vault_not_implemented'; end $$;
