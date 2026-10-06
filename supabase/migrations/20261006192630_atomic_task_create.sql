begin;
create function public.create_task_bundle(
  p_organization_id uuid, p_title text, p_description text, p_priority public.priority_level,
  p_due_at timestamptz, p_project_id uuid, p_assignee_id uuid, p_checklist text[],
  p_context_entity_type text, p_context_entity_id uuid
) returns uuid language plpgsql security invoker set search_path='' as $$
declare
  new_task uuid;
  assignment_task uuid;
  relationship_id uuid;
  context_table text;
  context_exists boolean;
  checklist_count bigint;
begin
  if not exists(select 1 from public.organization_members m where m.organization_id=p_organization_id
    and m.user_id=(select auth.uid()) and m.status='active') then
    raise exception 'task_organization_unavailable' using errcode='42501';
  end if;
  if p_title is null or char_length(trim(p_title)) not between 1 and 180
    or char_length(p_description)>5000 or char_length(array_to_string(p_checklist,E'\n'))>5000
    or exists(select 1 from unnest(p_checklist) item where item is null or char_length(trim(item)) not between 1 and 240) then
    raise exception 'task_fields_invalid' using errcode='23514';
  end if;
  if p_project_id is not null and not exists(select 1 from public.projects p
    where p.id=p_project_id and p.organization_id=p_organization_id and p.deleted_at is null) then
    raise exception 'task_project_unavailable' using errcode='42501';
  end if;
  if (p_context_entity_type is null) <> (p_context_entity_id is null) then
    raise exception 'task_context_invalid' using errcode='23514';
  end if;
  if p_context_entity_type is not null then
    context_table=case p_context_entity_type when 'project' then 'projects' when 'event' then 'events'
      when 'campaign' then 'campaigns' when 'content' then 'content_items'
      when 'partner' then 'partners' when 'community_person' then 'community_people' else null end;
    if context_table is null then raise exception 'task_context_invalid' using errcode='23514'; end if;
    execute pg_catalog.format('select exists(select 1 from public.%I where id=$1 and organization_id=$2 and deleted_at is null)',context_table)
      into context_exists using p_context_entity_id,p_organization_id;
    if not context_exists then raise exception 'task_context_unavailable' using errcode='42501'; end if;
  end if;
  insert into public.tasks(organization_id,title,description,priority,due_at,project_id,created_by)
    values(p_organization_id,trim(p_title),p_description,p_priority,p_due_at,p_project_id,(select auth.uid())) returning id into new_task;
  if new_task is null then raise exception 'task_not_created' using errcode='42501'; end if;
  if p_assignee_id is not null then
    assignment_task=public.replace_task_assignee(new_task,p_organization_id,p_assignee_id);
    if assignment_task is distinct from new_task then raise exception 'task_assignment_not_created' using errcode='42501'; end if;
  end if;
  insert into public.task_checklist_items(task_id,title,position,created_by)
    select new_task,trim(item),(ordinality-1)::integer,(select auth.uid()) from unnest(p_checklist) with ordinality as checklist(item,ordinality);
  get diagnostics checklist_count = row_count;
  if checklist_count<>coalesce(cardinality(p_checklist),0) then
    raise exception 'task_checklist_not_created' using errcode='42501';
  end if;
  if p_context_entity_type is not null then
    -- All supported context types precede 'task' in the canonical pair ordering.
    insert into public.record_relationships(organization_id,source_type,source_id,target_type,target_id,relationship_type,created_by)
      values(p_organization_id,p_context_entity_type,p_context_entity_id,'task',new_task,'related',(select auth.uid())) returning id into relationship_id;
    if relationship_id is null then raise exception 'task_relationship_not_created' using errcode='42501'; end if;
  end if;
  return new_task;
end;
$$;
revoke all on function public.create_task_bundle(uuid,text,text,public.priority_level,timestamptz,uuid,uuid,text[],text,uuid) from public,anon;
grant execute on function public.create_task_bundle(uuid,text,text,public.priority_level,timestamptz,uuid,uuid,text[],text,uuid) to authenticated;
commit;
