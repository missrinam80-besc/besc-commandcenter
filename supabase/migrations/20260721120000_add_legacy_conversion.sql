alter table public.legacy_records
  add column converted_target_table text,
  add column converted_target_id uuid,
  add column converted_at timestamptz,
  add constraint legacy_records_conversion_complete check (
    (converted_target_table is null and converted_target_id is null and converted_at is null)
    or
    (converted_target_table in ('inbox_items','tasks','projects') and converted_target_id is not null and converted_at is not null)
  );

create index legacy_records_conversion_idx
  on public.legacy_records (organization_id, converted_target_table, converted_at)
  where deleted_at is null;

create or replace function public.convert_legacy_record(
  p_record_id uuid,
  p_target_table text,
  p_title text,
  p_description text default null,
  p_priority public.priority_level default 'normal',
  p_project_id uuid default null
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  legacy public.legacy_records%rowtype;
  source_link public.migration_source_links%rowtype;
  new_id uuid;
begin
  select * into legacy
  from public.legacy_records
  where id = p_record_id and deleted_at is null
  for update;

  if not found then raise exception 'historical record not found'; end if;
  if not private.is_org_manager(legacy.organization_id) then raise exception 'not authorized'; end if;
  if legacy.converted_target_id is not null then raise exception 'historical record already converted'; end if;
  if length(trim(p_title)) < 3 then raise exception 'title is too short'; end if;

  if p_target_table = 'inbox_items' then
    insert into public.inbox_items (organization_id,title,description,source,priority,created_by)
    values (legacy.organization_id,trim(p_title),nullif(trim(p_description),''),'monday',p_priority,(select auth.uid()))
    returning id into new_id;
  elsif p_target_table = 'tasks' then
    if p_project_id is not null and not exists (
      select 1 from public.projects where id=p_project_id and organization_id=legacy.organization_id and deleted_at is null
    ) then raise exception 'project not found'; end if;
    insert into public.tasks (organization_id,project_id,title,description,priority,created_by)
    values (legacy.organization_id,p_project_id,trim(p_title),nullif(trim(p_description),''),p_priority,(select auth.uid()))
    returning id into new_id;
  elsif p_target_table = 'projects' then
    insert into public.projects (organization_id,title,description,status,priority,owner_id,created_by)
    values (legacy.organization_id,trim(p_title),nullif(trim(p_description),''),'planned',p_priority,(select auth.uid()),(select auth.uid()))
    returning id into new_id;
  else
    raise exception 'unsupported target table';
  end if;

  select * into source_link from public.migration_source_links
  where target_table='legacy_records' and target_id=legacy.id
  order by imported_at desc limit 1;

  if source_link.id is not null then
    insert into public.migration_source_links (
      organization_id,source_system,source_workspace,source_board_id,source_item_id,
      target_table,target_id,source_url,source_payload,imported_by
    ) values (
      legacy.organization_id,source_link.source_system,source_link.source_workspace,
      source_link.source_board_id,source_link.source_item_id,p_target_table,new_id,
      source_link.source_url,source_link.source_payload,(select auth.uid())
    );
  end if;

  update public.legacy_records set
    converted_target_table=p_target_table,
    converted_target_id=new_id,
    converted_at=now(),
    lifecycle='completed',
    updated_at=now()
  where id=legacy.id;

  return new_id;
end;
$$;

revoke all on function public.convert_legacy_record(uuid,text,text,text,public.priority_level,uuid) from public;
grant execute on function public.convert_legacy_record(uuid,text,text,text,public.priority_level,uuid) to authenticated;
