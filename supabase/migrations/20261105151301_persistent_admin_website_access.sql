begin;
-- Explicit, site-scoped permanent grants; no accounts or access are seeded.
create table private.publication_admin_access (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 site_id uuid not null,
 user_id uuid not null references public.profiles(id),
 basis text not null check(length(btrim(basis)) between 2 and 2000),
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default clock_timestamp(),
 revoked_at timestamptz,
 foreign key(organization_id,site_id) references public.publication_sites(organization_id,id)
);
create unique index publication_one_current_admin_access
 on private.publication_admin_access(site_id,user_id) where revoked_at is null;
alter table private.publication_admin_access enable row level security;
revoke all on private.publication_admin_access from public,anon,authenticated,service_role;
comment on table private.publication_admin_access is
 'Explicit DEV website grants managed by audited operator configuration. Effective only for current active organization admins; no public or authenticated writes.';

create or replace function private.f2_viewer(s uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from public.publication_sites p
  where p.id=s and p.active and private.f2_account(p.organization_id)
  and (
   exists(select 1 from public.publication_site_viewers v
    where v.site_id=p.id and v.organization_id=p.organization_id
    and v.user_id=auth.uid() and v.revoked_at is null and v.valid_until>clock_timestamp())
   or exists(select 1 from private.publication_admin_access a
    join public.organization_members m on m.organization_id=a.organization_id and m.user_id=a.user_id
    where a.site_id=p.id and a.organization_id=p.organization_id and a.user_id=auth.uid()
    and a.revoked_at is null and m.role='admin' and m.status='active')
  )
 )
$$;
-- Preserve the existing private-only execution boundary.
revoke all on function private.f2_viewer(uuid) from public,anon,authenticated,service_role;
commit;
