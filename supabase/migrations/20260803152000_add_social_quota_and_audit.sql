alter table public.social_accounts
  add column quota_daily_limit integer not null default 10000 check (quota_daily_limit between 1 and 10000000),
  add column quota_used_estimate integer not null default 0 check (quota_used_estimate >= 0),
  add column quota_counter_date date,
  add column quota_warning_percent integer not null default 80 check (quota_warning_percent between 1 and 100);

drop trigger if exists audit_social_accounts_change on public.social_accounts;
create trigger audit_social_accounts_change
after insert or update or delete on public.social_accounts
for each row execute function private.log_organization_change();

drop trigger if exists audit_social_sync_runs_change on public.social_sync_runs;
create trigger audit_social_sync_runs_change
after insert or update or delete on public.social_sync_runs
for each row execute function private.log_organization_change();
