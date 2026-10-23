// Native PostgreSQL schema replay, on an empty dedicated localhost fixture ONLY.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

if (process.env.PGHOST !== "127.0.0.1" || process.env.PGDATABASE !== "besc_foundation_fixture" || process.env.PGUSER !== "postgres") throw Error("Requires isolated localhost besc_foundation_fixture database");
const args = ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "--host=127.0.0.1", "--port=5432", "--username=postgres", "--dbname=besc_foundation_fixture"];
const sql = (query) => execFileSync("psql", args, { input: query, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim();
assert.equal(sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','private') and c.relkind='r'"), "0", "Refuse to modify a non-empty fixture");
assert.match(sql("show server_version"), /^17\./, "Native acceptance must use PostgreSQL 17");
sql("create schema extensions; create extension pgcrypto with schema extensions;");
sql(readFileSync(new URL("./helpers/foundation-platform-fixture.sql", import.meta.url), "utf8"));
const names = readdirSync(new URL("../supabase/migrations/", import.meta.url)).filter((name) => /^\d+_.+\.sql$/.test(name)).sort();
const migrations = names.map((file) => ({ file, version: file.split("_")[0], sha256_lf: createHash("sha256").update(readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8").replaceAll("\r\n", "\n")).digest("hex") }));
for (const name of names) {
  if (name.endsWith('_f1_identity_authority.sql')) {
    const base = JSON.parse(sql(readFileSync(new URL('../ops/foundation-effects-catalog.sql', import.meta.url), 'utf8')));
    assert.equal(base.tables.length, 118, 'Unchanged historical schema before F1');
    assert.equal(base.functions.length, 143, 'Unchanged historical functions before F1');
  }
  if (name.endsWith('_f2_staging_publication.sql')) {
    const beforeF2 = JSON.parse(sql(readFileSync(new URL('../ops/foundation-effects-catalog.sql', import.meta.url), 'utf8')));
    assert.equal(beforeF2.tables.length, 130, 'F1 baseline preserved before F2');
  }
  if (name.endsWith('_f3_campaign_pilot.sql')) {
    const beforeF3 = JSON.parse(sql(readFileSync(new URL('../ops/foundation-effects-catalog.sql', import.meta.url), 'utf8')));
    assert.equal(beforeF3.tables.length, 136, 'F2 baseline preserved before F3');
  }
  if (name.endsWith('_f4_creator_platform.sql')) {
    const beforeF4 = JSON.parse(sql(readFileSync(new URL('../ops/foundation-effects-catalog.sql', import.meta.url), 'utf8')));
    assert.equal(beforeF4.tables.length, 147, 'F3 baseline preserved before F4');
  }
  if (name.endsWith('_f4_private_intake.sql')) {
    const beforeIntake = JSON.parse(sql(readFileSync(new URL('../ops/foundation-effects-catalog.sql', import.meta.url), 'utf8')));
    assert.equal(beforeIntake.tables.length, 154, 'Creator baseline preserved before private intake');
  }
  if (name.endsWith('_f4_partner_publications.sql')) {
    const beforePartner = JSON.parse(sql(readFileSync(new URL('../ops/foundation-effects-catalog.sql', import.meta.url), 'utf8')));
    assert.equal(beforePartner.tables.length, 158, 'Creator and intake baseline preserved before partner publication');
  }
  if (name.endsWith('_f4_vacancies_applications.sql')) {
    const beforeVacancy = JSON.parse(sql(readFileSync(new URL('../ops/foundation-effects-catalog.sql', import.meta.url), 'utf8')));
    assert.equal(beforeVacancy.tables.length,161,'Partner baseline preserved before vacancies');
  }
  if (name.endsWith('_f4_partner_delegation.sql')) {
    const beforeDelegation = JSON.parse(sql(readFileSync(new URL('../ops/foundation-effects-catalog.sql', import.meta.url), 'utf8')));
    assert.equal(beforeDelegation.tables.length,165,'Vacancy baseline preserved before delegation');
  }
  try { sql(readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8")); }
  catch (error) { throw new Error(`Native replay failed at ${name}: ${error.stderr?.toString() ?? error.message}`); }
  if (name.startsWith("20260712190000_")) sql("insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000001','fixture@example.invalid');update public.organization_members set role='admin',status='active';");
}
const effects = JSON.parse(sql(readFileSync(new URL("../ops/foundation-effects-catalog.sql", import.meta.url), "utf8")));
assert.equal(effects.read_only, "on");
assert.equal(effects.tables.length, 168); // F3 baseline plus creator, intake, partner, vacancy and three delegation tables.
assert.ok(effects.functions.length > 143);
const privateOperations=['f1_context','f1_receipts','f2_receipts','campaign_pilots','campaign_access','campaign_policies','campaign_participants','campaign_contributions','campaign_measurements','campaign_receipts','campaign_events','campaign_report_revisions','campaign_sources','campaign_source_runs','platform_settings','platform_access','creator_profiles','creator_revisions','creator_entries','f4_receipts','f4_limits','intake_forms','intake_handlers','platform_applications','application_events','partner_publication_settings','partner_publication_revisions','partner_publication_entries','vacancy_settings','vacancy_dossiers','vacancy_revisions','vacancy_entries','partner_delegation_settings','partner_delegations','partner_profile_proposals'];
assert.ok(effects.tables.every((table) => table.rls || (table.schema === 'private' && privateOperations.includes(table.name))));
assert.ok(effects.tables.filter(table=>table.schema==='private'&&privateOperations.includes(table.name)).every(table=>Object.values(table.grants).every(grants=>Object.values(grants).every(value=>value===false))), 'Private operation tables have no client grants; existing private service grants remain unchanged');
const dataState = JSON.parse(sql(readFileSync(new URL("../ops/foundation-data-state.sql", import.meta.url), "utf8")));
assert.equal(dataState.guideline_titles_missing, 0);
assert.equal(dataState.eligible_accounts_without_active_contact, 0);
writeFileSync("foundation-native-effects.json", JSON.stringify({ format: "besc-native-replay-v1", source_commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), migrations, migration_count: names.length, omissions: ["Auth, Storage and Vault service behavior is not tested"], effects, data_state: dataState }, null, 2) + "\n", { flag: "wx" });
console.log(`Native PostgreSQL replay passed: ${names.length} migrations, ${effects.tables.length} RLS tables, ${effects.functions.length} functions.`);
