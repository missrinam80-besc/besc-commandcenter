-- Local test-container bootstrap only. Storage itself is outside these RPC tests.
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
alter table storage.objects enable row level security;
create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
alter table storage.buckets owner to postgres;
alter table storage.objects owner to postgres;
alter table auth.users add column if not exists email_confirmed_at timestamptz;
