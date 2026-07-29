create table public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_type text not null check (entity_type in ('content','expense','partner','document')),
  entity_id uuid not null,
  title text not null check (char_length(title) between 2 and 240),
  module text not null check (module in ('content','finance','sponsors','documents')),
  source_href text not null check (source_href like '/app/%'),
  status text not null default 'pending' check (status in ('pending','approved','changes_requested','rejected')),
  requested_by uuid not null references public.profiles(id) on delete restrict,
  request_note text,
  decided_by uuid references public.profiles(id) on delete set null,
  decision_note text,
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index approval_requests_one_pending_idx
on public.approval_requests (organization_id,entity_type,entity_id)
where status='pending';

create index approval_requests_work_queue_idx
on public.approval_requests (organization_id,status,requested_at desc);

create index approval_requests_requested_by_idx
on public.approval_requests (requested_by);

create index approval_requests_decided_by_idx
on public.approval_requests (decided_by)
where decided_by is not null;

alter table public.approval_requests enable row level security;
grant select,insert,update on public.approval_requests to authenticated;

create policy "members read approval requests"
on public.approval_requests for select to authenticated
using (private.is_active_member(organization_id));

create policy "members submit approval requests"
on public.approval_requests for insert to authenticated
with check (
  private.is_active_member(organization_id)
  and requested_by=(select auth.uid())
  and status='pending'
  and decided_by is null
  and decided_at is null
);

create policy "authorized reviewers decide approval requests"
on public.approval_requests for update to authenticated
using (
  private.is_org_manager(organization_id)
  or (entity_type='expense' and private.can_manage_finance(organization_id))
)
with check (
  private.is_org_manager(organization_id)
  or (entity_type='expense' and private.can_manage_finance(organization_id))
);

alter table public.content_items
drop constraint content_items_approval_status_check;

alter table public.content_items
add constraint content_items_approval_status_check
check (approval_status in ('not_required','pending','changes_requested','approved','rejected'));
