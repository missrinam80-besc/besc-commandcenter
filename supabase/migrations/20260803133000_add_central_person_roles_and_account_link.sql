alter table public.community_people
add column account_user_id uuid references public.profiles(id) on delete set null;

create unique index community_people_org_account_idx
on public.community_people (organization_id, account_user_id)
where account_user_id is not null and deleted_at is null;

create table public.community_person_roles (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  person_id uuid not null references public.community_people(id) on delete cascade,
  role text not null check (role in (
    'member', 'board', 'volunteer', 'creator', 'streamer', 'moderator',
    'staff', 'contact', 'guest'
  )),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (person_id, role)
);

alter table public.community_person_roles enable row level security;
grant select, insert, update, delete on public.community_person_roles to authenticated;

create policy "active members read person roles"
on public.community_person_roles for select to authenticated
using (private.is_active_member(organization_id));

create policy "managers create person roles"
on public.community_person_roles for insert to authenticated
with check (private.is_org_manager(organization_id) and created_by = (select auth.uid()));

create policy "managers update person roles"
on public.community_person_roles for update to authenticated
using (private.is_org_manager(organization_id))
with check (private.is_org_manager(organization_id));

create policy "managers delete person roles"
on public.community_person_roles for delete to authenticated
using (private.is_org_manager(organization_id));

create index community_person_roles_org_role_idx
on public.community_person_roles (organization_id, role, person_id);

create index community_person_roles_created_by_idx
on public.community_person_roles (created_by);

insert into public.community_person_roles (organization_id, person_id, role, created_by)
select organization_id, id,
  case person_type
    when 'streamer' then 'streamer'
    when 'creator' then 'creator'
    when 'moderator' then 'moderator'
    when 'guest' then 'guest'
    when 'external' then 'contact'
    else 'volunteer'
  end,
  created_by
from public.community_people
on conflict do nothing;
