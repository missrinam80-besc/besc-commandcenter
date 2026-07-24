import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const apply = process.argv.includes("--apply");
const sourcePath = path.resolve(process.cwd(), "../output/monday-import-dry-run.json");
const manifest = JSON.parse(await fs.readFile(sourcePath, "utf8"));

const summary = {
  projects: manifest.projects.length,
  inbox_items: manifest.inbox_items.length,
  tasks: manifest.tasks.length,
  legacy_records: manifest.legacy_records.length,
};

if (!apply) {
  console.log(JSON.stringify({ mode: "dry-run", writes: 0, sourcePath, summary }, null, 2));
  process.exit(0);
}

const required = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "BESC_ORGANIZATION_ID", "MIGRATION_ACTOR_ID"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) throw new Error(`Ontbrekende omgevingsvariabelen: ${missing.join(", ")}`);

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const organizationId = process.env.BESC_ORGANIZATION_ID;
const actorId = process.env.MIGRATION_ACTOR_ID;

async function existingTarget(sourceSystem, sourceItemId, targetTable) {
  const { data, error } = await supabase.from("migration_source_links")
    .select("target_id")
    .eq("organization_id", organizationId)
    .eq("source_system", sourceSystem)
    .eq("source_item_id", sourceItemId)
    .eq("target_table", targetTable)
    .maybeSingle();
  if (error) throw error;
  return data?.target_id ?? null;
}

async function insertWithLink(table, record, values) {
  const sourceItemId = String(record.monday_item_id);
  const external = record.external ?? record.payload ?? {};
  const sourceSystem = external.source_system === "monday-dry-run" ? "monday-dry-run" : "monday";
  const prior = await existingTarget(sourceSystem, sourceItemId, table);
  if (prior) return prior;
  const { data, error } = await supabase.from(table).insert(values).select("id").single();
  if (error) throw error;
  const { error: linkError } = await supabase.from("migration_source_links").insert({
    organization_id: organizationId,
    source_system: sourceSystem,
    source_workspace: external.workspace ?? null,
    source_board_id: external.board_id ?? null,
    source_item_id: sourceItemId,
    target_table: table,
    target_id: data.id,
    source_url: external.source_url ?? null,
    source_payload: external,
    imported_by: actorId,
  });
  if (linkError) throw linkError;
  return data.id;
}

const projectIds = new Map();
for (const record of manifest.projects) {
  const id = await insertWithLink("projects", record, {
    organization_id: organizationId, title: record.title, description: record.description,
    status: record.status, priority: record.priority, start_date: record.start_date,
    due_date: record.due_date, drive_url: record.drive_url, created_by: actorId,
    created_at: record.created_at ?? undefined,
  });
  projectIds.set(String(record.monday_item_id), id);
}

for (const record of manifest.inbox_items) {
  await insertWithLink("inbox_items", record, {
    organization_id: organizationId, title: record.title, description: record.description,
    source: record.source, status: record.status, priority: record.priority,
    created_by: actorId, created_at: record.created_at ?? undefined,
  });
}

for (const record of manifest.tasks) {
  await insertWithLink("tasks", record, {
    organization_id: organizationId, project_id: record.proposed_project_key ? projectIds.get(String(record.proposed_project_key)) ?? null : null,
    title: record.title, description: record.description, status: record.status,
    priority: record.priority, due_at: record.due_at, completed_at: record.completed_at,
    created_by: actorId, created_at: record.created_at ?? undefined,
  });
}

for (const record of manifest.legacy_records) {
  await insertWithLink("legacy_records", record, {
    organization_id: organizationId, title: record.title, category: record.category,
    suggested_module: record.suggested_module, lifecycle: record.lifecycle,
    source_status: record.source_status, payload: record.payload,
    created_by: actorId, created_at: record.created_at ?? undefined,
  });
}

console.log(JSON.stringify({ mode: "apply", summary }, null, 2));
