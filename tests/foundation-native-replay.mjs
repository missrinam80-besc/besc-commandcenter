// Native PostgreSQL schema replay, on an empty dedicated localhost fixture ONLY.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

if (process.env.PGHOST !== "127.0.0.1" || process.env.PGDATABASE !== "besc_foundation_fixture" || process.env.PGUSER !== "postgres") throw Error("Requires isolated localhost besc_foundation_fixture database");
const args = ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "--host=127.0.0.1", "--port=5432", "--username=postgres", "--dbname=besc_foundation_fixture"];
const sql = (query) => execFileSync("psql", args, { input: query, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim();
assert.equal(sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','private') and c.relkind='r'"), "0", "Refuse to modify a non-empty fixture");
assert.match(sql("show server_version"), /^17\./, "Native acceptance must use PostgreSQL 17");
sql("create schema extensions; create extension pgcrypto with schema extensions;");
sql(readFileSync(new URL("./helpers/foundation-platform-fixture.sql", import.meta.url), "utf8"));
const names = readdirSync(new URL("../supabase/migrations/", import.meta.url)).filter((name) => /^\d+_.+\.sql$/.test(name)).sort();
for (const name of names) {
  try { sql(readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8")); }
  catch (error) { throw new Error(`Native replay failed at ${name}: ${error.stderr?.toString() ?? error.message}`); }
  if (name.startsWith("20260712190000_")) sql("insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000001','fixture@example.invalid');update public.organization_members set role='admin',status='active';");
}
const effects = JSON.parse(sql(readFileSync(new URL("../ops/foundation-effects-catalog.sql", import.meta.url), "utf8")));
assert.equal(effects.read_only, "on");
assert.equal(effects.tables.length, 118);
assert.equal(effects.functions.length, 143);
assert.ok(effects.tables.every((table) => table.rls));
writeFileSync("foundation-native-effects.json", JSON.stringify({ format: "besc-native-replay-v1", migration_count: names.length, omissions: ["Auth, Storage and Vault service behavior is not tested"], effects }, null, 2) + "\n", { flag: "wx" });
console.log(`Native PostgreSQL replay passed: ${names.length} migrations, ${effects.tables.length} RLS tables, ${effects.functions.length} functions.`);
