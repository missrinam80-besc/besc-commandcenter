create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  action text not null check (action in ('created', 'updated', 'archived', 'deleted')),
  actor_id uuid references public.profiles(id) on delete set null,
  entity_label text,
  changed_fields text[] not null default '{}',
  previous_status text,
  new_status text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_log enable row level security;

grant select on public.audit_log to authenticated;
revoke insert, update, delete on public.audit_log from authenticated;

create policy "organization managers read audit log"
on public.audit_log
for select
to authenticated
using (private.is_org_manager(organization_id));

create index audit_log_org_created_idx
on public.audit_log(organization_id, created_at desc);

create index audit_log_org_entity_idx
on public.audit_log(organization_id, entity_type, entity_id, created_at desc);

create index audit_log_actor_idx
on public.audit_log(actor_id, created_at desc)
where actor_id is not null;

create or replace function private.log_organization_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_data jsonb;
  after_data jsonb;
  record_data jsonb;
  org_id uuid;
  record_id uuid;
  audit_action text;
  fields text[] := '{}';
begin
  before_data := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else '{}'::jsonb end;
  after_data := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else '{}'::jsonb end;
  record_data := case when tg_op = 'DELETE' then before_data else after_data end;
  org_id := nullif(record_data ->> 'organization_id', '')::uuid;
  record_id := coalesce(
    nullif(record_data ->> 'id', '')::uuid,
    nullif(record_data ->> 'user_id', '')::uuid
  );

  if org_id is null or record_id is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    audit_action := 'created';
  elsif tg_op = 'DELETE' then
    audit_action := 'deleted';
  elsif before_data ->> 'deleted_at' is null and after_data ->> 'deleted_at' is not null then
    audit_action := 'archived';
  else
    audit_action := 'updated';
  end if;

  if tg_op = 'UPDATE' then
    select coalesce(array_agg(change.key order by change.key), '{}')
    into fields
    from jsonb_each(after_data) as change
    where change.value is distinct from before_data -> change.key
      and change.key not in ('updated_at', 'deleted_at');
  end if;

  insert into public.audit_log (
    organization_id,
    entity_type,
    entity_id,
    action,
    actor_id,
    entity_label,
    changed_fields,
    previous_status,
    new_status,
    metadata
  )
  values (
    org_id,
    tg_table_name,
    record_id,
    audit_action,
    (select auth.uid()),
    coalesce(
      nullif(record_data ->> 'title', ''),
      nullif(record_data ->> 'name', ''),
      nullif(record_data ->> 'display_name', ''),
      nullif(record_data ->> 'legal_name', ''),
      nullif(record_data ->> 'email', '')
    ),
    fields,
    before_data ->> 'status',
    after_data ->> 'status',
    jsonb_build_object('source_table', tg_table_name)
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.log_organization_change() from public, anon, authenticated;

do $$
declare
  table_name text;
  tracked_tables text[] := array[
    'organization_members',
    'inbox_items',
    'tasks',
    'projects',
    'content_items',
    'events',
    'campaigns',
    'partners',
    'community_people',
    'social_posts',
    'meetings',
    'meeting_action_items',
    'shop_products',
    'merch_launches',
    'budget_envelopes',
    'expenses',
    'income_entries',
    'financial_documents',
    'administrative_documents',
    'association_members',
    'governance_mandates',
    'compliance_deadlines',
    'knowledge_articles',
    'knowledge_categories',
    'kpi_records',
    'integration_connections',
    'ai_prompt_templates'
  ];
begin
  foreach table_name in array tracked_tables loop
    execute format(
      'create trigger audit_%I_change after insert or update or delete on public.%I for each row execute function private.log_organization_change()',
      table_name,
      table_name
    );
  end loop;
end;
$$;

insert into public.audit_log (
  organization_id,
  entity_type,
  entity_id,
  action,
  actor_id,
  entity_label,
  changed_fields,
  previous_status,
  new_status,
  metadata,
  created_at
)
select
  event.organization_id,
  case event.entity_type::text
    when 'task' then 'tasks'
    when 'project' then 'projects'
  end,
  event.entity_id,
  case
    when event.action = 'task_completed' then 'updated'
    else 'updated'
  end,
  event.actor_id,
  coalesce(task.title, project.title),
  case event.action
    when 'task_assigned' then array['assignee']
    when 'task_completed' then array['status']
    when 'comment_added' then array['comment']
    else '{}'::text[]
  end,
  null,
  case when event.action = 'task_completed' then 'done' end,
  jsonb_build_object('legacy_action', event.action),
  event.created_at
from public.activity_events event
left join public.tasks task
  on event.entity_type::text = 'task' and task.id = event.entity_id
left join public.projects project
  on event.entity_type::text = 'project' and project.id = event.entity_id;

insert into public.audit_log (
  organization_id,
  entity_type,
  entity_id,
  action,
  actor_id,
  entity_label,
  changed_fields,
  previous_status,
  new_status,
  metadata,
  created_at
)
select
  financial.organization_id,
  case financial.entity_type
    when 'budget' then 'budget_envelopes'
    when 'expense' then 'expenses'
    when 'income' then 'income_entries'
  end,
  financial.entity_id,
  case when financial.action = 'created' then 'created' else 'updated' end,
  financial.actor_id,
  coalesce(budget.name, expense.title, income.title),
  case
    when financial.previous_status is distinct from financial.new_status then array['status']
    else '{}'::text[]
  end,
  financial.previous_status,
  financial.new_status,
  jsonb_build_object('legacy_action', financial.action),
  financial.created_at
from public.financial_audit_log financial
left join public.budget_envelopes budget
  on financial.entity_type = 'budget' and budget.id = financial.entity_id
left join public.expenses expense
  on financial.entity_type = 'expense' and expense.id = financial.entity_id
left join public.income_entries income
  on financial.entity_type = 'income' and income.id = financial.entity_id;
