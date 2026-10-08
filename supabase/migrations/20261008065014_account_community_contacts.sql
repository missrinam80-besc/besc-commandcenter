begin;
create index community_people_normalized_email_idx on public.community_people(organization_id,lower(btrim(email))) where deleted_at is null and email is not null;
-- Private maintenance only: no executable API or auth.users access is granted to clients.
create function private.ensure_account_contact(p_org uuid,p_user uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare
 person_id uuid; candidates uuid[]; v_email text; v_name text; internal_role text; has_internal boolean; has_stream boolean; author uuid;
begin
 if auth.uid() is not null and not private.is_org_admin(p_org) then raise exception 'account_contact_not_authorized' using errcode='42501'; end if;
 if not exists(select 1 from public.organization_members where organization_id=p_org and user_id=p_user) then return null; end if;
 select role::text into internal_role from public.organization_members where organization_id=p_org and user_id=p_user and status='active';
 has_internal:=found;
 has_stream:=exists(select 1 from public.portal_access where organization_id=p_org and user_id=p_user and status='active' and access_type='streamer');
 if not has_internal and not exists(select 1 from public.portal_access where organization_id=p_org and user_id=p_user and status='active') then return null; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||':'||p_user::text,0));
 select id into person_id from public.community_people where organization_id=p_org and account_user_id=p_user and deleted_at is null;
 if found then return person_id; end if;
 -- Explicit streamteam access is stronger evidence than a matching email.
 select array_agg(distinct community_person_id) into candidates from public.portal_access where organization_id=p_org and user_id=p_user and status='active' and access_type='streamer';
 if cardinality(candidates)>1 then return null; end if;
 if cardinality(candidates)=1 then
  select id into person_id from public.community_people where organization_id=p_org and id=candidates[1] and deleted_at is null and account_user_id is null for update;
  if not found then return null; end if;
 else
  select lower(btrim(email)) into v_email from auth.users where id=p_user and email_confirmed_at is not null;
  if v_email is not null then
   select array_agg(id) into candidates from public.community_people where organization_id=p_org and deleted_at is null and lower(btrim(email))=v_email;
   if cardinality(candidates)>1 then return null; end if;
   if cardinality(candidates)=1 then
    select id into person_id from public.community_people where id=candidates[1] and organization_id=p_org and account_user_id is null for update;
    if not found then return null; end if;
   end if;
  end if;
 end if;
 author:=coalesce(auth.uid(),p_user);
 if person_id is not null then
  update public.community_people set account_user_id=p_user,updated_at=now() where id=person_id and organization_id=p_org;
  -- Preserve all existing names, contact details, roles, status and history.
 else
  -- Do not silently recreate a deliberately deleted account contact.
  if exists(select 1 from public.community_people where organization_id=p_org and account_user_id=p_user and deleted_at is not null) then return null; end if;
  select left(btrim(display_name),180) into v_name from public.profiles where id=p_user;
  -- Similar names are review hints only, never identity evidence. Avoid creating a likely duplicate.
  if v_name is not null and char_length(v_name)>=2 and exists(select 1 from public.community_people where organization_id=p_org and deleted_at is null and lower(btrim(display_name))=lower(v_name)) then return null; end if;
  if v_name is null or char_length(v_name)<2 then v_name:='Naamloos account'; end if;
  insert into public.community_people(organization_id,account_user_id,display_name,email,person_type,status,created_by)
  values(p_org,p_user,v_name,v_email,case when has_internal and internal_role in ('admin','board','member') then 'crew' when not has_internal and has_stream then 'streamer' when not has_internal then 'external' else 'volunteer' end,'active',author) returning id into person_id;
  insert into public.community_person_roles(organization_id,person_id,role,created_by)
  values(p_org,person_id,case when has_internal then case internal_role when 'admin' then 'staff' when 'board' then 'board' when 'member' then 'member' else 'volunteer' end when has_stream then 'streamteam' else 'contact' end,author) on conflict do nothing;
 end if;
 insert into public.community_person_roles(organization_id,person_id,role,created_by) values(p_org,person_id,'contact',author) on conflict do nothing;
 return person_id;
end;
$$;
revoke all on function private.ensure_account_contact(uuid,uuid) from public,anon,authenticated;

create function private.sync_account_contact_from_access() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.status='active' then perform private.ensure_account_contact(new.organization_id,new.user_id); end if;
 return new;
end;
$$;
revoke all on function private.sync_account_contact_from_access() from public,anon,authenticated;
create trigger sync_member_contact after insert or update of status,role on public.organization_members for each row execute function private.sync_account_contact_from_access();
create trigger sync_portal_contact after insert or update of status,user_id,community_person_id on public.portal_access for each row execute function private.sync_account_contact_from_access();

-- A narrow admin RPC for ambiguous cases: explicitly link, never merge or transfer contacts.
create function private.link_account_contact_impl(p_organization_id uuid,p_user_id uuid,p_person_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare existing_id uuid; matched_id uuid;
begin
 if auth.uid() is null or not private.is_org_admin(p_organization_id) then raise exception 'account_contact_not_authorized' using errcode='42501'; end if;
 if not exists(select 1 from public.organization_members where organization_id=p_organization_id and user_id=p_user_id) then raise exception 'account_contact_user_unavailable' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||':'||p_user_id::text,0));
 select id into existing_id from public.community_people where organization_id=p_organization_id and account_user_id=p_user_id and deleted_at is null;
 if existing_id is not null and existing_id<>p_person_id then raise exception 'account_contact_already_linked' using errcode='42501'; end if;
 update public.community_people set account_user_id=p_user_id,updated_at=now()
 where id=p_person_id and organization_id=p_organization_id and deleted_at is null and (account_user_id is null or account_user_id=p_user_id) returning id into matched_id;
 if matched_id is null then raise exception 'account_contact_person_unavailable' using errcode='42501'; end if;
 insert into public.community_person_roles(organization_id,person_id,role,created_by) values(p_organization_id,matched_id,'contact',auth.uid()) on conflict do nothing;
 return matched_id;
end;
$$;
revoke all on function private.link_account_contact_impl(uuid,uuid,uuid) from public,anon;
grant execute on function private.link_account_contact_impl(uuid,uuid,uuid) to authenticated;
create function public.link_account_contact(p_organization_id uuid,p_user_id uuid,p_person_id uuid) returns uuid
language sql security invoker set search_path='' as $$ select private.link_account_contact_impl(p_organization_id,p_user_id,p_person_id) $$;
revoke all on function public.link_account_contact(uuid,uuid,uuid) from public,anon;
grant execute on function public.link_account_contact(uuid,uuid,uuid) to authenticated;

-- Include existing internal and external users. Ambiguous or deleted contacts need admin review.
do $$ declare account record; begin
 for account in select m.organization_id,m.user_id from public.organization_members m where m.status='active' or exists(select 1 from public.portal_access a where a.organization_id=m.organization_id and a.user_id=m.user_id and a.status='active') order by m.organization_id,m.user_id loop
  perform private.ensure_account_contact(account.organization_id,account.user_id);
 end loop;
end $$;

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
    exists(select 1 from public.organization_members where organization_id=p_organization_id and user_id=person.account_user_id and status='active')
    or exists(select 1 from public.portal_access where organization_id=p_organization_id and user_id=person.account_user_id and status='active')
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
