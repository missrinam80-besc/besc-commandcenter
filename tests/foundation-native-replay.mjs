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
  if (name.endsWith('_f4_pages_content_redirects.sql')) {
    const beforeContent = JSON.parse(sql(readFileSync(new URL('../ops/foundation-effects-catalog.sql', import.meta.url), 'utf8')));
    assert.equal(beforeContent.tables.length,168,'Delegation baseline preserved before information pages');
  }
  if (name.endsWith('_f4_general_contact.sql')) {
    const beforeContact = JSON.parse(sql(readFileSync(new URL('../ops/foundation-effects-catalog.sql', import.meta.url), 'utf8')));
    assert.equal(beforeContact.tables.length,174,'Content baseline preserved before general contact');
  }
  if (name.endsWith('_f5_campaign_extensions_and_reconciliation.sql')) {
    const beforeF5 = JSON.parse(sql(readFileSync(new URL('../ops/foundation-effects-catalog.sql', import.meta.url), 'utf8')));
    assert.equal(beforeF5.tables.length,175,'F4 baseline preserved before three F5 private tables');
  }
  if (name.endsWith('_f6_explicit_public_read_channels.sql')) {
    const beforeF6 = JSON.parse(sql(readFileSync(new URL('../ops/foundation-effects-catalog.sql', import.meta.url), 'utf8')));
    assert.equal(beforeF6.tables.length,178,'Existing F5 baseline preserved before two private F6 tables');
  }
  if (name.endsWith('_workspace_record_archive.sql')) {
    const beforeArchive = JSON.parse(sql(readFileSync(new URL('../ops/foundation-effects-catalog.sql', import.meta.url), 'utf8')));
    assert.equal(beforeArchive.tables.length, 180, 'F6 baseline preserved before workspace archive');
  }
  if(name.endsWith('_discord_event_publication_and_presence.sql'))assert.equal(JSON.parse(sql(readFileSync(new URL('../ops/foundation-effects-catalog.sql',import.meta.url),'utf8'))).tables.length,181);
  if(name.endsWith('_re02_verified_earning.sql'))assert.equal(JSON.parse(sql(readFileSync(new URL('../ops/foundation-effects-catalog.sql',import.meta.url),'utf8'))).tables.length,186,'RE01 baseline preserved before RE02');
  if(name.endsWith('_re03_controlled_balance_transfer.sql'))assert.equal(JSON.parse(sql(readFileSync(new URL('../ops/foundation-effects-catalog.sql',import.meta.url),'utf8'))).tables.length,191,'RE02 adds exactly five private tables');
  if(name.endsWith('_step11_agent_workflows.sql'))assert.equal(JSON.parse(sql(readFileSync(new URL('../ops/foundation-effects-catalog.sql',import.meta.url),'utf8'))).tables.length,193,'RE02/RE03 baseline preserved before step 11');
  if(name.endsWith('_social_sync_notifications.sql'))assert.equal(JSON.parse(sql(readFileSync(new URL('../ops/foundation-effects-catalog.sql',import.meta.url),'utf8'))).tables.length,197,'Existing schema preserved before social notification state');
  if(name.endsWith('_creator_youtube_consent_kernel.sql'))assert.equal(JSON.parse(sql(readFileSync(new URL('../ops/foundation-effects-catalog.sql',import.meta.url),'utf8'))).tables.length,198,'Existing schema preserved before five private creator consent tables');
  if(name.endsWith('_social_inbox_local.sql'))assert.equal(JSON.parse(sql(readFileSync(new URL('../ops/foundation-effects-catalog.sql',import.meta.url),'utf8'))).tables.length,206,'Publication and historical schema preserved before three private social inbox tables');
  if(name.endsWith('_instagram_publication_local.sql'))assert.equal(JSON.parse(sql(readFileSync(new URL('../ops/foundation-effects-catalog.sql',import.meta.url),'utf8'))).tables.length,204,'Creator and historical schema preserved before two private Instagram publication tables');
  if(name.endsWith('_resumable_inbox_local.sql'))assert.equal(JSON.parse(sql(readFileSync(new URL('../ops/foundation-effects-catalog.sql',import.meta.url),'utf8'))).tables.length,209,'All historical tables preserved before resumable inbox');
  try { sql(readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8")); }
  catch (error) { throw new Error(`Native replay failed at ${name}: ${error.stderr?.toString() ?? error.message}`); }
  if (name.startsWith("20260712190000_")) sql("insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000001','fixture@example.invalid');update public.organization_members set role='admin',status='active';");
}
const effects = JSON.parse(sql(readFileSync(new URL("../ops/foundation-effects-catalog.sql", import.meta.url), "utf8")));
assert.equal(effects.read_only, "on");
assert.equal(effects.tables.length,212); // All 209 historical tables plus three private progress tables.
const resumableTables=['rs_jobs','rs_receipts','rs_events'];
assert.deepEqual(effects.tables.filter(t=>t.schema==='private'&&t.name.startsWith('rs_')).map(t=>t.name).sort(),resumableTables.toSorted());
for(const name of resumableTables){
 const table=effects.tables.find(t=>t.schema==='private'&&t.name===name);assert.ok(table?.rls);
 for(const role of ['anon','authenticated','service_role'])assert.ok(Object.values(table.grants[role]).every(v=>v===false),`${name}: no direct ${role} grants`);
}
for(const [schema,name,definer,authenticated,service]of [
 ['public','inbox_sync_owner',false,true,false],['public','inbox_sync_server',false,false,true],
 ['private','rs_owner',true,true,false],['private','rs_server',true,false,true],['private','rs_access',true,false,false],
 ['private','rs_initial',false,false,false],['private','rs_checkpoint_valid',false,false,false],
]){
 const fn=effects.functions.find(f=>f.schema===schema&&f.name===name);assert.ok(fn);assert.equal(fn.security_definer,definer);
 assert.ok(fn.settings?.includes('search_path=""'));assert.equal(fn.anon_execute,false);assert.equal(fn.authenticated_execute,authenticated);assert.equal(fn.service_role_execute,service);
}
const inboxTables=['si_threads','si_messages','si_events'];
assert.deepEqual(effects.tables.filter(t=>t.schema==='private'&&t.name.startsWith('si_')).map(t=>t.name).sort(),inboxTables.toSorted());
for(const name of inboxTables){
 const table=effects.tables.find(t=>t.schema==='private'&&t.name===name);assert.ok(table?.rls,`${name} has RLS`);
 for(const role of ['anon','authenticated','service_role'])assert.ok(Object.values(table.grants[role]).every(v=>v===false),`${name} has no direct ${role} grants`);
}
for(const [schema,name,definer,authenticated,service]of [
 ['public','social_inbox_owner',false,true,false],['public','social_inbox_ingest',false,false,true],
 ['private','si_owner',true,true,false],['private','si_ingest',true,false,true],['private','si_manager',true,false,false],
]){
 const fn=effects.functions.find(f=>f.schema===schema&&f.name===name);assert.ok(fn);assert.equal(fn.security_definer,definer);
 assert.ok(fn.settings?.includes('search_path=""'));assert.equal(fn.anon_execute,false);assert.equal(fn.authenticated_execute,authenticated);assert.equal(fn.service_role_execute,service);
}
const instagramTables=['ig_publications','ig_publication_events'];
assert.deepEqual(effects.tables.filter(t=>t.schema==='private'&&t.name.startsWith('ig_')).map(t=>t.name).sort(),instagramTables.toSorted());
for(const name of instagramTables){
 const table=effects.tables.find(t=>t.schema==='private'&&t.name===name);
 assert.ok(table?.rls,`${name} has RLS`);
 for(const role of ['anon','authenticated','service_role'])assert.ok(Object.values(table.grants[role]).every(allowed=>allowed===false),`${name} has no direct ${role} grants`);
}
for(const [schema,name,definer,authenticated,service]of [
 ['public','instagram_publication_owner',false,true,false],['public','instagram_publication_server',false,false,true],
 ['private','ig_publication_owner',true,true,false],['private','ig_publication_server',true,false,true],
 ['private','ig_publication_current',true,false,false],['private','guard_instagram_inflight_source',true,false,false],
]){
 const fn=effects.functions.find(f=>f.schema===schema&&f.name===name);
 assert.ok(fn,`${schema}.${name} exists`);assert.equal(fn.security_definer,definer);
 assert.ok(fn.settings?.includes('search_path=""'),`${name} has an empty search path`);
 assert.equal(fn.anon_execute,false);assert.equal(fn.authenticated_execute,authenticated);assert.equal(fn.service_role_execute,service);
}
const creatorTables=['cy_links','cy_credentials','cy_jobs','cy_samples','cy_events','cy_authorization_closures'];
assert.deepEqual(effects.tables.filter(t=>t.schema==='private'&&t.name.startsWith('cy_')).map(t=>t.name).sort(),creatorTables.toSorted());
for(const name of creatorTables){
 const table=effects.tables.find(t=>t.schema==='private'&&t.name===name);
 assert.ok(table?.rls,`${name} has RLS`);
 for(const role of ['anon','authenticated','service_role'])assert.ok(Object.values(table.grants[role]).every(allowed=>allowed===false),`${name} has no direct ${role} grants`);
}
for(const [schema,name,authenticated,service]of [['public','creator_youtube_account',true,false],['public','creator_youtube_owner',true,false],['public','creator_youtube_server',false,true],['private','cy_session',false,false]]){
 const fn=effects.functions.find(f=>f.schema===schema&&f.name===name);
 assert.ok(fn?.security_definer,`${name} uses the tested private-store boundary`);
 assert.ok(fn.settings?.includes('search_path=""'),`${name} has an empty search path`);
 assert.equal(fn.anon_execute,false);assert.equal(fn.authenticated_execute,authenticated);assert.equal(fn.service_role_execute,service);
}
const socialState=effects.tables.find(t=>t.schema==='private'&&t.name==='social_sync_notification_state');
assert.ok(socialState?.rls,'Social incident state is private and RLS protected');
assert.ok(Object.values(socialState.grants.anon).every(v=>v===false),'No anonymous incident table grants');
for(const role of ['authenticated','service_role'])for(const [permission,allowed]of Object.entries(socialState.grants[role]))assert.equal(allowed,['select','insert','update'].includes(permission),`Social state ${role}.${permission}`);
const socialRefresh=effects.functions.find(f=>f.schema==='public'&&f.name==='refresh_social_sync_notifications');
assert.ok(socialRefresh&&!socialRefresh.security_definer,'Social notification reconciliation keeps invoker rights');
assert.equal(socialRefresh.anon_execute,false);assert.equal(socialRefresh.authenticated_execute,true);assert.equal(socialRefresh.service_role_execute,true);
const opsState=effects.tables.find(t=>t.schema==='private'&&t.name==='operations_state');
assert.ok(opsState?.rls);assert.ok(Object.values(opsState.grants).every(g=>Object.values(g).every(v=>v===false)));
for(const [name,human,machine] of [['ops_read_status',true,false],['ops_record_snapshot',false,true],['ops_database_snapshot',false,true]]){const f=effects.functions.find(x=>x.schema==='public'&&x.name===name);assert.ok(f&&!f.security_definer);assert.equal(f.anon_execute,false);assert.equal(f.authenticated_execute,human);assert.equal(f.service_role_execute,machine);}
const adminAccess=effects.tables.find(t=>t.schema==='private'&&t.name==='publication_admin_access');
assert.ok(adminAccess?.rls);
assert.ok(Object.values(adminAccess.grants).every(g=>Object.values(g).every(v=>v===false)));

for(const name of ['agent_execution_controls','agent_document_handoffs']){
 const table=effects.tables.find(t=>t.schema==='public'&&t.name===name);
 assert.ok(table?.rls,`${name} has RLS`);
 for(const role of ['anon','authenticated'])assert.ok(Object.values(table.grants[role]??{}).every(v=>v===false),`${name} has no browser grants`);
}
for(const [name,authenticated,service]of [['create_agent_workflow_job',false,true],['approve_agent_workflow_budget',true,false],['set_agent_workflow_pause',true,false],['record_agent_workflow_cost',true,false],['record_agent_document_handoff',false,true],['review_agent_workflow_result',true,false]]){
 const fn=effects.functions.find(f=>f.schema==='public'&&f.name===name);
 assert.ok(fn,`${name} exists`);assert.equal(fn.anon_execute,false);assert.equal(fn.authenticated_execute,authenticated);assert.equal(fn.service_role_execute,service);
}
for(const name of ['re02_approvals','re02_twitch_rules','re02_receipts','re02_revocations','re02_audit','re03_batches','re03_release']){
 const table=effects.tables.find(t=>t.schema==='private'&&t.name===name);
 assert.ok(table?.rls,`${name} is private and RLS enabled`);
 assert.ok(Object.values(table.grants).every(grants=>Object.values(grants).every(value=>value===false)),`${name} has no client grants`);
}
for(const [name,authenticated,service]of [['re02_admin',true,false],['re02_twitch',false,true],['re03_transfer',true,false],['re03_set_enabled',false,true]]){
 const fn=effects.functions.find(f=>f.schema==='public'&&f.name===name);
 assert.ok(fn&&!fn.security_definer,`${name} is a narrow invoker wrapper`);
 assert.equal(fn.anon_execute,false);assert.equal(fn.authenticated_execute,authenticated);assert.equal(fn.service_role_execute,service);
}
const oldRewards=effects.functions.find(f=>f.schema==='private'&&f.name==='reward_operation_re01');
assert.ok(oldRewards);assert.equal(oldRewards.anon_execute,false);assert.equal(oldRewards.authenticated_execute,false);assert.equal(oldRewards.service_role_execute,false);
const archiveTable = effects.tables.find(table => table.schema === 'public' && table.name === 'workspace_record_archives');
assert.ok(archiveTable?.rls, 'Workspace archive metadata is protected by RLS');
for (const role of ['anon', 'service_role']) assert.ok(Object.values(archiveTable.grants[role]).every(value => value === false), `${role} has no archive table grants`);
assert.equal(archiveTable.grants.authenticated.select, true);
assert.ok(Object.entries(archiveTable.grants.authenticated).every(([key, value]) => key === 'select' || value === false), 'Authenticated clients can only read archive metadata');
for (const name of ['document_registry_workspace', 'support_tickets_workspace']) {
  const view = effects.views.find(view => view.schema === 'public' && view.name === name);
  assert.ok(view?.options?.includes('security_invoker=true'), `${name} preserves source RLS`);
}
const archiveFunction = effects.functions.find(f => f.schema === 'public' && f.name === 'set_workspace_record_archive');
assert.ok(archiveFunction?.security_definer);
assert.equal(archiveFunction.authenticated_execute, true);
assert.equal(archiveFunction.anon_execute, false);
assert.equal(archiveFunction.service_role_execute, false);
for (const name of ['event_discord_settings','event_discord_publications','event_discord_jobs','event_presence','event_discord_interest','campaign_ingress_receipts','campaign_source_references','campaign_discovery_runs','public_website_channels','public_website_grants']) {
  const table=effects.tables.find(table=>table.schema==='private'&&table.name===name);
  assert.ok(table?.rls,`${name} is private and RLS enabled`);
  assert.ok(Object.values(table.grants).every(grants=>Object.values(grants).every(value=>value===false)),`${name} has no client grants`);
}
assert.ok(effects.functions.length > 143);
const ownPreviewFunction=effects.functions.find(f=>f.schema==='public'&&f.name==='f6_own_page_drafts');
assert.ok(ownPreviewFunction?.security_definer);assert.equal(ownPreviewFunction.authenticated_execute,true);assert.equal(ownPreviewFunction.anon_execute,false);assert.equal(ownPreviewFunction.service_role_execute,false);

for(const [name,anon,authenticated,service]of [['event_discord_manage',false,true,false],['event_public_info',true,true,false],['event_presence_own',false,true,false],['event_discord_bot',false,false,true]]){const fn=effects.functions.find(f=>f.schema==='public'&&f.name===name);assert.ok(fn?.security_definer);assert.equal(fn.anon_execute,anon);assert.equal(fn.authenticated_execute,authenticated);assert.equal(fn.service_role_execute,service);}
const privateOperations=['f1_context','f1_receipts','f2_receipts','campaign_pilots','campaign_access','campaign_policies','campaign_participants','campaign_contributions','campaign_measurements','campaign_receipts','campaign_events','campaign_report_revisions','campaign_sources','campaign_source_runs','platform_settings','platform_access','creator_profiles','creator_revisions','creator_entries','f4_receipts','f4_limits','intake_forms','intake_handlers','platform_applications','application_events','partner_publication_settings','partner_publication_revisions','partner_publication_entries','vacancy_settings','vacancy_dossiers','vacancy_revisions','vacancy_entries','partner_delegation_settings','partner_delegations','partner_profile_proposals','site_content_settings','content_migration_records','content_migration_reviews','site_content_dossiers','site_content_revisions','site_content_entries','contact_settings'];
assert.ok(effects.tables.every((table) => table.rls || (table.schema === 'private' && privateOperations.includes(table.name))));
assert.ok(effects.tables.filter(table=>table.schema==='private'&&privateOperations.includes(table.name)).every(table=>Object.values(table.grants).every(grants=>Object.values(grants).every(value=>value===false))), 'Private operation tables have no client grants; existing private service grants remain unchanged');
const dataState = JSON.parse(sql(readFileSync(new URL("../ops/foundation-data-state.sql", import.meta.url), "utf8")));
assert.equal(dataState.guideline_titles_missing, 0);
assert.equal(dataState.eligible_accounts_without_active_contact, 0);
writeFileSync("foundation-native-effects.json", JSON.stringify({ format: "besc-native-replay-v1", source_commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), migrations, migration_count: names.length, omissions: ["Auth, Storage and Vault service behavior is not tested"], effects, data_state: dataState }, null, 2) + "\n", { flag: "wx" });
console.log(`Native PostgreSQL replay passed: ${names.length} migrations, ${effects.tables.length} RLS tables, ${effects.functions.length} functions.`);
