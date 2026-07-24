import fs from "node:fs/promises";
import path from "node:path";

const args = Object.fromEntries(process.argv.slice(2).map((arg) => arg.split("=")));
const kind = args.kind;
const offset = Number(args.offset ?? 0);
const limit = Number(args.limit ?? 20);
const allowed = new Set(["projects", "inbox_items", "tasks", "legacy_records"]);
if (!allowed.has(kind) || !Number.isInteger(offset) || !Number.isInteger(limit) || offset < 0 || limit < 1) {
  throw new Error("Gebruik: kind=projects|inbox_items|tasks|legacy_records offset=0 limit=20");
}

const manifestPath = path.resolve(process.cwd(), "../output/monday-import-dry-run.json");
const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
const records = manifest[kind].slice(offset, offset + limit);
const q = (value) => value == null ? "null" : `'${String(value).replaceAll("'", "''")}'`;
const json = (value) => `${q(JSON.stringify(value ?? {}))}::jsonb`;
const external = (record) => record.external ?? record.payload ?? {};
const sourceSystem = (record) => external(record).source_system === "monday-dry-run" ? "monday-dry-run" : "monday";

function linkSql(record, table) {
  const ext = external(record);
  return `insert into public.migration_source_links
    (organization_id,source_system,source_workspace,source_board_id,source_item_id,target_table,target_id,source_url,source_payload,imported_by)
    values (v_org,${q(sourceSystem(record))},${q(ext.workspace)},${q(ext.board_id)},${q(record.monday_item_id)},${q(table)},v_target,${q(ext.source_url)},${json(ext)},v_actor);`;
}

function recordSql(record) {
  const exists = `not exists (select 1 from public.migration_source_links where organization_id=v_org and source_system=${q(sourceSystem(record))} and source_item_id=${q(record.monday_item_id)} and target_table=${q(kind)})`;
  if (kind === "projects") return `if ${exists} then
    insert into public.projects (organization_id,title,description,status,priority,start_date,due_date,drive_url,created_by,created_at)
    values (v_org,${q(record.title)},${q(record.description)},${q(record.status)},${q(record.priority)},${q(record.start_date)},${q(record.due_date)},${q(record.drive_url)},v_actor,coalesce(${q(record.created_at)}::timestamptz,now())) returning id into v_target;
    ${linkSql(record, kind)}
  end if;`;
  if (kind === "inbox_items") return `if ${exists} then
    insert into public.inbox_items (organization_id,title,description,source,status,priority,created_by,created_at)
    values (v_org,${q(record.title)},${q(record.description)},${q(record.source)},${q(record.status)},${q(record.priority)},v_actor,coalesce(${q(record.created_at)}::timestamptz,now())) returning id into v_target;
    ${linkSql(record, kind)}
  end if;`;
  if (kind === "tasks") return `if ${exists} then
    v_project := null;
    ${record.proposed_project_key ? `select target_id into v_project from public.migration_source_links where organization_id=v_org and target_table='projects' and source_item_id=${q(record.proposed_project_key)} limit 1;` : ""}
    insert into public.tasks (organization_id,project_id,title,description,status,priority,due_at,completed_at,created_by,created_at)
    values (v_org,v_project,${q(record.title)},${q(record.description)},${q(record.status)},${q(record.priority)},${q(record.due_at)}::timestamptz,${q(record.completed_at)}::timestamptz,v_actor,coalesce(${q(record.created_at)}::timestamptz,now())) returning id into v_target;
    ${linkSql(record, kind)}
  end if;`;
  return `if ${exists} then
    insert into public.legacy_records (organization_id,title,category,suggested_module,lifecycle,source_status,payload,created_by,created_at)
    values (v_org,${q(record.title)},${q(record.category)},${q(record.suggested_module)},${q(record.lifecycle)},${q(record.source_status)},${json(record.payload)},v_actor,coalesce(${q(record.created_at)}::timestamptz,now())) returning id into v_target;
    ${linkSql(record, kind)}
  end if;`;
}

console.log(`do $$
declare
  v_org uuid;
  v_actor uuid;
  v_target uuid;
  v_project uuid;
begin
  select id into strict v_org from public.organizations where slug='besc';
  select user_id into strict v_actor from public.organization_members
  where organization_id=v_org and status='active' and role in ('admin','board')
  order by case role when 'admin' then 0 else 1 end limit 1;
  ${records.map(recordSql).join("\n  ")}
end $$;`);
