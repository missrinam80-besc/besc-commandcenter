import { readFile, writeFile } from "node:fs/promises";

const [localPath, cloudPath, output] = process.argv.slice(2);
if (!localPath || !cloudPath || !output) throw new Error("Gebruik: node scripts/compare-foundation-history.mjs <git.json> <cloud.json> <vergelijking.json>");
const local = JSON.parse(await readFile(localPath, "utf8"));
const cloud = JSON.parse(await readFile(cloudPath, "utf8"));
if (local.format !== "besc-foundation-baseline-v1" || cloud.format !== "besc-foundation-cloud-v1" || cloud.transaction_read_only !== "on") throw new Error("Geen herkenbare alleenlezende baseline.");
const cloudVersions = new Set(cloud.migration_history.map((row) => row.version));
const localVersions = new Set(local.migrations.map((row) => row.version));
const knownObjects = new Set([...cloud.tables, ...(cloud.views ?? []), ...cloud.functions].map((row) => `${row.schema}.${row.name}`));
const rows = local.migrations.map((row) => ({ ...row,
  registered: cloudVersions.has(row.version),
  present_search_hints: row.object_search_hints.filter((name) => knownObjects.has(name)),
  absent_search_hints: row.object_search_hints.filter((name) => !knownObjects.has(name)),
  review: cloudVersions.has(row.version) ? "registered_effects_not_verified" : "unregistered_requires_effect_review",
}));
const report = {
  format: "besc-foundation-comparison-v1", source_commit: local.source_commit, cloud_checked_at_utc: cloud.checked_at_utc,
  local_count: local.migrations.length, registered_count: cloud.migration_history.length,
  unregistered_count: rows.filter((row) => !row.registered).length,
  cloud_only: cloud.migration_history.filter((row) => !localVersions.has(row.version)),
  rows,
  warning: "Presence hints are not complete SQL-effect checks. No row authorizes history repair or replay. Check later replacements, constraints, triggers, policies, grants and data effects individually.",
};
await writeFile(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(`${report.local_count} Git-migraties; ${report.registered_count} Cloud-registraties; ${report.unregistered_count} zonder registratie; ${report.cloud_only.length} alleen in Cloud.`);
