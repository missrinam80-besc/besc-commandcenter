create table public.association_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  member_number text,
  full_name text not null check(char_length(full_name) between 2 and 180),
  email text,
  membership_type text not null default 'effective' check(membership_type in('effective','adherent','honorary','volunteer')),
  status text not null default 'active' check(status in('candidate','active','suspended','former','deceased')),
  joined_on date,
  left_on date,
  voting_right boolean not null default false,
  address text,
  notes text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check(left_on is null or joined_on is null or left_on >= joined_on)
);

create unique index association_members_org_number_uidx
on public.association_members(organization_id, member_number)
where member_number is not null and deleted_at is null;

create table public.administrative_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check(char_length(title) between 2 and 180),
  document_type text not null check(document_type in('articles','incorporation','official_gazette','kbo','ubo','vat','minutes','annual_accounts','budget','insurance','contract','subsidy','policy','register','other')),
  status text not null default 'active' check(status in('draft','active','expiring','expired','archived')),
  document_date date,
  valid_from date,
  valid_until date,
  reference_number text,
  drive_url text,
  confidential boolean not null default true,
  notes text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check(valid_until is null or valid_from is null or valid_until >= valid_from)
);

create table public.governance_mandates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  member_id uuid not null references public.association_members(id) on delete cascade,
  role text not null check(role in('chair','vice_chair','secretary','treasurer','director','daily_management','other')),
  role_label text,
  status text not null default 'active' check(status in('planned','active','ended')),
  start_date date not null,
  end_date date,
  appointment_document_url text,
  notes text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check(end_date is null or end_date >= start_date)
);

create table public.compliance_deadlines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check(char_length(title) between 2 and 180),
  category text not null check(category in('general_assembly','board','finance','kbo','ubo','tax','insurance','subsidy','publication','contract','other')),
  due_date date not null,
  recurrence text not null default 'once' check(recurrence in('once','monthly','quarterly','yearly')),
  status text not null default 'open' check(status in('open','planned','completed','cancelled','not_applicable')),
  responsible_id uuid references public.profiles(id) on delete set null,
  document_id uuid references public.administrative_documents(id) on delete set null,
  completed_at timestamptz,
  notes text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.association_members enable row level security;
alter table public.administrative_documents enable row level security;
alter table public.governance_mandates enable row level security;
alter table public.compliance_deadlines enable row level security;

grant select, insert, update, delete on
  public.association_members,
  public.administrative_documents,
  public.governance_mandates,
  public.compliance_deadlines
to authenticated;

create policy "managers read association members"
on public.association_members for select to authenticated
using(private.is_org_manager(organization_id));
create policy "managers create association members"
on public.association_members for insert to authenticated
with check(private.is_org_manager(organization_id) and created_by = (select auth.uid()));
create policy "managers update association members"
on public.association_members for update to authenticated
using(private.is_org_manager(organization_id))
with check(private.is_org_manager(organization_id));
create policy "managers delete association members"
on public.association_members for delete to authenticated
using(private.is_org_manager(organization_id));

create policy "managers read administrative documents"
on public.administrative_documents for select to authenticated
using(private.is_org_manager(organization_id));
create policy "managers create administrative documents"
on public.administrative_documents for insert to authenticated
with check(private.is_org_manager(organization_id) and created_by = (select auth.uid()));
create policy "managers update administrative documents"
on public.administrative_documents for update to authenticated
using(private.is_org_manager(organization_id))
with check(private.is_org_manager(organization_id));
create policy "managers delete administrative documents"
on public.administrative_documents for delete to authenticated
using(private.is_org_manager(organization_id));

create policy "managers read governance mandates"
on public.governance_mandates for select to authenticated
using(private.is_org_manager(organization_id));
create policy "managers create governance mandates"
on public.governance_mandates for insert to authenticated
with check(private.is_org_manager(organization_id) and created_by = (select auth.uid()));
create policy "managers update governance mandates"
on public.governance_mandates for update to authenticated
using(private.is_org_manager(organization_id))
with check(private.is_org_manager(organization_id));
create policy "managers delete governance mandates"
on public.governance_mandates for delete to authenticated
using(private.is_org_manager(organization_id));

create policy "managers read compliance deadlines"
on public.compliance_deadlines for select to authenticated
using(private.is_org_manager(organization_id));
create policy "managers create compliance deadlines"
on public.compliance_deadlines for insert to authenticated
with check(private.is_org_manager(organization_id) and created_by = (select auth.uid()));
create policy "managers update compliance deadlines"
on public.compliance_deadlines for update to authenticated
using(private.is_org_manager(organization_id))
with check(private.is_org_manager(organization_id));
create policy "managers delete compliance deadlines"
on public.compliance_deadlines for delete to authenticated
using(private.is_org_manager(organization_id));

create index association_members_org_status_idx
on public.association_members(organization_id, status)
where deleted_at is null;
create index association_members_created_by_idx
on public.association_members(created_by);

create index administrative_documents_org_type_status_idx
on public.administrative_documents(organization_id, document_type, status)
where deleted_at is null;
create index administrative_documents_created_by_idx
on public.administrative_documents(created_by);

create index governance_mandates_org_status_idx
on public.governance_mandates(organization_id, status)
where deleted_at is null;
create index governance_mandates_member_idx
on public.governance_mandates(member_id)
where deleted_at is null;
create index governance_mandates_created_by_idx
on public.governance_mandates(created_by);

create index compliance_deadlines_org_due_idx
on public.compliance_deadlines(organization_id, due_date, status)
where deleted_at is null;
create index compliance_deadlines_responsible_idx
on public.compliance_deadlines(responsible_id)
where responsible_id is not null and deleted_at is null;
create index compliance_deadlines_document_idx
on public.compliance_deadlines(document_id)
where document_id is not null and deleted_at is null;
create index compliance_deadlines_created_by_idx
on public.compliance_deadlines(created_by);
