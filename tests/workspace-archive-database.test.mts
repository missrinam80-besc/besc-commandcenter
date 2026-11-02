import assert from "node:assert/strict";
import test, { before, after, beforeEach, afterEach } from "node:test";
import { randomUUID } from "node:crypto";
import { f1Database, q } from "./helpers/f1-database.mts";

let f: Awaited<ReturnType<typeof f1Database>>;
const ticket = randomUUID();
before(async () => {
  f = await f1Database();
  await f.owner();
  await f.db.exec(`insert into public.support_tickets(id,organization_id,client_id,guild_id,
    requester_discord_id,subject,parent_channel_id) values(${q(ticket)},${q(f.ids.org)},
    'fixture-client','1067893182387474432','111111111111111111','TESTFIXTURE archive','222222222222222222');`);
});
after(async () => { await f?.db.close(); });
beforeEach(async () => { await f.owner(); await f.db.exec("begin"); await f.actor(f.ids.chair); });
afterEach(async () => { await f.db.exec("rollback"); await f.owner(); });

async function archive(entity: string, id: string, archived: boolean, version: number, org = f.ids.org) {
  return (await f.db.query<{ v: { archived: boolean; version: number } }>(
    `select public.set_workspace_record_archive(${q(org)},${q(entity)},${q(id)},${archived},${version}) v`,
  )).rows[0].v;
}
async function source(table: string, id: string) {
  return (await f.db.query<{ v: unknown }>(`select to_jsonb(t) v from public.${table} t where id=${q(id)}`)).rows[0]?.v;
}
async function denied(sql: string, pattern = /permission denied|workspace_archive_unavailable/) {
  await f.db.exec("savepoint denied");
  await assert.rejects(f.db.exec(sql), pattern);
  await f.db.exec("rollback to denied");
}
const request = (entity: string, id: string, version = 0) =>
  `select public.set_workspace_record_archive(${q(f.ids.org)},${q(entity)},${q(id)},true,${version})`;

test("Document archive/restore changes only overview state and creates attributable audit", async () => {
  const original = await source("document_registry", f.ids.proof);
  assert.deepEqual(await archive("document", f.ids.proof, true, 0), { archived: true, version: 1 });
  assert.deepEqual(await source("document_registry", f.ids.proof), original);
  assert.equal((await f.db.query(`select id from public.document_registry_workspace where id=${q(f.ids.proof)} and archived_at is null`)).rows.length, 0);
  assert.equal((await f.db.query(`select id from public.document_registry_workspace where id=${q(f.ids.proof)} and archived_at is not null`)).rows.length, 1);
  assert.deepEqual(await archive("document", f.ids.proof, false, 1), { archived: false, version: 2 });
  assert.deepEqual(await source("document_registry", f.ids.proof), original);
  const audit = (await f.db.query<{ actor_id: string; operation: string }>(`select actor_id,metadata->>'operation' operation from public.audit_log where entity_id=${q(f.ids.proof)} and metadata->>'workspace_archive_only'='true' order by metadata->>'archive_version'`)).rows;
  assert.deepEqual(audit, [{ actor_id: f.ids.chair, operation: "workspace.archive" }, { actor_id: f.ids.chair, operation: "workspace.restore" }]);
  await denied(`delete from public.document_registry where id=${q(f.ids.proof)}`, /permission denied|f1_document_preserve_history/);
});

test("Read views preserve source RLS, restricted proof visibility and organization boundaries", async () => {
  await archive("document", f.ids.proof, true, 0);
  await archive("ticket", ticket, true, 0);
  await f.actor(f.ids.volunteer);
  assert.equal((await f.db.query(`select id from public.document_registry_workspace where id=${q(f.ids.proof)}`)).rows.length, 0);
  assert.equal((await f.db.query("select * from public.support_tickets_workspace")).rows.length, 0);
  assert.equal((await f.db.query("select * from public.workspace_record_archives")).rows.length, 0);
  await f.actor(f.ids.other);
  assert.equal((await f.db.query(`select * from public.workspace_record_archives where organization_id=${q(f.ids.org)}`)).rows.length, 0);
  await denied(request("ticket", ticket));
  await f.actor(f.ids.chair);
  await denied(`select public.set_workspace_record_archive(${q(f.ids.otherOrg)},'document',${q(f.ids.otherDoc)},true,0)`);
  await denied(request("document", randomUUID()));
  await denied(request("arbitrary_table", f.ids.proof));
});

test("Only current source managers can mutate archive state; no direct or bot/anonymous bypass", async () => {
  await f.actor(f.ids.member);
  await denied(request("document", f.ids.ruleDoc));
  await denied(request("ticket", ticket));
  await f.actor(f.ids.admin);
  await denied(request("document", f.ids.proof)); // admin alone has no formal governance visibility
  await f.actor(f.ids.chair);
  await archive("ticket", ticket, true, 0);
  await denied("update public.workspace_record_archives set archived_at=null");
  await denied("delete from public.workspace_record_archives");
  await denied(`insert into public.workspace_record_archives(organization_id,entity_type,record_id,version) values(${q(f.ids.org)},'document',${q(f.ids.ruleDoc)},1)`);
  for (const role of ["anon", "service_role"]) {
    await f.actor(f.ids.chair, role);
    await denied(request("ticket", ticket));
    await denied("select * from public.workspace_record_archives");
    await denied("select * from public.document_registry_workspace");
  }
});

test("Stale forms cannot overwrite a newer archive/restore, and current repeated state is idempotent", async () => {
  await archive("document", f.ids.ruleDoc, true, 0);
  await denied(`select public.set_workspace_record_archive(${q(f.ids.org)},'document',${q(f.ids.ruleDoc)},false,0)`, /workspace_archive_version_conflict/);
  assert.deepEqual(await archive("document", f.ids.ruleDoc, true, 1), { archived: true, version: 1 });
  await archive("document", f.ids.ruleDoc, false, 1);
  await denied(request("document", f.ids.ruleDoc, 1), /workspace_archive_version_conflict/);
});

test("Revoked staff membership prevents restoring a formerly managed ticket", async () => {
  await archive("ticket", ticket, true, 0);
  await f.owner();
  await f.db.exec(`update public.organization_members set status='pending' where user_id=${q(f.ids.chair)} and organization_id=${q(f.ids.org)}`);
  await f.actor(f.ids.chair);
  await denied(`select public.set_workspace_record_archive(${q(f.ids.org)},'ticket',${q(ticket)},false,1)`);
  await f.owner();
  assert.equal((await f.db.query(`select * from public.workspace_record_archives where record_id=${q(ticket)} and archived_at is not null`)).rows.length, 1);
});

test("Ticket archive and restore retain ticket version, open state, retention and delivery queue", async () => {
  const original = await source("support_tickets", ticket);
  const deliveryCount = (await f.db.query("select * from public.support_ticket_deliveries")).rows.length;
  await archive("ticket", ticket, true, 0);
  assert.deepEqual(await source("support_tickets", ticket), original);
  assert.equal((await f.db.query(`select id from public.support_tickets_workspace where id=${q(ticket)} and archived_at is null`)).rows.length, 0);
  await archive("ticket", ticket, false, 1);
  assert.deepEqual(await source("support_tickets", ticket), original);
  assert.equal((await f.db.query("select * from public.support_ticket_deliveries")).rows.length, deliveryCount);
});

test("Only incoming requester messages restore archived tickets; no outbound Discord job is added", async () => {
  const original = await source("support_tickets", ticket);
  await archive("ticket", ticket, true, 0);
  await f.owner();
  const add = async (direction: string) => f.db.exec(`insert into public.support_ticket_messages(organization_id,ticket_id,direction,content) values(${q(f.ids.org)},${q(ticket)},${q(direction)},'TESTFIXTURE incoming')`);
  await add("internal");
  assert.equal((await f.db.query(`select * from public.workspace_record_archives where record_id=${q(ticket)} and archived_at is not null`)).rows.length, 1);
  const deliveries = (await f.db.query("select * from public.support_ticket_deliveries")).rows.length;
  await add("requester");
  const state = (await f.db.query<{ archived_at: string | null; version: number; changed_by: string | null }>(`select archived_at,version,changed_by from public.workspace_record_archives where record_id=${q(ticket)}`)).rows[0];
  assert.equal(state.archived_at, null); assert.equal(Number(state.version), 2); assert.equal(state.changed_by, null);
  assert.deepEqual(await source("support_tickets", ticket), original);
  assert.equal((await f.db.query("select * from public.support_ticket_deliveries")).rows.length, deliveries);
  await f.actor(f.ids.chair);
  await denied(`select public.set_workspace_record_archive(${q(f.ids.org)},'ticket',${q(ticket)},false,1)`, /workspace_archive_version_conflict/);
  assert.equal((await f.db.query(`select id from public.support_tickets_workspace where id=${q(ticket)} and archived_at is null`)).rows.length, 1);
});

test("Normal source deletion cleans up its archive marker without changing the source's deletion guards", async () => {
  await archive("document", f.ids.ruleDoc, true, 0);
  await archive("ticket", ticket, true, 0);
  await f.owner();
  await f.db.exec(`delete from public.document_registry where id=${q(f.ids.ruleDoc)};delete from public.support_tickets where id=${q(ticket)}`);
  assert.equal((await f.db.query(`select * from public.workspace_record_archives where record_id in(${q(f.ids.ruleDoc)},${q(ticket)})`)).rows.length, 0);
});
