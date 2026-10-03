alter table public.community_person_roles
drop constraint if exists community_person_roles_role_check;

delete from public.community_person_roles old_role
where old_role.role = 'streamer'
  and exists (
    select 1
    from public.community_person_roles new_role
    where new_role.person_id = old_role.person_id
      and new_role.role = 'streamteam'
  );

update public.community_person_roles
set role = 'streamteam'
where role = 'streamer';

alter table public.community_person_roles
add constraint community_person_roles_role_check check (role in (
  'member', 'board', 'volunteer', 'creator', 'streamteam', 'moderator',
  'staff', 'contact', 'guest'
));
