import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { handleRewardsIntakeRequest, parseRewardsIntakeRegistry } from "../src/lib/rewards-intake.ts";
import { hashRewardsPreviewKey } from "../src/lib/rewards-integration-preview.ts";
import { rewardsIntakeConcurrencyFixture } from "./helpers/rewards-intake-concurrency-fixture.mjs";

const org = "10000000-0000-4000-8000-000000000001", foreign = "10000000-0000-4000-8000-000000000002";
const user = "20000000-0000-4000-8000-000000000003", other = "20000000-0000-4000-8000-000000000004";
const broadcaster = "123456789", twitch = "987654321", discord = "111111111111111113";
type Receipt = { error?: string; receiptId: string; eventKey: string; decision: string; reason: string; persisted: boolean; awarded: boolean; accountCheckPassed: boolean; replay: boolean; providerProofVerified: boolean };
test("intake fixture: actual CI database setup executes with intact PostgreSQL dollar quotes", async () => {
  const db = new PGlite(); try {
    await db.exec(rewardsIntakeConcurrencyFixture());
    assert.equal((await db.query<{ n: number }>("select count(*)::int n from pg_proc where proname='rewards_intake'")).rows[0].n, 1);
  } finally { await db.close(); }
});
async function setup(directory?: string, legacy = false) {
  const db = new PGlite(directory);
  for (const file of ["./helpers/rewards-fixture.sql", "./helpers/rewards-intake-fixture.sql", "../supabase/migrations/20261017162100_bucks_xp_v1.sql", "../supabase/migrations/20261018213441_rewards_intake_receipts.sql", "../supabase/migrations/20261019221404_rewards_intake_opaque_message_ids.sql"]) {
    if (legacy && file.includes("opaque_message_ids")) continue;
    await db.exec(readFileSync(new URL(file, import.meta.url), "utf8"));
  }
  await db.query("insert into organizations values ($1),($2)", [org, foreign]);
  await db.query("insert into auth.users(id) values($1),($2)", [user, other]);
  await db.query("insert into profiles values($1,$2,'TESTFIXTURE member'),($3,'111111111111111114','TESTFIXTURE other')", [user, discord, other]);
  await db.query("insert into organization_members values($1,$2,'active','member',null),($1,$3,'active','member',null)", [org, user, other]);
  await db.query("insert into auth.identities values($1,'twitch',$2,jsonb_build_object('sub',$2::text,'provider_id',$2::text)),($1,'discord',$3,'{}'),($4,'discord','111111111111111114','{}')", [user, twitch, discord, other]);
  await db.query("insert into reward_accounts values($1,$2,70,30,10)", [org, user]);
  await db.query(`insert into reward_ledger(organization_id,user_id,actor_id,kind,xp_delta,bucks_delta,reserved_delta,reason)
    values($1,$2,$2,'manual',70,30,0,'TESTFIXTURE bestaande toekenning'),($1,$2,$2,'reserve',0,0,10,'TESTFIXTURE bestaande reservering')`, [org, user]);
  const event = (patch: Record<string, unknown> = {}) => ({ schemaVersion: 2, simulation: false, kind: "twitch.cheer", event_id: randomUUID(), broadcaster_id: broadcaster, twitch_user_id: twitch, occurred_at: new Date().toISOString(), facts: { bits: 100, is_anonymous: false }, ...patch });
  const admin = async (sql: string, args: unknown[] = []) => { await db.exec("reset role"); return db.query<Record<string, unknown>>(sql, args); };
  const call = async (op: string, data: Record<string, unknown> = {}, key: string | null = null, o = org, b = broadcaster) => {
    await db.exec("reset role;set role service_role");
    return (await db.query<{ r: Receipt }>("select rewards_intake($1,$2,$3,$4,$5) r", [o, b, op, JSON.stringify(data), key])).rows[0].r;
  };
  const unchanged = async () => {
    const a = (await admin("select xp::text,bucks::text,reserved::text from reward_accounts")).rows;
    assert.deepEqual(a, [{ xp: "70", bucks: "30", reserved: "10" }]);
    assert.deepEqual((await admin("select kind,xp_delta,bucks_delta,reserved_delta,reason from reward_ledger order by kind")).rows, [
      { kind: "manual", xp_delta: 70, bucks_delta: 30, reserved_delta: 0, reason: "TESTFIXTURE bestaande toekenning" },
      { kind: "reserve", xp_delta: 0, bucks_delta: 0, reserved_delta: 10, reason: "TESTFIXTURE bestaande reservering" },
    ]);
  };
  return { db, event, admin, call, unchanged };
}

test("intake DB: first receipt, replay, canonical JSON and no balance/reservation changes", async () => {
  const t = await setup(); try {
    const e = t.event(); const first = await t.call("receive", e);
    assert.equal(first.decision, "held"); assert.equal(first.reason, "earning_disabled");
    assert.equal(first.accountCheckPassed, true); assert.equal(first.persisted, true); assert.equal(first.awarded, false);
    assert.equal(first.providerProofVerified, false); assert.equal(first.replay, false);
    const again = await t.call("receive", Object.fromEntries(Object.entries(e).reverse()));
    assert.equal(again.receiptId, first.receiptId); assert.equal(again.eventKey, first.eventKey); assert.equal(again.replay, true);
    const lookup = await t.call("receipt", {}, first.eventKey); assert.equal(lookup.receiptId, first.receiptId);
    assert.equal((await t.admin("select count(*)::int n from private.reward_intake_receipts")).rows[0].n, 1);
    await t.unchanged();
  } finally { await t.db.close(); }
});

test("intake DB: receipt survives database reopen and a rolled-back receive can safely retry", async () => {
  const directory = await mkdtemp(join(tmpdir(), "besc-rewards-intake-"));
  let db: PGlite | undefined;
  try {
    const t = await setup(directory); db = t.db;
    const e = t.event(); const saved = await t.call("receive", e);
    await db.close(); db = new PGlite(directory);
    await db.exec("set role service_role");
    const replay = (await db.query<{ r: Receipt }>("select rewards_intake($1,$2,'receive',$3,null) r", [org, broadcaster, JSON.stringify(e)])).rows[0].r;
    assert.equal(replay.receiptId, saved.receiptId); assert.equal(replay.replay, true);
    const fresh = t.event();
    await db.exec("begin");
    await db.query("select rewards_intake($1,$2,'receive',$3,null)", [org, broadcaster, JSON.stringify(fresh)]);
    await db.exec("rollback");
    const retry = (await db.query<{ r: Receipt }>("select rewards_intake($1,$2,'receive',$3,null) r", [org, broadcaster, JSON.stringify(fresh)])).rows[0].r;
    assert.equal(retry.replay, false); assert.equal(retry.persisted, true);
    await db.exec("reset role");
    assert.equal((await db.query<{ n: number }>("select count(*)::int n from private.reward_intake_receipts")).rows[0].n, 2);
  } finally {
    await db?.close();
    // Verify the exact resolved test directory before recursive Windows cleanup.
    const target = resolve(directory);
    assert.equal(dirname(target), resolve(tmpdir()));
    assert.ok(basename(target).startsWith("besc-rewards-intake-"));
    await rm(target, { recursive: true, force: true });
  }
});

test("intake DB/API: real SQL receipt passes the actual response projection", async () => {
  const t = await setup(); try {
    const token = "bri_fixture-sql." + "a".repeat(43);
    const registry = parseRewardsIntakeRegistry(JSON.stringify({
      sources: [{ id: "fixture-source", organizationId: org, platform: "twitch", broadcasterId: broadcaster, kinds: ["twitch.cheer"], revoked: false }],
      clients: [{ id: "fixture-sql", sourceId: "fixture-source", keyHash: hashRewardsPreviewKey(token), scopes: ["rewards:intake:write", "rewards:receipts:read"], expiresAt: "2099-01-01T00:00:00.000Z", revoked: false }],
    }));
    const e = t.event();
    const post = () => new Request("https://fixture.invalid/api/v1/integrations/rewards/intake/activities", {
      method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(e),
    });
    const deps = { enabled: true, registry: () => registry,
      operation: async (_source: unknown, op: "receive" | "receipt", data: Record<string, unknown>, key: string | null) => t.call(op, data, key),
    };
    const first = await handleRewardsIntakeRequest(post(), deps); assert.equal(first.status, 200);
    const receipt = await first.json(); assert.equal(receipt.accountCheckPassed, true); assert.equal(receipt.awarded, false);
    const replay = await handleRewardsIntakeRequest(post(), deps); assert.equal(replay.status, 200);
    assert.equal((await replay.json()).receiptId, receipt.receiptId);
    await t.unchanged();
  } finally { await t.db.close(); }
});

test("intake DB: changed actor, facts, kind and time conflict on the original provider message", async () => {
  const t = await setup(); try {
    const e = t.event(); const first = await t.call("receive", e);
    for (const patch of [{ twitch_user_id: "333" }, { facts: { bits: 101, is_anonymous: false } }, { kind: "twitch.follow", facts: {} }, { occurred_at: new Date(Date.now() - 1000).toISOString() }]) {
      assert.equal((await t.call("receive", { ...e, ...patch })).error, "idempotency_conflict");
    }
    assert.equal((await t.call("receipt", {}, first.eventKey)).receiptId, first.receiptId);
    assert.equal((await t.admin("select count(*)::int n from private.reward_intake_receipts")).rows[0].n, 1);
    await t.unchanged();
  } finally { await t.db.close(); }
});

test("intake DB: wrong source/org lookup is hidden, stale new events rejected but stored retries recover", async () => {
  const t = await setup(); try {
    const old = t.event({ occurred_at: new Date(Date.now() - 180000).toISOString() });
    assert.equal((await t.call("receive", old)).error, "event_time_out_of_range");
    assert.equal((await t.call("receive", t.event({ occurred_at: new Date(Date.now() + 60000).toISOString() }))).error, "event_time_out_of_range");
    const e = t.event(); const saved = await t.call("receive", e);
    assert.equal((await t.call("receipt", {}, saved.eventKey, foreign)).error, "not_found");
    assert.equal((await t.call("receipt", {}, saved.eventKey, org, "999")).error, "not_found");
    // Simulate an aged stored receipt without changing its immutable outcome.
    const older = new Date(Date.now() - 180000).toISOString();
    const changed = { ...e, occurred_at: older };
    await t.admin("update private.reward_intake_receipts set event_data=$1,content_hash=encode(sha256(convert_to($1::jsonb::text,'UTF8')),'hex') where id=$2", [JSON.stringify(changed), saved.receiptId]);
    assert.equal((await t.call("receive", changed)).receiptId, saved.receiptId);
    assert.equal((await t.call("receive", t.event(), null, foreign)).decision, "rejected");
    await t.unchanged();
  } finally { await t.db.close(); }
});

test("intake DB: ban, membership, deleted account and missing/mismatched Discord proof block current eligibility", async () => {
  const t = await setup(); try {
    const e = t.event(); const saved = await t.call("receive", e);
    for (const [bad, restore] of [
      ["update auth.users set banned_until=now()+interval '1 day'", "update auth.users set banned_until=null"],
      ["update auth.users set deleted_at=now()", "update auth.users set deleted_at=null"],
      ["update organization_members set status='pending'", "update organization_members set status='active'"],
      ["update organization_members set role='guest'", "update organization_members set role='member'"],
      ["update profiles set discord_user_id='999999999999999999' where id='" + user + "'", "update profiles set discord_user_id='" + discord + "' where id='" + user + "'"],
      ["update auth.identities set identity_data='{\"sub\":\"bad\"}' where provider='discord'", "update auth.identities set identity_data='{}' where provider='discord'"],
    ]) {
      await t.admin(bad);
      assert.equal((await t.call("receive", e)).accountCheckPassed, false);
      assert.equal((await t.call("receipt", {}, saved.eventKey)).accountCheckPassed, false);
      assert.equal((await t.call("receive", t.event())).decision, "rejected");
      await t.admin(restore);
    }
    assert.equal((await t.call("receive", e)).accountCheckPassed, true);
    await t.unchanged();
  } finally { await t.db.close(); }
});

test("intake DB: native Twitch identity only; metadata conflicts, missing and transferred identity stay safe", async () => {
  const t = await setup(); try {
    const e = t.event(); const saved = await t.call("receive", e);
    for (const data of [{}, { sub: "wrong" }, { sub: 987654321 }, { sub: twitch, provider_id: "wrong" }, { sub: null, provider_id: twitch }]) {
      await t.admin("update auth.identities set identity_data=$1 where provider='twitch'", [JSON.stringify(data)]);
      assert.equal((await t.call("receive", t.event())).decision, "rejected");
      assert.equal((await t.call("receive", e)).accountCheckPassed, false);
    }
    await t.admin("delete from auth.identities where provider='twitch'");
    const rejectedEvent = t.event(); const rejected = await t.call("receive", rejectedEvent);
    assert.equal(rejected.decision, "rejected");
    await t.admin("insert into auth.identities values($1,'twitch',$2,jsonb_build_object('sub',$2::text))", [other, twitch]);
    assert.equal((await t.call("receive", e)).accountCheckPassed, false);
    assert.equal((await t.call("receipt", {}, saved.eventKey)).accountCheckPassed, false);
    assert.equal((await t.call("receive", rejectedEvent)).decision, "rejected");
    assert.equal((await t.call("receive", rejectedEvent)).accountCheckPassed, false);
    assert.equal((await t.call("receive", t.event())).accountCheckPassed, true);
    assert.equal((await t.call("receipt", {}, rejected.eventKey)).reason, "account_ineligible");
    await t.unchanged();
  } finally { await t.db.close(); }
});

test("intake DB: strict SQL validation, browser isolation and minimal service-only RPC", async () => {
  const t = await setup(); try {
    for (const patch of [{ simulation: true }, { bucks: 100 }, { organization_id: org }, { twitch_user_id: 987654321 },
      { broadcaster_id: "999" }, { facts: { bits: 100, is_anonymous: true } }, { occurred_at: "nonsense" }, { kind: "website.article_read" }]) {
      assert.equal((await t.call("receive", t.event(patch))).error, "invalid_fields");
    }
    assert.equal((await t.call("award", {})).error, "not_found");
    for (const role of ["anon", "authenticated", "service_role"]) {
      await t.db.exec(`reset role;set role ${role}`);
      await assert.rejects(t.db.query("select * from private.reward_intake_receipts"), /permission denied/);
      await assert.rejects(t.db.query("select private.reward_intake_account($1,$2)", [org, twitch]), /permission denied/);
      if (role !== "service_role") await assert.rejects(t.db.query("select rewards_intake($1,$2,'receive',$3,null)", [org, broadcaster, JSON.stringify(t.event())]), /permission denied/);
    }
    const flags = await t.admin("select p.prosecdef,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='rewards_intake'");
    assert.equal(flags.rows[0].prosecdef, false);
    assert.deepEqual(flags.rows[0].proconfig, ['search_path=""']);
    const rls = await t.admin("select relrowsecurity from pg_class where oid='private.reward_intake_receipts'::regclass");
    assert.equal(rls.rows[0].relrowsecurity, true);
    assert.equal((await t.admin("select count(*)::int n from pg_policies where schemaname='private' and tablename='reward_intake_receipts'")).rows[0].n, 0);
    await t.unchanged();
  } finally { await t.db.close(); }
});

const opaqueMigration = () => readFileSync(new URL("../supabase/migrations/20261019221404_rewards_intake_opaque_message_ids.sql", import.meta.url), "utf8");
test("intake DB: real V1 row survives migration byte-for-byte; V2 and V1 replay it without granting", async () => {
  const t = await setup(undefined, true); try {
    const oldEvent = t.event({ schemaVersion: 1, event_id: "ABCDEFAB-1234-4000-8000-ABCDEFABCDEF" });
    const original = await t.call("receive", oldEvent);
    const before = (await t.admin("select row_to_json(r)::text snapshot from private.reward_intake_receipts r")).rows;
    await t.db.exec("reset role");
    await t.db.exec(opaqueMigration());
    const after = (await t.admin("select row_to_json(r)::text snapshot from private.reward_intake_receipts r")).rows;
    assert.deepEqual(after,before);
    for(const schemaVersion of [1,2]) {
      const replay = await t.call("receive", {...oldEvent,schemaVersion});
      assert.equal(replay.receiptId,original.receiptId); assert.equal(replay.eventKey,original.eventKey);
      assert.equal(replay.replay,true); assert.equal(replay.awarded,false);
      assert.equal((await t.call("receive", {...oldEvent,schemaVersion,facts:{bits:101,is_anonymous:false}})).error,"idempotency_conflict");
    }
    assert.equal((await t.call("receipt",{},original.eventKey)).receiptId,original.receiptId);
    assert.equal((await t.call("receive",t.event({schemaVersion:1}))).error,"invalid_fields");
    assert.deepEqual((await t.admin("select row_to_json(r)::text snapshot from private.reward_intake_receipts r")).rows,before);
    await t.unchanged();
  } finally { await t.db.close(); }
});
test("intake DB: opaque IDs are exact, scoped, replayable, and immutable across actor/kind changes", async () => {
  const t=await setup(); try {
    const e=t.event({event_id:"Opaque/Provider+ID=With'Quote"});
    const first=await t.call("receive",e);
    assert.equal(first.persisted,true);
    assert.equal((await t.call("receive",e)).receiptId,first.receiptId);
    assert.equal((await t.call("receive",{...e,twitch_user_id:"999"})).error,"idempotency_conflict");
    assert.equal((await t.call("receive",{...e,kind:"twitch.follow",facts:{}})).error,"idempotency_conflict");
    const lower=await t.call("receive",{...e,event_id:e.event_id.toLowerCase()});
    assert.notEqual(lower.eventKey,first.eventKey);
    const foreign=await t.call("receive",e,null,org,"999");
    assert.equal(foreign.error,"invalid_fields");
    const stored=(await t.admin("select event_data->>'event_id' id from private.reward_intake_receipts where event_key=$1",[first.eventKey])).rows[0].id;
    assert.equal(stored,e.event_id);
    for (const bad of ["", "x".repeat(129),"contains space","a\n","a\r","a\t","é","a\u007f"]) {
      assert.equal((await t.call("receive",t.event({event_id:bad}))).error,"invalid_fields");
    }
    assert.equal((await t.call("receive",t.event({event_id:"x".repeat(128)}))).persisted,true);
    await t.unchanged();
  } finally { await t.db.close(); }
});
test("intake DB: new V2 UUID-shaped IDs preserve case; V1 cannot create an alias", async () => {
  const t=await setup();try {
    const e=t.event({event_id:"ABCDEFAB-1234-4000-8000-ABCDEFABCDEF"});
    const first=await t.call("receive",e);
    assert.equal((await t.call("receive",{...e,schemaVersion:1})).error,"invalid_fields");
    const second=await t.call("receive",{...e,event_id:e.event_id.toLowerCase()});
    assert.notEqual(first.eventKey,second.eventKey);
    assert.equal((await t.admin("select count(*)::int n from private.reward_intake_receipts")).rows[0].n,2);
    await t.unchanged();
  } finally {await t.db.close();}
});
