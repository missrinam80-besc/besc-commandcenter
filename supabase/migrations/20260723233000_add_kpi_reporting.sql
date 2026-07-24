create table public.kpi_records (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 name text not null check(char_length(name) between 2 and 180), domain text not null check(domain in('community','content','social','events','campaigns','sponsors','website','finance','other')),
 metric text not null, value numeric(18,4) not null, target numeric(18,4), unit text not null default 'number' check(unit in('number','percent','currency','minutes','hours','days')),
 period_start date not null, period_end date not null, source text not null default 'manual', source_url text, notes text,
 project_id uuid references public.projects(id) on delete set null, content_id uuid references public.content_items(id) on delete set null,
 event_id uuid references public.events(id) on delete set null, campaign_id uuid references public.campaigns(id) on delete set null, partner_id uuid references public.partners(id) on delete set null,
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
 check(period_end>=period_start)
);
alter table public.kpi_records enable row level security;grant select,insert,update,delete on public.kpi_records to authenticated;
create policy "members read kpi records" on public.kpi_records for select to authenticated using(private.is_active_member(organization_id));
create policy "managers create kpi records" on public.kpi_records for insert to authenticated with check(private.is_org_manager(organization_id) and created_by=(select auth.uid()));
create policy "managers update kpi records" on public.kpi_records for update to authenticated using(private.is_org_manager(organization_id)) with check(private.is_org_manager(organization_id));
create policy "managers delete kpi records" on public.kpi_records for delete to authenticated using(private.is_org_manager(organization_id));
create index kpi_records_org_period_idx on public.kpi_records(organization_id,period_end desc,domain) where deleted_at is null;
create index kpi_records_project_idx on public.kpi_records(project_id) where deleted_at is null;create index kpi_records_content_idx on public.kpi_records(content_id) where deleted_at is null;
create index kpi_records_event_idx on public.kpi_records(event_id) where deleted_at is null;create index kpi_records_campaign_idx on public.kpi_records(campaign_id) where deleted_at is null;create index kpi_records_partner_idx on public.kpi_records(partner_id) where deleted_at is null;
