import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  handleRewardsPreviewRequest, hashRewardsPreviewKey, parseRewardsPreviewRegistry,
  readRewardsPreviewBody, RewardsPreviewLimiter,
} from "../src/lib/rewards-integration-preview.ts";

// TESTFIXTURE — NIET PUBLICEREN. No provider account, real credential or money.
const now = Date.parse("2026-10-18T20:00:00.000Z");
const token = "brp_fixture-bridge." + "a".repeat(43);
const source = { id: "fixture-twitch", organizationId: "10000000-0000-4000-8000-000000000001", platform: "twitch", broadcasterId: "123456789", kinds: ["twitch.follow", "twitch.cheer"], revoked: false };
const client = { id: "fixture-bridge", sourceId: source.id, keyHash: hashRewardsPreviewKey(token), scopes: ["rewards:preview:read", "rewards:preview:validate"], expiresAt: "2027-01-01T00:00:00.000Z", revoked: false };
const event = { schemaVersion: 1, simulation: true, kind: "twitch.cheer", event_id: "30000000-0000-4000-8000-000000000001", broadcaster_id: source.broadcasterId, twitch_user_id: "987654321", occurred_at: new Date(now).toISOString(), facts: { bits: 100, is_anonymous: false } };
function registry(sources = [source], clients = [client]) {
  return parseRewardsPreviewRegistry(JSON.stringify({ sources, clients }));
}
function deps(patch: Partial<Parameters<typeof handleRewardsPreviewRequest>[1]> = {}) {
  return { enabled: true, registry: () => registry(), now, limiter: new RewardsPreviewLimiter(), ...patch };
}
function request(resource = "validate", value: unknown = event, options: { token?: string; method?: string; query?: string; headers?: Record<string, string> } = {}) {
  const method = options.method ?? (resource === "config" ? "GET" : "POST");
  return new Request(`https://fixture.invalid/api/v1/integrations/rewards/preview/${resource}${options.query ?? ""}`, {
    method, headers: { authorization: `Bearer ${options.token ?? token}`, "content-type": "application/json", ...options.headers },
    ...(["GET", "HEAD"].includes(method) ? {} : { body: JSON.stringify(value) }),
  });
}
async function code(response: Response) { return (await response.json()).error.code; }

test("preview: defaults off without even reading credentials", async () => {
  const r = await handleRewardsPreviewRequest(request(), deps({ enabled: false, registry() { throw Error("must not read"); } }));
  assert.equal(r.status, 404); assert.equal(await code(r), "not_found");
  assert.deepEqual(parseRewardsPreviewRegistry(), { sources: [], clients: [] });
});

test("preview: strict source/client registry rejects invalid, ambiguous and bot configuration", () => {
  for (const value of ["{}", "[]", "secret", JSON.stringify({ sources: [source], clients: [{ ...client, guildId: "111" }] }),
    JSON.stringify({ sources: [source], clients: [{ ...client, keyHash: "secret" }] }),
    JSON.stringify({ sources: [source], clients: [{ ...client, scopes: ["rewards:activity:ingest"] }] }),
    JSON.stringify({ sources: [source], clients: [{ ...client, expiresAt: "tomorrow" }] }),
    JSON.stringify({ sources: [source], clients: [{ ...client, sourceId: "missing" }] }),
    JSON.stringify({ sources: [source, { ...source, id: "duplicate-binding" }], clients: [client] }),
    JSON.stringify({ sources: [source, source], clients: [client] }),
    JSON.stringify({ sources: [source], clients: [client, client] }),
    JSON.stringify({ sources: [source], clients: [client, { ...client, id: "same-hash" }] }),
    JSON.stringify({ sources: [{ ...source, kinds: ["twitch.follow", "twitch.follow"] }], clients: [client] }),
    JSON.stringify({ sources: [source], clients: [{ ...client, scopes: ["rewards:preview:read", "rewards:preview:read"] }] }),
    JSON.stringify({ sources: Array(33).fill(source), clients: [] }), " ".repeat(65537)]) {
    assert.throws(() => parseRewardsPreviewRegistry(value), /^Error: invalid_rewards_preview_registry$/);
  }
});

test("preview: no existing Discord or management token is accepted", async () => {
  for (const key of ["", "wrong", token.replace("brp_", "bb_"), token.slice(0, -1) + "b", token + "x"]) {
    const r = await handleRewardsPreviewRequest(request("validate", event, { token: key }), deps());
    assert.equal(r.status, 401); assert.equal(r.headers.get("www-authenticate"), "Bearer");
  }
});

test("preview: expired and revoked clients or source are refused", async () => {
  for (const patch of [{ revoked: true }, { expiresAt: new Date(now).toISOString() }]) {
    const r = await handleRewardsPreviewRequest(request(), deps({ registry: () => registry([source], [{ ...client, ...patch }]) }));
    assert.equal(r.status, 401);
  }
  const r = await handleRewardsPreviewRequest(request(), deps({ registry: () => registry([{ ...source, revoked: true }]) }));
  assert.equal(r.status, 403); assert.equal(await code(r), "source_unavailable");
});

test("preview: read and validation scopes are separate", async () => {
  for (const [scopes, resource] of [[["rewards:preview:read"], "validate"], [["rewards:preview:validate"], "config"]] as const) {
    const r = await handleRewardsPreviewRequest(request(resource), deps({ registry: () => registry([source], [{ ...client, scopes: [...scopes] }]) }));
    assert.equal(r.status, 403); assert.equal(await code(r), "insufficient_scope");
  }
});

test("preview: config discloses only own source capabilities and no accounts or credentials", async () => {
  const r = await handleRewardsPreviewRequest(request("config"), deps());
  assert.equal(r.status, 200);
  const value = await r.json();
  assert.deepEqual(value.source, { platform: "twitch", broadcasterId: source.broadcasterId, kinds: source.kinds });
  assert.equal(value.earningEnabled, false); assert.equal(value.persisted, false); assert.equal(value.awarded, false);
  assert.equal(value.limits.bodyBytes, 8192);
  for (const secret of [client.keyHash, client.id, source.id, source.organizationId, "rules", "balance"]) assert.equal(JSON.stringify(value).includes(secret), false);
});

test("preview: only exact routes, methods and no query are allowed", async () => {
  for (const resource of ["activities", "receipts/30000000", "validate/extra", "admin"]) {
    assert.equal((await handleRewardsPreviewRequest(request(resource), deps())).status, 404);
  }
  for (const method of ["POST", "DELETE", "OPTIONS"]) {
    const r = await handleRewardsPreviewRequest(request("config", event, { method }), deps());
    assert.equal(r.status, 405); assert.equal(r.headers.get("allow"), "GET");
  }
  assert.equal((await handleRewardsPreviewRequest(request("validate", event, { method: "GET" }), deps())).status, 405);
  for (const query of ["?source_id=other", "?organization_id=other", "?x=1&x=2"]) {
    assert.equal((await handleRewardsPreviewRequest(request("validate", event, { query }), deps())).status, 400);
  }
});

test("preview: broadcaster and event kinds are bound to the registered source", async () => {
  const r = await handleRewardsPreviewRequest(request("validate", { ...event, broadcaster_id: "123" }), deps());
  assert.equal(r.status, 403); assert.equal(await code(r), "source_not_allowed");
  const limited = deps({ registry: () => registry([{ ...source, kinds: ["twitch.follow"] }]) });
  const restricted = await handleRewardsPreviewRequest(request(), limited);
  assert.equal(restricted.status, 403); assert.equal(await code(restricted), "kind_not_allowed");
});

test("preview: only simulations; callers cannot choose money, member, source, policy or proof", async () => {
  for (const patch of [{ simulation: false }, { simulation: undefined }, { bucks: 150 }, { xp: 1 }, { user_id: "someone" },
    { organization_id: source.organizationId }, { source_id: source.id }, { rule_version: 1 }, { proofVerified: true }, { content: "private" }]) {
    const r = await handleRewardsPreviewRequest(request("validate", { ...event, ...patch }), deps());
    assert.equal(r.status, 400); assert.equal(await code(r), "invalid_fields");
  }
});

test("preview: unsupported activities stay unsupported until their adapters and semantics exist", async () => {
  for (const kind of ["twitch.presence", "twitch.subscription", "twitch.raid", "twitch.tip", "discord.text", "website.profile_completed", "website.article_read", "social.like"]) {
    assert.equal((await handleRewardsPreviewRequest(request("validate", { ...event, kind }), deps())).status, 400);
  }
});

test("preview: only numeric immutable Twitch actors, no aliases, anonymous cheers or malformed facts", async () => {
  for (const patch of [{ twitch_user_id: "name" }, { twitch_user_id: 987654321 }, { twitch_user_id: "0" }, { twitch_user_id: "01" },
    { event_id: "random-retry-id" }, { facts: { bits: 100, is_anonymous: true } }, { facts: { bits: 1.5, is_anonymous: false } },
    { facts: { bits: 0, is_anonymous: false } }, { facts: { bits: 1_000_001, is_anonymous: false } },
    { facts: { bits: 100, is_anonymous: false, message: "private" } }]) {
    assert.equal((await handleRewardsPreviewRequest(request("validate", { ...event, ...patch }), deps())).status, 400);
  }
});

test("preview: freshness boundaries and strict UTC dates", async () => {
  for (const offset of [-120000, 5000]) {
    const r = await handleRewardsPreviewRequest(request("validate", { ...event, occurred_at: new Date(now + offset).toISOString() }), deps());
    assert.equal(r.status, 200);
  }
  for (const offset of [-120001, 5001]) {
    const r = await handleRewardsPreviewRequest(request("validate", { ...event, occurred_at: new Date(now + offset).toISOString() }), deps());
    assert.equal(r.status, 422);
  }
  for (const occurred_at of ["2026-10-18", "2026-10-18T20:00:00", "2026-02-30T20:00:00.000Z"]) {
    assert.equal((await handleRewardsPreviewRequest(request("validate", { ...event, occurred_at }), deps())).status, 400);
  }
});

test("preview: successful validation explicitly makes no eligibility, proof, receipt or award claim", async () => {
  const r = await handleRewardsPreviewRequest(request(), deps());
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), {
    schemaVersion: 1, mode: "preview", earningEnabled: false, persisted: false, awarded: false,
    status: "validated_only", identityChecked: false, proofVerified: false,
    observationKey: "12509189e32f3f26bf70d83064b68f78e954b18db3e7bd954a3b5e6cef36ce3d",
    contentHash: "279fe751d90100ce3d2235e883429b0acef5387b725a00efeaa2e310b558764c",
  });
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
});

test("preview: rotation and field ordering preserve keys; changed facts conflict by hash", async () => {
  const first = await (await handleRewardsPreviewRequest(request(), deps())).json();
  const rotatedToken = "brp_rotated-bridge." + "b".repeat(43);
  const rotated = registry([{ ...source, id: "renamed-source" }], [{ ...client, id: "rotated-bridge", sourceId: "renamed-source", keyHash: hashRewardsPreviewKey(rotatedToken) }]);
  const reordered = Object.fromEntries(Object.entries(event).reverse());
  const second = await (await handleRewardsPreviewRequest(request("validate", reordered, { token: rotatedToken }), deps({ registry: () => rotated }))).json();
  assert.equal(first.observationKey, second.observationKey); assert.equal(first.contentHash, second.contentHash);
  const changed = await (await handleRewardsPreviewRequest(request("validate", { ...event, facts: { bits: 101, is_anonymous: false } }), deps())).json();
  assert.equal(first.observationKey, changed.observationKey); assert.notEqual(first.contentHash, changed.contentHash);
  const other = await (await handleRewardsPreviewRequest(request(), deps({ registry: () => registry([{ ...source, organizationId: "10000000-0000-4000-8000-000000000002" }]) }))).json();
  assert.notEqual(first.observationKey, other.observationKey);
});

test("preview: follow has its own exact schema and transport key, no once-only financial policy", async () => {
  const follow = { ...event, kind: "twitch.follow", facts: {} };
  const a = await (await handleRewardsPreviewRequest(request("validate", follow), deps())).json();
  assert.equal(a.status, "validated_only");
  const b = await (await handleRewardsPreviewRequest(request("validate", { ...follow, event_id: "30000000-0000-4000-8000-000000000002" }), deps())).json();
  assert.notEqual(a.observationKey, b.observationKey);
  assert.equal((await handleRewardsPreviewRequest(request("validate", { ...follow, facts: { bits: 100 } }), deps())).status, 400);
});

test("preview: per-client rate limit shares config and validation and resets after a minute", async () => {
  const d = deps();
  for (let i = 0; i < 60; i++) assert.equal((await handleRewardsPreviewRequest(request("config"), d)).status, 200);
  const r = await handleRewardsPreviewRequest(request(), d);
  assert.equal(r.status, 429); assert.equal(r.headers.get("retry-after"), "60");
  assert.equal((await handleRewardsPreviewRequest(request("config"), { ...d, now: now + 60000 })).status, 200);
});

test("preview: content-type, claimed size and actual streamed bytes are bounded", async () => {
  for (const [headers, status] of [[{ "content-type": "text/plain" }, 415], [{ "content-length": "8193" }, 413], [{ "content-length": "-1" }, 400]] as const) {
    assert.equal((await handleRewardsPreviewRequest(request("validate", event, { headers }), deps())).status, status);
  }
  const large = request("validate", "x".repeat(8193));
  assert.equal((await handleRewardsPreviewRequest(large, deps())).status, 413);
  const bad = new Request(request().url, { method: "POST", headers: request().headers, body: "{" });
  assert.equal((await handleRewardsPreviewRequest(bad, deps())).status, 400);
});

test("preview: UTF-8 decoding is strict and stuck/aborted bodies cancel their reader", async () => {
  const headers = { "content-type": "application/json" };
  const bad = new Request("https://fixture.invalid", { method: "POST", headers, body: new Uint8Array([0xff]) });
  await assert.rejects(readRewardsPreviewBody(bad), /invalid_body/);
  let cancelled = false;
  const stream = new ReadableStream({ cancel() { cancelled = true; } });
  const stuck = new Request("https://fixture.invalid", { method: "POST", headers, body: stream, duplex: "half" } as RequestInit);
  await assert.rejects(readRewardsPreviewBody(stuck, 20), /body_timeout/); assert.equal(cancelled, true);
  const controller = new AbortController();
  const aborted = new Request("https://fixture.invalid", { method: "POST", headers, body: new ReadableStream(), signal: controller.signal, duplex: "half" } as RequestInit);
  controller.abort(); await assert.rejects(readRewardsPreviewBody(aborted), /request_aborted/);
});

test("preview: registry failures never disclose hashes or underlying details", async () => {
  const r = await handleRewardsPreviewRequest(request(), deps({ registry() { throw Error(`secret=${client.keyHash}`); } }));
  assert.equal(r.status, 503); const value = await r.json(); assert.equal(value.error.code, "preview_unavailable");
  assert.equal(JSON.stringify(value).includes(client.keyHash), false);
});

test("preview: fixture is executable and runtime route has no database or existing bot credentials", async () => {
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/rewards-integration-preview-v1.json", import.meta.url), "utf8"));
  assert.equal((await handleRewardsPreviewRequest(request("validate", fixture.cheer), deps())).status, 200);
  const runtime = readFileSync(new URL("../src/app/api/v1/integrations/rewards/preview/[...path]/route.ts", import.meta.url), "utf8");
  for (const blocked of ["createAdminClient", "BESC_BOT_CLIENTS_JSON", ".rpc(", "BESC_REWARDS_ACTIVITY_ENABLED"]) assert.equal(runtime.includes(blocked), false);
});
