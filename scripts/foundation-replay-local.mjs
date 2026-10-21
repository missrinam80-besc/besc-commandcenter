import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = process.argv[2];
if (!output) throw new Error("Gebruik: node scripts/foundation-replay-local.mjs <bewijs.json>");
const db = new PGlite();
const report = { format: "besc-foundation-replay-v1", checked_at_utc: new Date().toISOString(), platform: "PGlite with isolated platform shape fixture", omissions: ["PGlite omits only CREATE EXTENSION pgcrypto; no crypto behavior is tested", "Auth, Storage and Vault service behavior is not tested"], applied: [], failure: null };
try {
  await db.exec(await readFile(path.join(root, "tests/helpers/foundation-platform-fixture.sql"), "utf8"));
  for (const name of (await readdir(path.join(root, "supabase/migrations"))).filter((name) => /^\d+_.+\.sql$/.test(name)).sort()) {
    let sql = await readFile(path.join(root, "supabase/migrations", name), "utf8");
    sql = sql.replace(/^create extension if not exists pgcrypto;\r?\n/im, "-- pgcrypto is a native-platform precondition, omitted in PGlite only.\n");
    try {
      await db.exec(sql);
      report.applied.push(name);
      if (name.startsWith("20260712190000_")) {
        await db.exec("insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000001','fixture@example.invalid'); update public.organization_members set role='admin',status='active';");
      }
    } catch (error) {
      report.failure = { file: name, message: error.message, detail: error.detail, position: error.position };
      throw error;
    }
  }
  const query = await readFile(path.join(root, "ops/foundation-readonly-audit.sql"), "utf8");
  // The migration registry is a test-only scaffold, not populated by this replay.
  await db.exec("create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key,name text);");
  const results = await db.exec(query);
  report.catalog = results.flatMap((result) => result.rows).find((row) => row.foundation_cloud_audit)?.foundation_cloud_audit;
  const effects = await db.exec(await readFile(path.join(root, "ops/foundation-effects-catalog.sql"), "utf8"));
  report.effects = effects.flatMap((result) => result.rows).find((row) => row.foundation_effects_catalog)?.foundation_effects_catalog;
  console.log(`Volledige lokale replay: ${report.applied.length} migraties.`);
} catch {
  console.error(JSON.stringify({ applied: report.applied.length, failure: report.failure }));
  process.exitCode = 1;
} finally {
  await writeFile(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  await db.close();
}
