create table public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  platform text not null check (platform in ('youtube','facebook','instagram','threads','twitch','linkedin','tiktok','x')),
  external_account_id text,
  account_name text not null check (char_length(account_name) between 2 and 180),
  account_type text,
  status text not null default 'pending' check (status in ('pending','connected','expired','error','disabled','disconnected')),
  granted_scopes text[] not null default '{}',
  sync_enabled boolean not null default false,
  sync_interval_minutes integer not null default 1440 check (sync_interval_minutes between 15 and 43200),
  retention_days integer not null default 730 check (retention_days between 30 and 3650),
  token_expires_at timestamptz,
  last_sync_at timestamptz,
  last_error text,
  connected_by uuid references public.profiles(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.social_sync_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  social_account_id uuid not null references public.social_accounts(id) on delete cascade,
  trigger_type text not null default 'manual' check (trigger_type in ('manual','scheduled','oauth','backfill')),
  status text not null default 'queued' check (status in ('queued','running','succeeded','partial','failed','cancelled')),
  idempotency_key text not null,
  cursor_value text,
  records_read integer not null default 0 check (records_read >= 0),
  records_written integer not null default 0 check (records_written >= 0),
  started_at timestamptz,
  finished_at timestamptz,
  error_message text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(social_account_id,idempotency_key)
);

create table public.social_metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  social_account_id uuid not null references public.social_accounts(id) on delete cascade,
  sync_run_id uuid not null references public.social_sync_runs(id) on delete cascade,
  social_post_id uuid references public.social_posts(id) on delete set null,
  external_content_id text not null default '',
  platform_metric text not null,
  normalized_metric text not null,
  metric_value numeric not null,
  period_start timestamptz,
  period_end timestamptz,
  fetched_at timestamptz not null default now(),
  source_url text,
  source_metadata jsonb not null default '{}',
  unique(sync_run_id,external_content_id,platform_metric,period_start,period_end)
);

create table private.social_account_credentials (
  social_account_id uuid primary key references public.social_accounts(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  access_token_secret_id uuid not null,
  refresh_token_secret_id uuid,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table private.social_account_credentials enable row level security;
revoke all on table private.social_account_credentials from public, anon, authenticated;

alter table public.social_accounts enable row level security;
alter table public.social_sync_runs enable row level security;
alter table public.social_metric_snapshots enable row level security;
grant select,insert,update,delete on public.social_accounts,public.social_sync_runs,public.social_metric_snapshots to authenticated;

create policy "managers read social accounts" on public.social_accounts for select to authenticated using (private.is_org_manager(organization_id));
create policy "managers create social accounts" on public.social_accounts for insert to authenticated with check (private.is_org_manager(organization_id) and created_by=(select auth.uid()));
create policy "managers update social accounts" on public.social_accounts for update to authenticated using (private.is_org_manager(organization_id)) with check (private.is_org_manager(organization_id));
create policy "managers delete social accounts" on public.social_accounts for delete to authenticated using (private.is_org_manager(organization_id));
create policy "managers read social sync runs" on public.social_sync_runs for select to authenticated using (private.is_org_manager(organization_id));
create policy "managers create social sync runs" on public.social_sync_runs for insert to authenticated with check (private.is_org_manager(organization_id));
create policy "managers update social sync runs" on public.social_sync_runs for update to authenticated using (private.is_org_manager(organization_id)) with check (private.is_org_manager(organization_id));
create policy "members read social metric snapshots" on public.social_metric_snapshots for select to authenticated using (private.is_active_member(organization_id));
create policy "managers create social metric snapshots" on public.social_metric_snapshots for insert to authenticated with check (private.is_org_manager(organization_id));
create policy "managers update social metric snapshots" on public.social_metric_snapshots for update to authenticated using (private.is_org_manager(organization_id)) with check (private.is_org_manager(organization_id));

create unique index social_accounts_external_idx on public.social_accounts(organization_id,platform,external_account_id) where external_account_id is not null and deleted_at is null;
create index social_accounts_org_status_idx on public.social_accounts(organization_id,platform,status) where deleted_at is null;
create index social_accounts_created_by_idx on public.social_accounts(created_by);
create index social_accounts_connected_by_idx on public.social_accounts(connected_by) where connected_by is not null;
create index social_sync_runs_org_status_idx on public.social_sync_runs(organization_id,status,created_at desc);
create index social_sync_runs_account_idx on public.social_sync_runs(social_account_id,created_at desc);
create index social_sync_runs_created_by_idx on public.social_sync_runs(created_by) where created_by is not null;
create index social_metrics_org_metric_idx on public.social_metric_snapshots(organization_id,normalized_metric,period_end desc);
create index social_metrics_account_idx on public.social_metric_snapshots(social_account_id,fetched_at desc);
create index social_metrics_post_idx on public.social_metric_snapshots(social_post_id) where social_post_id is not null;

create function public.store_social_account_credentials(
  p_account_id uuid,p_access_token text,p_refresh_token text default null,p_expires_at timestamptz default null
) returns void language plpgsql security definer set search_path='' as $$
declare account_row public.social_accounts; credential_row private.social_account_credentials; access_id uuid; refresh_id uuid;
begin
  select * into account_row from public.social_accounts where id=p_account_id and deleted_at is null;
  if account_row.id is null or length(trim(p_access_token)) < 8 then raise exception 'invalid credentials'; end if;
  select * into credential_row from private.social_account_credentials where social_account_id=p_account_id for update;
  if credential_row.social_account_id is null then
    select vault.create_secret(p_access_token,'social-access-'||p_account_id::text,'Social access token') into access_id;
    if nullif(trim(p_refresh_token),'') is not null then select vault.create_secret(p_refresh_token,'social-refresh-'||p_account_id::text,'Social refresh token') into refresh_id; end if;
    insert into private.social_account_credentials(social_account_id,organization_id,access_token_secret_id,refresh_token_secret_id,expires_at)
    values(p_account_id,account_row.organization_id,access_id,refresh_id,p_expires_at);
  else
    perform vault.update_secret(credential_row.access_token_secret_id,p_access_token);
    refresh_id := credential_row.refresh_token_secret_id;
    if nullif(trim(p_refresh_token),'') is not null and refresh_id is null then
      select vault.create_secret(p_refresh_token,'social-refresh-'||p_account_id::text,'Social refresh token') into refresh_id;
    elsif nullif(trim(p_refresh_token),'') is not null then perform vault.update_secret(refresh_id,p_refresh_token); end if;
    update private.social_account_credentials set refresh_token_secret_id=refresh_id,expires_at=p_expires_at,updated_at=now() where social_account_id=p_account_id;
  end if;
end $$;

create function public.read_social_account_credentials(p_account_id uuid)
returns table(access_token text,refresh_token text,expires_at timestamptz)
language sql security definer set search_path='' as $$
  select access_secret.decrypted_secret,refresh_secret.decrypted_secret,credentials.expires_at
  from private.social_account_credentials credentials
  join vault.decrypted_secrets access_secret on access_secret.id=credentials.access_token_secret_id
  left join vault.decrypted_secrets refresh_secret on refresh_secret.id=credentials.refresh_token_secret_id
  where credentials.social_account_id=p_account_id
$$;

revoke all on function public.store_social_account_credentials(uuid,text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.read_social_account_credentials(uuid) from public,anon,authenticated;
grant execute on function public.store_social_account_credentials(uuid,text,text,timestamptz) to service_role;
grant execute on function public.read_social_account_credentials(uuid) to service_role;
