alter table public.partners add column contract_url text, add column agreement_summary text;
alter table public.campaigns add column results_summary text, add column impressions bigint check(impressions is null or impressions>=0), add column clicks bigint check(clicks is null or clicks>=0);

create table public.partner_contacts (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, partner_id uuid not null references public.partners(id) on delete cascade,
 name text not null check(char_length(name) between 2 and 180), role_title text, email text, phone text, is_primary boolean not null default false, notes text,
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.partner_interactions (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, partner_id uuid not null references public.partners(id) on delete cascade,
 interaction_type text not null default 'note' check(interaction_type in('email','call','meeting','note','proposal','contract')), occurred_at timestamptz not null default now(), summary text not null check(char_length(summary) between 2 and 5000), next_action text, follow_up_date date,
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now()
);
create table public.campaign_deliverables (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, campaign_id uuid not null references public.campaigns(id) on delete cascade,
 title text not null check(char_length(title) between 2 and 240), status text not null default 'todo' check(status in('todo','doing','review','approved','completed','blocked','cancelled')), approval_status text not null default 'not_required' check(approval_status in('not_required','pending','changes_requested','approved')), due_date date, assignee_id uuid references public.profiles(id) on delete set null, notes text,
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.community_onboarding_items (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, person_id uuid not null references public.community_people(id) on delete cascade,
 title text not null check(char_length(title) between 2 and 240), completed boolean not null default false, completed_at timestamptz, due_date date,
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now()
);
create table public.community_assignments (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, person_id uuid not null references public.community_people(id) on delete cascade,
 event_id uuid references public.events(id) on delete cascade, project_id uuid references public.projects(id) on delete cascade, role_name text not null check(char_length(role_name) between 2 and 180), status text not null default 'planned' check(status in('planned','confirmed','completed','cancelled')), starts_at timestamptz, notes text,
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), check(event_id is not null or project_id is not null)
);

do $$ declare t text; begin foreach t in array array['partner_contacts','partner_interactions','campaign_deliverables','community_onboarding_items','community_assignments'] loop
 execute format('alter table public.%I enable row level security',t);execute format('grant select,insert,update,delete on public.%I to authenticated',t);
 execute format('create policy "members read %1$s" on public.%1$I for select to authenticated using (private.is_active_member(organization_id))',t);
 execute format('create policy "managers create %1$s" on public.%1$I for insert to authenticated with check (private.is_org_manager(organization_id))',t);
 execute format('create policy "managers update %1$s" on public.%1$I for update to authenticated using (private.is_org_manager(organization_id)) with check (private.is_org_manager(organization_id))',t);
 execute format('create policy "managers delete %1$s" on public.%1$I for delete to authenticated using (private.is_org_manager(organization_id))',t);
end loop; end $$;

create unique index partner_contacts_one_primary_idx on public.partner_contacts(partner_id) where is_primary;
create index partner_contacts_org_partner_idx on public.partner_contacts(organization_id,partner_id);
create index partner_contacts_created_by_idx on public.partner_contacts(created_by);
create index partner_interactions_org_partner_date_idx on public.partner_interactions(organization_id,partner_id,occurred_at desc);
create index partner_interactions_created_by_idx on public.partner_interactions(created_by);
create index campaign_deliverables_org_campaign_status_idx on public.campaign_deliverables(organization_id,campaign_id,status);
create index campaign_deliverables_assignee_idx on public.campaign_deliverables(assignee_id);
create index campaign_deliverables_created_by_idx on public.campaign_deliverables(created_by);
create index community_onboarding_org_person_idx on public.community_onboarding_items(organization_id,person_id,completed);
create index community_onboarding_created_by_idx on public.community_onboarding_items(created_by);
create index community_assignments_org_person_idx on public.community_assignments(organization_id,person_id,status);
create index community_assignments_event_idx on public.community_assignments(event_id);
create index community_assignments_project_idx on public.community_assignments(project_id);
create index community_assignments_created_by_idx on public.community_assignments(created_by);
