create table public.finance_settings (
 organization_id uuid primary key references public.organizations(id) on delete cascade, drive_root_url text, fiscal_year_start_month integer not null default 1 check(fiscal_year_start_month between 1 and 12),
 document_naming_pattern text not null default 'YYYY-MM-DD - TYPE - LEVERANCIER - BEDRAG', updated_by uuid references public.profiles(id) on delete set null, updated_at timestamptz not null default now()
);
alter table public.finance_settings enable row level security;grant select,insert,update on public.finance_settings to authenticated;
create policy "members read finance settings" on public.finance_settings for select to authenticated using(private.is_active_member(organization_id));
create policy "finance managers create settings" on public.finance_settings for insert to authenticated with check(private.can_manage_finance(organization_id));
create policy "finance managers update settings" on public.finance_settings for update to authenticated using(private.can_manage_finance(organization_id)) with check(private.can_manage_finance(organization_id));
insert into public.finance_settings(organization_id) select id from public.organizations on conflict do nothing;
