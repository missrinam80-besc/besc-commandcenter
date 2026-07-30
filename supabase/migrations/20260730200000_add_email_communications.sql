create table public.email_communications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_type text not null check (entity_type in ('partner','event','meeting')),
  entity_id uuid not null,
  communication_type text not null check (communication_type in ('sponsor_follow_up','event_communication','invitation')),
  title text not null check (char_length(title) between 2 and 240),
  to_addresses text[] not null check (cardinality(to_addresses)>0),
  cc_addresses text[] not null default '{}',
  subject text not null check (char_length(subject) between 2 and 300),
  body_text text not null check (char_length(body_text) between 2 and 20000),
  follow_up_date date,
  status text not null default 'draft' check (status in ('draft','pending_approval','changes_requested','approved','sent','rejected','failed')),
  gmail_draft_id text,
  gmail_message_id text,
  gmail_thread_id text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  approved_by uuid references public.profiles(id) on delete set null,
  sent_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.email_communications enable row level security;
grant select,insert,update on public.email_communications to authenticated;

create policy "creators and managers read email communications"
on public.email_communications for select to authenticated
using (
  private.is_org_manager(organization_id)
  or (created_by=(select auth.uid()) and private.is_active_member(organization_id))
);

create policy "members create own email communications"
on public.email_communications for insert to authenticated
with check (
  private.is_active_member(organization_id)
  and created_by=(select auth.uid())
  and status in ('draft','failed')
  and approved_by is null
  and sent_by is null
);

create policy "creators and managers update email communications"
on public.email_communications for update to authenticated
using (
  private.is_org_manager(organization_id)
  or (created_by=(select auth.uid()) and private.is_active_member(organization_id))
)
with check (
  private.is_org_manager(organization_id)
  or (
    created_by=(select auth.uid())
    and private.is_active_member(organization_id)
    and status in ('draft','pending_approval','changes_requested','failed')
    and approved_by is null
    and sent_by is null
    and sent_at is null
  )
);

create index email_communications_org_status_idx
on public.email_communications(organization_id,status,updated_at desc);

create index email_communications_entity_idx
on public.email_communications(organization_id,entity_type,entity_id,created_at desc);

create index email_communications_created_by_idx
on public.email_communications(created_by);

create index email_communications_approved_by_idx
on public.email_communications(approved_by)
where approved_by is not null;

create index email_communications_sent_by_idx
on public.email_communications(sent_by)
where sent_by is not null;

alter table public.approval_requests
drop constraint approval_requests_entity_type_check;

alter table public.approval_requests
add constraint approval_requests_entity_type_check
check (entity_type in ('content','expense','partner','document','email'));

alter table public.approval_requests
drop constraint approval_requests_module_check;

alter table public.approval_requests
add constraint approval_requests_module_check
check (module in ('content','finance','sponsors','documents','communication'));
