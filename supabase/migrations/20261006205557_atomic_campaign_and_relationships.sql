begin;

-- Shared transaction locks serialize relationship creation with dossier deletion.
-- They require SELECT access only: readers do not gain UPDATE rights on targets.
create or replace function private.lock_active_relationship_dossier(p_org uuid, p_type text, p_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare table_name text; available boolean;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'relationship writes require read committed isolation';
  end if;
  table_name := case p_type
    when 'project' then 'projects' when 'event' then 'events'
    when 'campaign' then 'campaigns' when 'content' then 'content_items'
    when 'partner' then 'partners' when 'community_person' then 'community_people'
    when 'task' then 'tasks' else null end;
  if table_name is null or p_org is null or p_id is null then
    raise exception 'invalid relationship dossier';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('besc:dossier:' || p_type || ':' || p_id::text, 0));
  -- A separate statement after acquiring the lock sees a deletion committed while waiting.
  execute pg_catalog.format('select exists(select 1 from public.%I where organization_id=$1 and id=$2 and deleted_at is null)', table_name)
    into available using p_org, p_id;
  if not available then raise exception 'relationship dossier unavailable'; end if;
end;
$$;
revoke all on function private.lock_active_relationship_dossier(uuid,text,uuid) from public, anon;
grant execute on function private.lock_active_relationship_dossier(uuid,text,uuid) to authenticated, service_role;

create or replace function private.guard_relationship_dossiers()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare endpoint record;
begin
  -- Lock both ends in the same order even when the stored relation is reversed.
  -- Other legacy entity types retain their existing behavior; the seven dossier UI types are guarded.
  for endpoint in
    select type, id from (values (new.source_type,new.source_id),(new.target_type,new.target_id)) as ends(type,id)
    where type in ('project','event','campaign','content','partner','community_person','task')
    order by type collate "C", id
  loop
    perform private.lock_active_relationship_dossier(new.organization_id, endpoint.type, endpoint.id);
  end loop;
  return new;
end;
$$;
revoke all on function private.guard_relationship_dossiers() from public, anon;
create trigger guard_relationship_dossiers
  before insert or update of organization_id,source_type,source_id,target_type,target_id
  on public.record_relationships for each row execute function private.guard_relationship_dossiers();

create or replace function private.lock_relationship_dossier_deletion()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('besc:dossier:' || tg_argv[0] || ':' || old.id::text, 0));
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.lock_relationship_dossier_deletion() from public, anon;
do $$
declare dossier record;
begin
  for dossier in select * from (values
    ('projects','project'),('events','event'),('campaigns','campaign'),('content_items','content'),
    ('partners','partner'),('community_people','community_person'),('tasks','task')) as dossiers(table_name,entity_type)
  loop
    execute pg_catalog.format('create trigger lock_relationship_dossier_deletion before update of deleted_at or delete on public.%I for each row execute function private.lock_relationship_dossier_deletion(%L)', dossier.table_name, dossier.entity_type);
  end loop;
end;
$$;

create or replace function public.create_campaign_bundle(p_organization_id uuid, p_values jsonb, p_deliverables text[] default '{}')
returns uuid language plpgsql security invoker set search_path = '' as $$
declare campaign public.campaigns%rowtype; created uuid; inserted uuid; affected integer; target record;
begin
  if auth.uid() is null or not private.is_org_manager(p_organization_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_values is null or jsonb_typeof(p_values) <> 'object' or exists(
    select 1 from jsonb_object_keys(p_values) as keys(key) where key not in (
      'title','campaign_type','status','priority','notes','start_date','end_date','drive_url','channels',
      'project_id','event_id','partner_id','budget','value','reporting_status','results_summary','impressions','clicks')) then
    raise exception 'invalid campaign fields';
  end if;
  if p_deliverables is null or cardinality(p_deliverables)>100 or exists(
    select 1 from unnest(p_deliverables) title where title is null or char_length(trim(title)) not between 2 and 240) then
    raise exception 'invalid deliverables';
  end if;
  campaign := jsonb_populate_record(null::public.campaigns, jsonb_build_object(
    'campaign_type','social','status','idea','priority','normal','reporting_status','not_required','channels','[]'::jsonb) || p_values);
  if campaign.title is null or char_length(trim(campaign.title)) not between 3 and 180
    or char_length(campaign.notes)>10000 or campaign.budget<0 or campaign.value<0 then
    raise exception 'invalid campaign values';
  end if;
  -- Validate and lock selected context dossiers before creating any campaign rows.
  for target in select * from (values ('event',campaign.event_id),('partner',campaign.partner_id),('project',campaign.project_id)) as targets(type,id)
    where id is not null order by type collate "C", id
  loop
    perform private.lock_active_relationship_dossier(p_organization_id,target.type,target.id);
  end loop;
  insert into public.campaigns(organization_id,title,campaign_type,status,priority,notes,start_date,end_date,drive_url,channels,
    project_id,event_id,partner_id,budget,value,reporting_status,results_summary,impressions,clicks,owner_id,created_by)
  values(p_organization_id,trim(campaign.title),campaign.campaign_type,campaign.status,campaign.priority,campaign.notes,
    campaign.start_date,campaign.end_date,campaign.drive_url,campaign.channels,campaign.project_id,campaign.event_id,campaign.partner_id,
    campaign.budget,campaign.value,campaign.reporting_status,campaign.results_summary,campaign.impressions,campaign.clicks,auth.uid(),auth.uid())
  returning id into created;
  if created is null then raise exception 'campaign not created'; end if;
  insert into public.campaign_deliverables(organization_id,campaign_id,title,created_by)
    select p_organization_id,created,trim(title),auth.uid() from unnest(p_deliverables) title;
  get diagnostics affected = row_count;
  if affected <> cardinality(p_deliverables) then raise exception 'deliverables not created'; end if;
  for target in select * from (values ('project',campaign.project_id,'part_of'),('event',campaign.event_id,'supports'),('partner',campaign.partner_id,'sponsor')) as targets(type,id,relation)
    where id is not null
  loop
    inserted := null;
    insert into public.record_relationships(organization_id,source_type,source_id,target_type,target_id,relationship_type,created_by)
      values(p_organization_id,'campaign',created,target.type,target.id,target.relation,auth.uid()) returning id into inserted;
    if inserted is null then raise exception 'relationship not created'; end if;
  end loop;
  return created;
end;
$$;
revoke all on function public.create_campaign_bundle(uuid,jsonb,text[]) from public, anon;
grant execute on function public.create_campaign_bundle(uuid,jsonb,text[]) to authenticated;

commit;
