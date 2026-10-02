import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
// @ts-expect-error Node's test runner loads TypeScript source directly.
import { handleScheduledSocialSync, isScheduledAccountDue, loadScheduledAccounts } from "../src/lib/social-sync-scheduler.ts";

const now = Date.parse("2026-10-02T04:15:00Z");
const account = (id = "fb") => ({ id, platform: "facebook", last_sync_at: null as string | null, sync_interval_minutes: 1440 });
const request = (query = "", token = "secret") => new Request(`http://localhost/api/cron/social-sync${query}`, {
  headers: token ? { Authorization: `Bearer ${token}` } : {},
});

test("ontbrekende configuratie en verkeerde tokens raken de database niet", async () => {
  let calls = 0;
  const deps = { secret: "secret", loadAccounts: async () => { calls++; return []; }, syncAccount: async () => { calls++; return { status: "succeeded" }; } };
  assert.equal((await handleScheduledSocialSync(request(), { ...deps, secret: undefined })).status, 503);
  for (const token of ["", "wrong"]) assert.equal((await handleScheduledSocialSync(request("", token), deps)).status, 401);
  assert.equal(calls, 0);
});

test("intervalgrens, eerste sync en minimuminterval worden gerespecteerd", () => {
  assert.equal(isScheduledAccountDue(account(), now), true);
  assert.equal(isScheduledAccountDue({ ...account(), last_sync_at: "2026-10-01T04:15:00Z" }, now), true);
  assert.equal(isScheduledAccountDue({ ...account(), last_sync_at: "2026-10-01T04:15:01Z" }, now), false);
  assert.equal(isScheduledAccountDue({ ...account(), sync_interval_minutes: 1, last_sync_at: "2026-10-02T04:01:00Z" }, now), false);
});

test("accountselectie haalt meer dan honderd records op", async () => {
  const source = Array.from({ length: 105 }, (_, i) => account(String(i)));
  const ranges: number[][] = [];
  const loaded = await loadScheduledAccounts(async (from, to) => { ranges.push([from, to]); return source.slice(from, to + 1); });
  assert.equal(loaded.length, 105);
  assert.deepEqual(ranges, [[0, 99], [100, 199]]);
});

test("dry-run wijzigt niets en past de batchlimiet pas na due-filter toe", async () => {
  const recent = Array.from({ length: 8 }, (_, i) => ({ ...account(String(i)), last_sync_at: "2026-10-02T04:14:00Z" }));
  const response = await handleScheduledSocialSync(request("?dry_run=1"), {
    secret: "secret", now: () => now, loadAccounts: async () => [...recent, account("due")],
    syncAccount: async () => { throw new Error("Mag niet worden aangeroepen"); },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { ok: true, dryRun: true, considered: 9, due: 1, batch: [{ id: "due", platform: "facebook" }], remaining: 0 });
});

test("gedeeltelijke runs zijn geen geslaagde runs en geven foutstatus", async () => {
  const response = await handleScheduledSocialSync(request(), {
    secret: "secret", now: () => now, loadAccounts: async () => [account("ok"), account("partial"), account("fail"), account("skip")],
    syncAccount: async ({ id }) => { if (id === "fail") throw new Error("private details"); return { status: id === "ok" ? "succeeded" : id === "skip" ? "skipped" : "partial" }; },
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { ok: false, considered: 4, due: 4, processed: 4, succeeded: 1, partial: 1, failed: 1, skipped: 1, remaining: 0 });
});

test("maximaal acht accounts per batch, de rest wordt gerapporteerd", async () => {
  let calls = 0;
  const response = await handleScheduledSocialSync(request(), {
    secret: "secret", now: () => now, loadAccounts: async () => Array.from({ length: 9 }, (_, i) => account(String(i))),
    syncAccount: async () => { calls++; return { status: "succeeded" }; },
  });
  assert.equal(calls, 8);
  assert.equal((await response.json()).remaining, 1);
});

test("onmiddellijke tweede aanroep verwerkt geen recent gesynchroniseerd account", async () => {
  const mutable = account();
  let calls = 0;
  const deps = { secret: "secret", now: () => now, loadAccounts: async () => [mutable], syncAccount: async () => {
    calls++; mutable.last_sync_at = new Date(now).toISOString(); return { status: "succeeded" };
  } };
  await handleScheduledSocialSync(request(), deps);
  const second = await handleScheduledSocialSync(request(), deps);
  assert.equal((await second.json()).due, 0);
  assert.equal(calls, 1);
});

test("queryfout geeft geen interne details of succesvolle lege run", async () => {
  const response = await handleScheduledSocialSync(request(), { secret: "secret", loadAccounts: async () => { throw new Error("secret database URL"); }, syncAccount: async () => ({ status: "succeeded" }) });
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { ok: false, error: "account_query_failed" });
});

test("productieroute filtert actieve auto-sync accounts en workers behouden dubbele-runbescherming", () => {
  const route = readFileSync(new URL("../src/app/api/cron/social-sync/route.ts", import.meta.url), "utf8");
  for (const predicate of ['.eq("status", "connected")', '.eq("sync_enabled", true)', '.is("deleted_at", null)']) assert.ok(route.includes(predicate));
  const migration = readFileSync(new URL("../supabase/migrations/20260803150500_add_social_integration_core.sql", import.meta.url), "utf8");
  assert.ok(migration.includes("unique(social_account_id,idempotency_key)"));
  for (const platform of ["meta", "youtube", "twitch", "threads"]) {
    const worker = readFileSync(new URL(`../src/lib/${platform}-sync.ts`, import.meta.url), "utf8");
    assert.ok(worker.includes('runError?.code === "23505"'));
    assert.ok(worker.includes('status: "skipped"'));
  }
});

test("VPS-script kiest expliciet de serverconfiguratie, niet de lokale Compose-configuratie", () => {
  const script = readFileSync(new URL("../ops/run-social-sync.sh", import.meta.url), "utf8");
  assert.ok(script.includes('${BESC_COMPOSE_FILE:-docker-compose.server.yml}'));
  assert.ok(script.includes('[[ ! -f "$sync_compose_file" ]]'));
  assert.ok(script.includes('docker compose -f "$sync_compose_file" exec -T web'));
});
