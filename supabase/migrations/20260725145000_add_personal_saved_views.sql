create table public.saved_views (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  module text not null check (
    module in (
      'inbox',
      'tasks',
      'projects',
      'content',
      'events',
      'sponsors',
      'campagnes',
      'community',
      'social',
      'historiek'
    )
  ),
  name text not null check (char_length(trim(name)) between 2 and 80),
  query_params jsonb not null default '{}'::jsonb check (jsonb_typeof(query_params) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, module, name)
);

alter table public.saved_views enable row level security;
grant select, insert, update, delete on public.saved_views to authenticated;

create policy "users read own saved views"
on public.saved_views for select
to authenticated
using (
  (select auth.uid()) = user_id
  and private.is_active_member(organization_id)
);

create policy "users create own saved views"
on public.saved_views for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and private.is_active_member(organization_id)
);

create policy "users update own saved views"
on public.saved_views for update
to authenticated
using (
  (select auth.uid()) = user_id
  and private.is_active_member(organization_id)
)
with check (
  (select auth.uid()) = user_id
  and private.is_active_member(organization_id)
);

create policy "users delete own saved views"
on public.saved_views for delete
to authenticated
using (
  (select auth.uid()) = user_id
  and private.is_active_member(organization_id)
);

create index saved_views_user_module_idx
on public.saved_views(user_id, module, created_at desc);
