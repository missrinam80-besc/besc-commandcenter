import fs from "node:fs/promises";
import path from "node:path";

const manifestPath = path.resolve(process.cwd(), "../output/monday-import-dry-run.json");
const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
const project = manifest.projects[0];
const inbox = manifest.inbox_items[0];
const task = manifest.tasks.find((item) => item.proposed_project_key === project.monday_item_id) ?? manifest.tasks[0];
const legacy = manifest.legacy_records[0];

const q = (value) => value == null ? "null" : `'${String(value).replaceAll("'", "''")}'`;
const json = (value) => `${q(JSON.stringify(value ?? {}))}::jsonb`;
const source = (record) => record.external ?? record.payload ?? {};
const sourceSystem = (record) => source(record).source_system === "monday-dry-run" ? "monday-dry-run" : "monday";

console.log(`do $$
declare
  v_org uuid;
  v_actor uuid;
  v_project uuid;
  v_target uuid;
begin
  select o.id into strict v_org from public.organizations o where o.slug = 'besc';
  select m.user_id into strict v_actor
  from public.organization_members m
  where m.organization_id = v_org and m.status = 'active' and m.role in ('admin','board')
  order by case m.role when 'admin' then 0 else 1 end limit 1;

  select target_id into v_project from public.migration_source_links
  where organization_id=v_org and source_system=${q(sourceSystem(project))}
    and source_item_id=${q(project.monday_item_id)} and target_table='projects';
  if v_project is null then
    insert into public.projects (organization_id,title,description,status,priority,start_date,due_date,drive_url,created_by,created_at)
    values (v_org,${q(project.title)},${q(project.description)},${q(project.status)},${q(project.priority)},${q(project.start_date)},${q(project.due_date)},${q(project.drive_url)},v_actor,coalesce(${q(project.created_at)}::timestamptz,now()))
    returning id into v_project;
    insert into public.migration_source_links (organization_id,source_system,source_workspace,source_board_id,source_item_id,target_table,target_id,source_url,source_payload,imported_by)
    values (v_org,${q(sourceSystem(project))},${q(source(project).workspace)},${q(source(project).board_id)},${q(project.monday_item_id)},'projects',v_project,${q(source(project).source_url)},${json(source(project))},v_actor);
  end if;

  if not exists (select 1 from public.migration_source_links where organization_id=v_org and source_system=${q(sourceSystem(inbox))} and source_item_id=${q(inbox.monday_item_id)} and target_table='inbox_items') then
    insert into public.inbox_items (organization_id,title,description,source,status,priority,created_by,created_at)
    values (v_org,${q(inbox.title)},${q(inbox.description)},${q(inbox.source)},${q(inbox.status)},${q(inbox.priority)},v_actor,coalesce(${q(inbox.created_at)}::timestamptz,now())) returning id into v_target;
    insert into public.migration_source_links (organization_id,source_system,source_workspace,source_board_id,source_item_id,target_table,target_id,source_url,source_payload,imported_by)
    values (v_org,${q(sourceSystem(inbox))},${q(source(inbox).workspace)},${q(source(inbox).board_id)},${q(inbox.monday_item_id)},'inbox_items',v_target,${q(source(inbox).source_url)},${json(source(inbox))},v_actor);
  end if;

  if not exists (select 1 from public.migration_source_links where organization_id=v_org and source_system=${q(sourceSystem(task))} and source_item_id=${q(task.monday_item_id)} and target_table='tasks') then
    insert into public.tasks (organization_id,project_id,title,description,status,priority,due_at,completed_at,created_by,created_at)
    values (v_org,v_project,${q(task.title)},${q(task.description)},${q(task.status)},${q(task.priority)},${q(task.due_at)}::timestamptz,${q(task.completed_at)}::timestamptz,v_actor,coalesce(${q(task.created_at)}::timestamptz,now())) returning id into v_target;
    insert into public.migration_source_links (organization_id,source_system,source_workspace,source_board_id,source_item_id,target_table,target_id,source_url,source_payload,imported_by)
    values (v_org,${q(sourceSystem(task))},${q(source(task).workspace)},${q(source(task).board_id)},${q(task.monday_item_id)},'tasks',v_target,${q(source(task).source_url)},${json(source(task))},v_actor);
  end if;

  if not exists (select 1 from public.migration_source_links where organization_id=v_org and source_system=${q(sourceSystem(legacy))} and source_item_id=${q(legacy.monday_item_id)} and target_table='legacy_records') then
    insert into public.legacy_records (organization_id,title,category,suggested_module,lifecycle,source_status,payload,created_by,created_at)
    values (v_org,${q(legacy.title)},${q(legacy.category)},${q(legacy.suggested_module)},${q(legacy.lifecycle)},${q(legacy.source_status)},${json(legacy.payload)},v_actor,coalesce(${q(legacy.created_at)}::timestamptz,now())) returning id into v_target;
    insert into public.migration_source_links (organization_id,source_system,source_workspace,source_board_id,source_item_id,target_table,target_id,source_url,source_payload,imported_by)
    values (v_org,${q(sourceSystem(legacy))},${q(source(legacy).workspace)},${q(source(legacy).board_id)},${q(legacy.monday_item_id)},'legacy_records',v_target,${q(source(legacy).source_url)},${json(source(legacy))},v_actor);
  end if;
end $$;`);
