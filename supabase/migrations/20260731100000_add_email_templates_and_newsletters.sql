create table public.email_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 180),
  category text not null check (category in ('sponsor_follow_up','event_communication','invitation','newsletter','general')),
  entity_type text check (entity_type is null or entity_type in ('partner','event','meeting')),
  subject_template text not null check (char_length(subject_template) between 2 and 300),
  body_template text not null check (char_length(body_template) between 2 and 20000),
  is_active boolean not null default true,
  is_system boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.mailing_lists (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 180),
  description text,
  status text not null default 'active' check (status in ('active','paused','archived')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.mailing_subscribers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  mailing_list_id uuid not null references public.mailing_lists(id) on delete cascade,
  email text not null check (char_length(email) between 5 and 320),
  display_name text,
  status text not null default 'subscribed' check (status in ('subscribed','unsubscribed','bounced')),
  source text not null default 'manual' check (source in ('manual','import','form','event','partner','community')),
  consent_basis text not null check (consent_basis in ('consent','existing_relationship','legitimate_interest','internal')),
  consent_at timestamptz,
  unsubscribed_at timestamptz,
  notes text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'subscribed' or consent_at is not null)
);

create table public.newsletters (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  mailing_list_id uuid not null references public.mailing_lists(id) on delete restrict,
  email_template_id uuid references public.email_templates(id) on delete set null,
  title text not null check (char_length(title) between 2 and 240),
  subject text not null check (char_length(subject) between 2 and 300),
  body_text text not null check (char_length(body_text) between 2 and 30000),
  status text not null default 'draft' check (status in ('draft','pending_approval','changes_requested','approved','sent','rejected','failed')),
  recipient_count integer not null default 0 check (recipient_count >= 0 and recipient_count <= 100),
  recipient_snapshot text[] not null default '{}',
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

alter table public.email_communications
add column email_template_id uuid references public.email_templates(id) on delete set null;

alter table public.email_templates enable row level security;
alter table public.mailing_lists enable row level security;
alter table public.mailing_subscribers enable row level security;
alter table public.newsletters enable row level security;
grant select,insert,update on public.email_templates,public.mailing_lists,public.mailing_subscribers,public.newsletters to authenticated;

create policy "members read active email templates"
on public.email_templates for select to authenticated
using (private.is_active_member(organization_id));
create policy "managers create email templates"
on public.email_templates for insert to authenticated
with check (private.is_org_manager(organization_id) and created_by=(select auth.uid()));
create policy "managers update email templates"
on public.email_templates for update to authenticated
using (private.is_org_manager(organization_id))
with check (private.is_org_manager(organization_id));

create policy "members read mailing list summaries"
on public.mailing_lists for select to authenticated
using (private.is_active_member(organization_id));
create policy "managers create mailing lists"
on public.mailing_lists for insert to authenticated
with check (private.is_org_manager(organization_id) and created_by=(select auth.uid()));
create policy "managers update mailing lists"
on public.mailing_lists for update to authenticated
using (private.is_org_manager(organization_id))
with check (private.is_org_manager(organization_id));

create policy "managers read mailing subscribers"
on public.mailing_subscribers for select to authenticated
using (private.is_org_manager(organization_id));
create policy "managers create mailing subscribers"
on public.mailing_subscribers for insert to authenticated
with check (private.is_org_manager(organization_id) and created_by=(select auth.uid()));
create policy "managers update mailing subscribers"
on public.mailing_subscribers for update to authenticated
using (private.is_org_manager(organization_id))
with check (private.is_org_manager(organization_id));

create policy "creators and managers read newsletters"
on public.newsletters for select to authenticated
using (
  private.is_org_manager(organization_id)
  or (created_by=(select auth.uid()) and private.is_active_member(organization_id))
);
create policy "managers create own newsletters"
on public.newsletters for insert to authenticated
with check (
  private.is_org_manager(organization_id)
  and created_by=(select auth.uid())
  and status in ('draft','failed')
  and approved_by is null and sent_by is null
);
create policy "creators and managers update newsletters"
on public.newsletters for update to authenticated
using (private.is_org_manager(organization_id))
with check (private.is_org_manager(organization_id));

create unique index email_templates_org_name_idx on public.email_templates(organization_id,lower(name));
create index email_templates_org_category_idx on public.email_templates(organization_id,category,is_active);
create index email_templates_created_by_idx on public.email_templates(created_by) where created_by is not null;
create index email_communications_template_idx on public.email_communications(email_template_id) where email_template_id is not null;
create unique index mailing_lists_org_name_idx on public.mailing_lists(organization_id,lower(name));
create index mailing_lists_created_by_idx on public.mailing_lists(created_by);
create unique index mailing_subscribers_list_email_idx on public.mailing_subscribers(mailing_list_id,lower(email));
create index mailing_subscribers_org_status_idx on public.mailing_subscribers(organization_id,status);
create index mailing_subscribers_created_by_idx on public.mailing_subscribers(created_by);
create index newsletters_org_status_idx on public.newsletters(organization_id,status,updated_at desc);
create index newsletters_list_idx on public.newsletters(mailing_list_id,created_at desc);
create index newsletters_template_idx on public.newsletters(email_template_id) where email_template_id is not null;
create index newsletters_created_by_idx on public.newsletters(created_by);
create index newsletters_approved_by_idx on public.newsletters(approved_by) where approved_by is not null;
create index newsletters_sent_by_idx on public.newsletters(sent_by) where sent_by is not null;

insert into public.email_templates(
  organization_id,name,category,entity_type,subject_template,body_template,is_system
)
select id,'Sponsoropvolging','sponsor_follow_up','partner',
  'Opvolging samenwerking {{partner_naam}} en {{organisatie}}',
  E'Beste {{contact_naam}},\n\nGraag volgen we onze samenwerking rond {{dossier}} verder op.\n\nKun je ons laten weten wat de volgende stap is? We horen graag van je.\n\nMet vriendelijke groeten,\n{{afzender}}\n{{organisatie}}',
  true
from public.organizations
on conflict do nothing;

insert into public.email_templates(
  organization_id,name,category,entity_type,subject_template,body_template,is_system
)
select id,'Eventcommunicatie','event_communication','event',
  '{{event_naam}} op {{event_datum}}',
  E'Beste,\n\nHierbij bezorgen we je de praktische informatie voor {{event_naam}} op {{event_datum}}.\n\nLocatie: {{event_locatie}}\n\nMet vriendelijke groeten,\n{{afzender}}\n{{organisatie}}',
  true
from public.organizations
on conflict do nothing;

insert into public.email_templates(
  organization_id,name,category,entity_type,subject_template,body_template,is_system
)
select id,'Uitnodiging vergadering','invitation','meeting',
  'Uitnodiging: {{vergadering_naam}}',
  E'Beste,\n\nJe bent uitgenodigd voor {{vergadering_naam}} op {{vergadering_datum}}.\n\nLaat gerust weten of je aanwezig kunt zijn.\n\nMet vriendelijke groeten,\n{{afzender}}\n{{organisatie}}',
  true
from public.organizations
on conflict do nothing;

insert into public.email_templates(
  organization_id,name,category,entity_type,subject_template,body_template,is_system
)
select id,'BESC nieuwsbrief','newsletter',null,
  '{{nieuwsbrief_titel}}',
  E'Beste {{contact_naam}},\n\n{{nieuwsbrief_inhoud}}\n\nMet vriendelijke groeten,\n{{afzender}}\n{{organisatie}}\n\nWil je geen berichten meer ontvangen? Antwoord op deze e-mail met ''uitschrijven''.',
  true
from public.organizations
on conflict do nothing;

alter table public.approval_requests drop constraint approval_requests_entity_type_check;
alter table public.approval_requests add constraint approval_requests_entity_type_check
check (entity_type in ('content','expense','partner','document','email','newsletter'));
