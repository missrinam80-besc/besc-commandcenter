import assert from "node:assert/strict";
import test from "node:test";
import { handleRewardsIntakeRequest, parseRewardsIntakeRegistry } from "../src/lib/rewards-intake.ts";
import { hashRewardsPreviewKey, RewardsIntegrationLimiter } from "../src/lib/rewards-integration-preview.ts";

const now = Date.parse("2026-10-18T20:00:00.000Z");
const token = "bri_fixture-intake." + "a".repeat(43);
const source = { id: "fixture-twitch", organizationId: "10000000-0000-4000-8000-000000000001", platform: "twitch", broadcasterId: "123456789", kinds: ["twitch.follow", "twitch.cheer"], revoked: false };
const client = { id: "fixture-intake", sourceId: source.id, keyHash: hashRewardsPreviewKey(token), expiresAt: "2099-01-01T00:00:00.000Z", revoked: false, scopes: ["rewards:intake:write", "rewards:receipts:read"] };
const event = { schemaVersion: 1, simulation: false, kind: "twitch.cheer", event_id: "30000000-0000-4000-8000-000000000001", broadcaster_id: source.broadcasterId, twitch_user_id: "987654321", occurred_at: "2026-10-18T20:00:00.000Z", facts: { bits: 100, is_anonymous: false } };
const receipt = { schemaVersion: 1, mode: "intake_only", receiptId: "40000000-0000-4000-8000-000000000001", eventKey: "a".repeat(64), receivedAt: "2026-10-18T20:00:00.123456+00:00", decision: "held", reason: "earning_disabled", persisted: true, awarded: false, earningEnabled: false, identityChecked: true, accountCheckPassed: true, providerProofVerified: false, replay: false };
function registry(sources = [source], clients = [client]) { return parseRewardsIntakeRegistry(JSON.stringify({ sources, clients })); }
function fixture(patch: Partial<Parameters<typeof handleRewardsIntakeRequest>[1]> = {}) {
  const calls: unknown[][] = [];
  return { calls, deps: { enabled: true, registry: () => registry(), now, limiter: new RewardsIntegrationLimiter(),
    operation: async (...args: Parameters<Parameters<typeof handleRewardsIntakeRequest>[1]["operation"]>) => { calls.push(args); return receipt; }, ...patch } };
}
function request(path = "activities", data: unknown = event, method = path.startsWith("receipts/") ? "GET" : "POST", key = token) {
  return new Request(`https://fixture.invalid/api/v1/integrations/rewards/intake/${path}`, { method,
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    ...(["GET", "HEAD"].includes(method) ? {} : { body: JSON.stringify(data) }) });
}
test("intake API: off by default, without reading configuration or opening storage", async () => {
  const f = fixture({ enabled: false, registry() { throw Error("must not read"); } });
  assert.equal((await handleRewardsIntakeRequest(request(), f.deps)).status, 404); assert.equal(f.calls.length, 0);
  assert.deepEqual(parseRewardsIntakeRegistry(), { sources: [], clients: [] });
});
test("intake API: strict registry rejects old/preview scopes and ambiguous sources/clients", () => {
  for (const raw of ["secret", "[]", " ".repeat(65537),
    JSON.stringify({ sources: [source], clients: [{ ...client, scopes: ["rewards:preview:validate"] }] }),
    JSON.stringify({ sources: [source], clients: [{ ...client, scopes: ["rewards:activity:ingest"] }] }),
    JSON.stringify({ sources: [source], clients: [{ ...client, sourceId: "missing" }] }),
    JSON.stringify({ sources: [source], clients: [{ ...client, guildId: "111" }] }),
    JSON.stringify({ sources: [source, { ...source, id: "same-binding" }], clients: [client] }),
    JSON.stringify({ sources: [source], clients: [client, client] }),
    JSON.stringify({ sources: [source], clients: [client, { ...client, id: "same-key" }] }),
    JSON.stringify({ sources: [source], clients: [{ ...client, revoked: "false" }] }),
  ]) assert.throws(() => parseRewardsIntakeRegistry(raw), /invalid_rewards_intake_registry/);
});
test("intake API: separate token prefix, expiry/revocation and source revocation", async () => {
  for (const key of ["wrong", token.replace("bri_", "brp_"), token.replace("bri_", "bb_"), token.slice(0, -1) + "b"]) {
    const f = fixture(); assert.equal((await handleRewardsIntakeRequest(request("activities", event, "POST", key), f.deps)).status, 401); assert.equal(f.calls.length, 0);
  }
  for (const changed of [{ revoked: true }, { expiresAt: new Date(now).toISOString() }]) {
    const f = fixture({ registry: () => registry([source], [{ ...client, ...changed }]) });
    assert.equal((await handleRewardsIntakeRequest(request(), f.deps)).status, 401); assert.equal(f.calls.length, 0);
  }
  const f = fixture({ registry: () => registry([{ ...source, revoked: true }]) });
  assert.equal((await handleRewardsIntakeRequest(request(), f.deps)).status, 403); assert.equal(f.calls.length, 0);
});
test("intake API: receipt read/write scopes remain separate and bound to own source", async () => {
  for (const [scopes, path] of [[["rewards:receipts:read"], "activities"], [["rewards:intake:write"], `receipts/${receipt.eventKey}`]] as const) {
    const f = fixture({ registry: () => registry([source], [{ ...client, scopes: [...scopes] }]) });
    assert.equal((await handleRewardsIntakeRequest(request(path), f.deps)).status, 403); assert.equal(f.calls.length, 0);
  }
  const f = fixture();
  assert.equal((await handleRewardsIntakeRequest(request("activities", { ...event, broadcaster_id: "999" }), f.deps)).status, 403);
  assert.equal(f.calls.length, 0);
});
test("intake API: simulation, free grants, actor/org selection and unsupported activities rejected", async () => {
  for (const patch of [{ simulation: true }, { simulation: undefined }, { user_id: source.organizationId }, { organization_id: source.organizationId },
    { bucks: 150 }, { xp: 1 }, { kind: "twitch.subscription" }, { kind: "website.profile_completed" }, { facts: { bits: 100, is_anonymous: true } }]) {
    const f = fixture(); assert.equal((await handleRewardsIntakeRequest(request("activities", { ...event, ...patch }), f.deps)).status, 400); assert.equal(f.calls.length, 0);
  }
  const f = fixture({ registry: () => registry([{ ...source, kinds: ["twitch.follow"] }]) });
  assert.equal((await handleRewardsIntakeRequest(request(), f.deps)).status, 403); assert.equal(f.calls.length, 0);
});
test("intake API: exact routes and methods, no cross-source query overrides", async () => {
  for (const path of ["activities?organization_id=other", "activities?source_id=other"]) {
    const f = fixture(); assert.equal((await handleRewardsIntakeRequest(request(path), f.deps)).status, 400); assert.equal(f.calls.length, 0);
  }
  for (const path of ["award", "activities/extra", "receipts/wrong"]) {
    const f = fixture(); assert.equal((await handleRewardsIntakeRequest(request(path), f.deps)).status, 404); assert.equal(f.calls.length, 0);
  }
  const f = fixture(); const r = await handleRewardsIntakeRequest(request("activities", event, "GET"), f.deps);
  assert.equal(r.status, 405); assert.equal(r.headers.get("allow"), "POST"); assert.equal(f.calls.length, 0);
});
test("intake API: only minimal receipt is projected; freshness/replay is delegated to durable storage", async () => {
  const f = fixture(); const r = await handleRewardsIntakeRequest(request(), f.deps);
  assert.equal(r.status, 200); assert.deepEqual(await r.json(), receipt); assert.equal(r.headers.get("cache-control"), "no-store");
  assert.equal((f.calls[0][0] as { organizationId: string }).organizationId, source.organizationId);
  assert.equal(f.calls[0][1], "receive"); assert.deepEqual(f.calls[0][2], event); assert.equal(f.calls[0][3], null);
  const read = await handleRewardsIntakeRequest(request(`receipts/${receipt.eventKey}`), f.deps);
  assert.equal(read.status, 200); assert.deepEqual(f.calls[1].slice(1), ["receipt", {}, receipt.eventKey]);
  const old = { ...event, occurred_at: "2020-01-01T00:00:00.000Z" };
  assert.equal((await handleRewardsIntakeRequest(request("activities", old), f.deps)).status, 200);
  assert.deepEqual(f.calls[2][2], old);
});
test("intake API: failed current account check stays a technical receipt and never grants anything", async () => {
  const f = fixture({ operation: async () => ({ ...receipt, accountCheckPassed: false, replay: true }) });
  const r = await handleRewardsIntakeRequest(request(), f.deps); assert.equal(r.status, 200);
  const value = await r.json(); assert.equal(value.awarded, false); assert.equal(value.accountCheckPassed, false);
});
test("intake API: drift, unexpected private fields and unsafe success claims fail closed", async () => {
  for (const patch of [{ awarded: true }, { providerProofVerified: true }, { user_id: "private" }, { decision: "awarded" }, { reason: "account_ineligible" }, { persisted: false }]) {
    const f = fixture({ operation: async () => ({ ...receipt, ...patch }) });
    const r = await handleRewardsIntakeRequest(request(), f.deps); assert.equal(r.status, 503); assert.equal((await r.text()).includes("private"), false);
  }
  const f = fixture({ operation: async () => { throw Error("TESTFIXTURE private credential"); } });
  const r = await handleRewardsIntakeRequest(request(), f.deps); assert.equal(r.status, 503); assert.equal((await r.text()).includes("credential"), false);
});
test("intake API: durable conflicts/not-found/freshness map to bounded errors", async () => {
  for (const [error, status] of [["idempotency_conflict", 409], ["not_found", 404], ["event_time_out_of_range", 422], ["invalid_fields", 400], ["secret DB detail", 503]] as const) {
    const f = fixture({ operation: async () => ({ error }) });
    const r = await handleRewardsIntakeRequest(request(), f.deps); assert.equal(r.status, status);
    assert.equal((await r.json()).error.code, status === 503 ? "intake_unavailable" : error);
  }
});
test("intake API: shared bounded body reader and own per-client limiter protect storage", async () => {
  const f = fixture();
  const large = request("activities", "x".repeat(8193));
  assert.equal((await handleRewardsIntakeRequest(large, f.deps)).status, 413); assert.equal(f.calls.length, 0);
  const plain = request(); plain.headers.set("content-type", "text/plain");
  assert.equal((await handleRewardsIntakeRequest(plain, f.deps)).status, 415); assert.equal(f.calls.length, 0);
  const limited = fixture();
  for (let i = 0; i < 60; i++) assert.equal((await handleRewardsIntakeRequest(request(), limited.deps)).status, 200);
  const r = await handleRewardsIntakeRequest(request(`receipts/${receipt.eventKey}`), limited.deps);
  assert.equal(r.status, 429); assert.equal(r.headers.get("retry-after"), "60"); assert.equal(limited.calls.length, 60);
});
