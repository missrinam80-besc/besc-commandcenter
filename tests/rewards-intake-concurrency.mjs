// Dedicated CI PostgreSQL only. Never accepts a Cloud URL or existing business DB.
import assert from "node:assert/strict";
import { rewardsIntakeConcurrencyFixture } from "./helpers/rewards-intake-concurrency-fixture.mjs";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { setTimeout as pause } from "node:timers/promises";

assert.equal(process.env.PGHOST, "127.0.0.1");
assert.equal(process.env.PGDATABASE, "besc_concurrency_fixture");
assert.equal(process.env.PGUSER, "postgres");
assert.equal(process.env.PGPASSWORD, "fixture-only");
let database = process.env.PGDATABASE;
function processSql(query, interactive = false) {
  const args = ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-d", database];
  const child = spawn("psql", interactive ? args : [...args, "-c", query], { stdio: ["pipe", "pipe", "pipe"], env: process.env, windowsHide: true });
  let out = "", err = ""; const listeners = [];
  child.stdout.on("data", chunk => { out += chunk; for (const listener of listeners) listener(out); });
  child.stderr.on("data", chunk => { err += chunk; });
  const done = new Promise((resolve, reject) => { child.on("error", reject); child.on("close", code => resolve({ code, out, err })); });
  return { child, done, write: text => child.stdin.write(text), ready: () => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error("Intake holder not ready")), 15000);
    const listener = text => { if (text.includes("BESC_INTAKE_READY")) { clearTimeout(timer); resolve(); } };
    listeners.push(listener); listener(out);
    done.then(result => { if (!result.out.includes("BESC_INTAKE_READY")) { clearTimeout(timer); reject(Error(result.err || "Holder ended")); } }, reject);
  }) };
}
async function sql(query) { const result = await processSql(query).done; assert.equal(result.code, 0, result.err); return result.out.trim(); }
const name = `besc_intake_fixture_${Date.now()}`;
await sql(`create database ${name}`); database = name;
await sql(rewardsIntakeConcurrencyFixture());
const org = "10000000-0000-4000-8000-000000000001", uid = "20000000-0000-4000-8000-000000000003", broadcaster = "123456789", twitch = "987654321";
await sql(`insert into organizations values('${org}');insert into auth.users(id) values('${uid}');
 insert into profiles values('${uid}','111111111111111113','TESTFIXTURE');
 insert into organization_members values('${org}','${uid}','active','member',null);
 insert into auth.identities values('${uid}','discord','111111111111111113','{}'),('${uid}','twitch','${twitch}','{"sub":"${twitch}"}');
 insert into reward_accounts values('${org}','${uid}',70,30,10);
 insert into reward_ledger(organization_id,user_id,actor_id,kind,xp_delta,bucks_delta,reserved_delta,reason)
 values('${org}','${uid}','${uid}','manual',70,30,0,'TESTFIXTURE bestaand'),
 ('${org}','${uid}','${uid}','reserve',0,0,10,'TESTFIXTURE reservering');`);
const event = () => ({ schemaVersion: 2, simulation: false, kind: "twitch.cheer", event_id: randomUUID(), broadcaster_id: broadcaster, twitch_user_id: twitch, occurred_at: new Date().toISOString(), facts: { bits: 100, is_anonymous: false } });
const receive = data => `select rewards_intake('${org}','${broadcaster}','receive','${JSON.stringify(data)}',null);`;
async function overlap(first, second, phase, rollback = false, duringWait = async () => {}) {
  const prefix = "set statement_timeout='15s';set lock_timeout='10s';";
  const holder = processSql("", true); let contender;
  try {
    holder.write(prefix + first + "\n\\echo BESC_INTAKE_READY\n"); await holder.ready();
    const application = `intake-${phase}`;
    contender = processSql(`set application_name='${application}';${prefix}set role service_role;begin;${second}commit;`);
    let waiting = false;
    for (let n = 0; n < 120; n++) {
      if (await sql(`select count(*) from pg_stat_activity where application_name='${application}' and wait_event_type='Lock'`) === "1") { waiting = true; break; }
      await pause(50);
    }
    assert.ok(waiting, "Expected genuinely blocked, overlapping PostgreSQL sessions");
    await duringWait();
    holder.write((rollback ? "rollback;" : "commit;") + "\n\\q\n");
    const firstResult = await holder.done; assert.equal(firstResult.code, 0, firstResult.err);
    const result = await contender.done; assert.equal(result.code, 0, result.err); return result.out;
  } finally { holder.child.stdin.end(); contender?.child.stdin.end(); }
}
const duplicate = { ...event(), event_id: "Opaque-Provider/Message+ID=" };
const replay = await overlap("set role service_role;begin;" + receive(duplicate), receive(duplicate), "replay");
assert.match(replay, /"replay": true/); assert.equal(await sql("select count(*) from private.reward_intake_receipts"), "1");
console.info("PASS: simultaneous identical event persisted once");

const conflict = event();
const changed = await overlap("set role service_role;begin;" + receive(conflict), receive({ ...conflict, twitch_user_id: "999" }), "conflict");
assert.match(changed, /idempotency_conflict/); assert.equal(await sql("select count(*) from private.reward_intake_receipts"), "2");
console.info("PASS: actor change cannot create a second receipt for one provider message");

const rollbackEvent = event();
const retried = await overlap("set role service_role;begin;" + receive(rollbackEvent), receive(rollbackEvent), "rollback", true);
assert.match(retried, /"replay": false/); assert.equal(await sql("select count(*) from private.reward_intake_receipts"), "3");
console.info("PASS: rollback permits exactly one subsequent receipt");

const key = JSON.parse(await sql("set role service_role;" + receive(duplicate))).eventKey;
const guard = await overlap(`begin;select pg_advisory_xact_lock(hashtextextended('${org}:reward-intake:${broadcaster}:${key}',0));`, receive(duplicate), "revoked-account", false,
  () => sql("update organization_members set status='pending'"));
assert.match(guard, /"accountCheckPassed": false/);
assert.equal(await sql("select count(*) from reward_ledger"), "2");
assert.equal(await sql("select sum(xp_delta)||':'||sum(bucks_delta)||':'||sum(reserved_delta) from reward_ledger"), "70:30:10");
assert.equal(await sql("select xp||':'||bucks||':'||reserved from reward_accounts"), "70:30:10");
console.info("PASS: revocation committed during lock wait is observed; balances and ledger unchanged");
