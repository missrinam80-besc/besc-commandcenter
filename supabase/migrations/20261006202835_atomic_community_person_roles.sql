begin;
create function public.save_community_person_bundle(
  p_organization_id uuid, p_values jsonb, p_roles text[], p_person_id uuid default null
) returns uuid language plpgsql security invoker set search_path='' as $$
declare
  person public.community_people;
  saved_id uuid;
  roles text[];
  expected_deletes bigint;
  affected bigint;
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
  person := jsonb_populate_record(person,p_values);
  if person.display_name is null or char_length(btrim(person.display_name)) not between 2 and 180
     or char_length(coalesce(person.notes,''))>10000 then
    raise exception 'community_person_invalid_fields' using errcode='22023';
  end if;
  if person.account_user_id is not null and not exists(select 1 from public.organization_members
    where organization_id=p_organization_id and user_id=person.account_user_id and status='active') then
    raise exception 'community_account_unavailable' using errcode='42501';
  end if;
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
