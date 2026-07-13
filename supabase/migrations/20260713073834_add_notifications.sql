create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null check(char_length(title) between 1 and 180),
  body text,
  entity_type public.entity_kind,
  entity_id uuid,
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.notifications enable row level security;
grant select,insert,update,delete on public.notifications to authenticated;
create policy "users read own notifications" on public.notifications for select to authenticated using (user_id=(select auth.uid()) and private.is_active_member(organization_id));
create policy "members create organization notifications" on public.notifications for insert to authenticated with check (private.is_active_member(organization_id) and exists(select 1 from public.organization_members recipient where recipient.organization_id=notifications.organization_id and recipient.user_id=notifications.user_id and recipient.status='active'));
create policy "users update own notifications" on public.notifications for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()) and private.is_active_member(organization_id));
create policy "users delete own notifications" on public.notifications for delete to authenticated using (user_id=(select auth.uid()));
create index notifications_user_unread_idx on public.notifications(user_id,created_at desc) where read_at is null;
