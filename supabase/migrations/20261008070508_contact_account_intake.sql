begin;
alter table public.partner_contacts
 add column community_person_id uuid references public.community_people(id) on delete set null,
 add column account_user_id uuid references public.profiles(id) on delete set null;
create unique index partner_contacts_person_idx on public.partner_contacts(organization_id,partner_id,community_person_id) where community_person_id is not null;
create unique index partner_contacts_account_idx on public.partner_contacts(organization_id,partner_id,account_user_id) where account_user_id is not null;

create function private.guard_partner_contact_identity() returns trigger
language plpgsql security invoker set search_path='' as $$
declare linked_account uuid; effective_account uuid;
begin
 if tg_op='UPDATE' and (new.id<>old.id or new.organization_id<>old.organization_id or new.partner_id<>old.partner_id) then
  raise exception 'contact_scope_immutable' using errcode='42501';
 end if;
 perform 1 from public.partners where id=new.partner_id and organization_id=new.organization_id and deleted_at is null for share;
 if not found then raise exception 'partner_unavailable' using errcode='42501'; end if;
 if new.community_person_id is not null then
  select account_user_id into linked_account from public.community_people where id=new.community_person_id and organization_id=new.organization_id and deleted_at is null for share;
  if not found then raise exception 'person_unavailable' using errcode='42501'; end if;
  if new.account_user_id is not null and new.account_user_id is distinct from linked_account then
   raise exception 'contact_account_conflict' using errcode='22023';
  end if;
  -- The central person remains the sole owner of this account identity.
  new.account_user_id:=null;
 elsif new.account_user_id is not null and (tg_op='INSERT' or new.account_user_id is distinct from old.account_user_id) and not exists(
  select 1 from public.organization_members where organization_id=new.organization_id and user_id=new.account_user_id and status in ('pending','active')
 ) then raise exception 'contact_account_unavailable' using errcode='42501'; end if;
 effective_account:=coalesce(linked_account,new.account_user_id);
 if effective_account is not null then
  perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text||':'||new.partner_id::text||':'||effective_account::text,0));
  if exists(select 1 from public.partner_contacts c left join public.community_people p on p.id=c.community_person_id and p.organization_id=c.organization_id
   where c.organization_id=new.organization_id and c.partner_id=new.partner_id and c.id is distinct from new.id
   and coalesce(p.account_user_id,c.account_user_id)=effective_account) then
   raise exception 'contact_account_already_linked' using errcode='23505';
  end if;
 end if;
 return new;
end $$;
revoke all on function private.guard_partner_contact_identity() from public,anon,authenticated;
create trigger partner_contact_identity_guard before insert or update on public.partner_contacts for each row execute function private.guard_partner_contact_identity();

create function public.save_partner_contact_intake(p_organization_id uuid,p_partner_id uuid,p_values jsonb,p_contact_id uuid default null)
returns uuid language plpgsql security invoker set search_path='' as $$
declare contact public.partner_contacts; saved_id uuid; person public.community_people;
begin
 if auth.uid() is null or not private.is_org_manager(p_organization_id) then raise exception 'contact_unavailable' using errcode='42501'; end if;
 if p_values is null or jsonb_typeof(p_values)<>'object' or exists(select 1 from jsonb_object_keys(p_values) k where k not in ('name','role_title','email','phone','is_primary','community_person_id','account_user_id')) then raise exception 'contact_invalid_fields' using errcode='22023'; end if;
 perform 1 from public.partners where id=p_partner_id and organization_id=p_organization_id and deleted_at is null for update;
 if not found then raise exception 'partner_unavailable' using errcode='42501'; end if;
 if p_contact_id is not null then
  select * into contact from public.partner_contacts where id=p_contact_id and organization_id=p_organization_id and partner_id=p_partner_id for update;
  if not found then raise exception 'contact_unavailable' using errcode='42501'; end if;
 else
  contact.is_primary:=false;
 end if;
 contact:=jsonb_populate_record(contact,p_values);
 if contact.community_person_id is not null then
  select * into person from public.community_people where id=contact.community_person_id and organization_id=p_organization_id and deleted_at is null for share;
  if not found then raise exception 'person_unavailable' using errcode='42501'; end if;
  if p_contact_id is null then contact.name:=person.display_name;contact.email:=person.email; end if;
 end if;
 if contact.name is null or char_length(btrim(contact.name)) not between 2 and 180 then raise exception 'contact_invalid_name' using errcode='22023'; end if;
 if contact.is_primary then update public.partner_contacts set is_primary=false,updated_at=now() where organization_id=p_organization_id and partner_id=p_partner_id and id is distinct from p_contact_id; end if;
 if p_contact_id is null then
  insert into public.partner_contacts(organization_id,partner_id,name,role_title,email,phone,is_primary,community_person_id,account_user_id,created_by)
  values(p_organization_id,p_partner_id,contact.name,contact.role_title,contact.email,contact.phone,contact.is_primary,contact.community_person_id,contact.account_user_id,auth.uid()) returning id into saved_id;
 else
  update public.partner_contacts set name=contact.name,role_title=contact.role_title,email=contact.email,phone=contact.phone,is_primary=contact.is_primary,community_person_id=contact.community_person_id,account_user_id=contact.account_user_id,updated_at=now()
  where id=p_contact_id and organization_id=p_organization_id and partner_id=p_partner_id returning id into saved_id;
 end if;
 if saved_id is null then raise exception 'contact_not_saved' using errcode='42501'; end if;
 return saved_id;
end $$;
revoke all on function public.save_partner_contact_intake(uuid,uuid,jsonb,uuid) from public,anon;
grant execute on function public.save_partner_contact_intake(uuid,uuid,jsonb,uuid) to authenticated;

create or replace function public.save_community_person_bundle(
  p_organization_id uuid, p_values jsonb, p_roles text[], p_person_id uuid default null
) returns uuid language plpgsql security invoker set search_path='' as $$
declare
  person public.community_people;
  saved_id uuid;
  roles text[];
  expected_deletes bigint;
  affected bigint;
  previous_account uuid;
begin
  if auth.uid() is null or not private.is_org_manager(p_organization_id) then
    raise exception 'community_person_unavailable' using errcode='42501';
  end if;
  if p_values is null or jsonb_typeof(p_values)<>'object' or exists(
    select 1 from jsonb_object_keys(p_values) k where k not in (
      'display_name','person_type','status','notes','drive_url','account_user_id','handle',
      'discord_handle','email','language','availability','streamteam_level','onboarding_status',
      'skills','interests','platforms'
    )
  ) or p_roles is null or exists(select 1 from unnest(p_roles) r where r is null or r not in (
    'member','board','volunteer','creator','streamteam','moderator','staff','contact','guest'
  )) then raise exception 'community_person_invalid_fields' using errcode='22023'; end if;
  select coalesce(array_agg(distinct r order by r),'{}'::text[]) into roles from unnest(p_roles) r;
  if p_person_id is not null then
    select * into person from public.community_people
    where id=p_person_id and organization_id=p_organization_id and deleted_at is null for update;
    if not found then raise exception 'community_person_unavailable' using errcode='42501'; end if;
  else
    person := jsonb_populate_record(null::public.community_people,
      '{"person_type":"volunteer","status":"candidate","onboarding_status":"not_started","skills":[],"interests":[],"platforms":[]}'::jsonb);
  end if;
  previous_account:=person.account_user_id;
  person := jsonb_populate_record(person,p_values);
  if person.display_name is null or char_length(btrim(person.display_name)) not between 2 and 180
     or char_length(coalesce(person.notes,''))>10000 then
    raise exception 'community_person_invalid_fields' using errcode='22023';
  end if;
  if person.account_user_id is not null and (p_person_id is null or person.account_user_id is distinct from previous_account) and not (
    exists(select 1 from public.organization_members where organization_id=p_organization_id and user_id=person.account_user_id and status in ('pending','active'))
    or exists(select 1 from public.portal_access where organization_id=p_organization_id and user_id=person.account_user_id and status in ('pending','active'))
  ) then raise exception 'community_account_unavailable' using errcode='42501'; end if;
  if p_person_id is null then
    insert into public.community_people(organization_id,display_name,person_type,status,notes,drive_url,
      account_user_id,handle,discord_handle,email,language,availability,streamteam_level,onboarding_status,
      skills,interests,platforms,owner_id,created_by)
    values(p_organization_id,person.display_name,person.person_type,person.status,person.notes,person.drive_url,
      person.account_user_id,person.handle,person.discord_handle,person.email,person.language,person.availability,
      person.streamteam_level,person.onboarding_status,person.skills,person.interests,person.platforms,auth.uid(),auth.uid())
    returning id into saved_id;
  else
    update public.community_people set display_name=person.display_name,person_type=person.person_type,status=person.status,
      notes=person.notes,drive_url=person.drive_url,account_user_id=person.account_user_id,handle=person.handle,
      discord_handle=person.discord_handle,email=person.email,language=person.language,availability=person.availability,
      streamteam_level=person.streamteam_level,onboarding_status=person.onboarding_status,skills=person.skills,
      interests=person.interests,platforms=person.platforms,updated_at=now()
    where id=p_person_id and organization_id=p_organization_id and deleted_at is null returning id into saved_id;
  end if;
  if saved_id is null then raise exception 'community_person_not_saved' using errcode='42501'; end if;
  select count(*) into expected_deletes from public.community_person_roles
  where person_id=saved_id and organization_id=p_organization_id;
  delete from public.community_person_roles where person_id=saved_id and organization_id=p_organization_id;
  get diagnostics affected=row_count;
  if affected<>expected_deletes then raise exception 'community_roles_not_replaced' using errcode='42501'; end if;
  insert into public.community_person_roles(organization_id,person_id,role,created_by)
  select p_organization_id,saved_id,r,auth.uid() from unnest(roles) r;
  get diagnostics affected=row_count;
  if affected<>cardinality(roles) then raise exception 'community_roles_not_replaced' using errcode='42501'; end if;
  return saved_id;
end;
$$;
revoke all on function public.save_community_person_bundle(uuid,jsonb,text[],uuid) from public,anon;
grant execute on function public.save_community_person_bundle(uuid,jsonb,text[],uuid) to authenticated;


commit;
