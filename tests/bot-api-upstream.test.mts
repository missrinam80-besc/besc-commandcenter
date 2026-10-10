import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { createClient } from "@supabase/supabase-js";
import { withBotUpstream, BotUpstreamAborted } from "../src/lib/bot-api-upstream.ts";
import { handleBotRequest, hashBotKey, type BotStore } from "../src/lib/bot-api.ts";

const userId = "33333333-3333-4333-8333-333333333333";
const org = "11111111-1111-4111-8111-111111111111", guild = "111111111111111111", discord = "222222222222222222";
const key = `bb_fixture-upstream.${"a".repeat(43)}`;
const clients = [{ id: "fixture-upstream", keyHash: hashBotKey(key), organizationId: org, guildId: guild,
  scopes: ["events:read" as const], expiresAt: "2099-01-01T00:00:00Z", revoked: false }];
const compiled = { exports: {} as Record<string, unknown> };
const source = readFileSync(new URL("../src/lib/bot-api-store.ts", import.meta.url), "utf8");
const imports: Record<string, unknown> = { "server-only": {}, "@/lib/supabase/admin": {},
  "@/lib/profile-identities": { findIdentity: (identities: { provider: string }[], provider: string) => identities.find(i => i.provider === provider),
    discordIdentityDetails: (identity: { identity_data: { sub: string } } | undefined) => identity ? { userId: identity.identity_data.sub } : null } };
runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
  module: compiled, exports: compiled.exports, require: (id: string) => { assert.ok(id in imports); return imports[id]; }, Date,
});
const createStore = compiled.exports.createBotStore as (admin: unknown) => BotStore;

for (const stage of ["profiles", "auth", "membership", "events", "auth-body"]) {
  test(`Echte Supabase SDK: vastlopende ${stage} wordt afgebroken en upstreamsocket sluit`, async () => {
    let stalled = false, closed = false;
    const server = createServer((req, res) => {
      const path = req.url ?? "";
      const kind = path.startsWith("/auth/") ? "auth" : path.startsWith("/rest/v1/profiles") ? "profiles"
        : path.startsWith("/rest/v1/organization_members") ? "membership" : "events";
      if (kind === stage || (stage === "auth-body" && kind === "auth")) {
        stalled = true;
        req.socket.once("close", () => { closed = true; });
        if (stage === "auth-body") { res.writeHead(200, { "Content-Type": "application/json" }); res.write('{"id":'); }
        return;
      }
      const body = kind === "profiles" ? { id: userId } : kind === "auth" ? { id: userId, identities: [{ provider: "discord", identity_data: { sub: discord } }] }
        : kind === "membership" ? { organization_id: org, role: "member", status: "active", finance_role: "none", organization_access_roles: null } : [];
      res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(body));
    });
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    try {
      const address = server.address(); assert.ok(address && typeof address !== "string");
      const started = Date.now();
      await assert.rejects(withBotUpstream(fetcher => {
        const admin = createClient(`http://127.0.0.1:${address.port}`, "TESTFIXTURE-NOT-A-SECRET", {
          auth: { autoRefreshToken: false, persistSession: false }, global: { fetch: fetcher },
        });
        return handleBotRequest(new Request(`https://example.invalid/api/v1/bot/events?guild_id=${guild}&discord_user_id=${discord}`,
          { headers: { authorization: `Bearer ${key}` } }), { clients, store: createStore(admin) });
      }, { timeoutMs: 500 }), (error: unknown) => error instanceof BotUpstreamAborted);
      assert.equal(stalled, true); assert.ok(Date.now() - started < 3000);
      for (let n = 0; n < 100 && !closed; n++) await new Promise(resolve => setTimeout(resolve, 10));
      assert.equal(closed, true, "native fetch moet de upstreamsocket sluiten vóór testcleanup");
    } finally { server.close(); server.closeAllConnections(); }
  });
}

test("Botrequest-annulering wordt doorgegeven; SDK kan daarna geen nieuwe fetch starten", async () => {
  const parent = new AbortController(); let cancelled = false, retryBlocked = false;
  await assert.rejects(withBotUpstream(async fetcher => {
    const pending = fetcher("http://127.0.0.1/").catch(() => { cancelled = true; });
    parent.abort(); await pending;
    try { await fetcher("http://127.0.0.1/"); } catch { retryBlocked = true; }
  }, { signal: parent.signal, fetcher: ((_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new Error("cancelled")), { once: true });
  })) as typeof fetch }), (error: unknown) => error instanceof BotUpstreamAborted);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(cancelled, true); assert.equal(retryBlocked, true);
});

test("Het budget geldt over opeenvolgende calls, niet opnieuw per query", async () => {
  let calls = 0;
  await assert.rejects(withBotUpstream(async fetcher => {
    await fetcher("http://127.0.0.1/first"); await fetcher("http://127.0.0.1/second");
  }, { timeoutMs: 100, fetcher: ((_input, init) => new Promise((resolve, reject) => {
    calls++; const timer = setTimeout(() => resolve(new Response("{}")), 70);
    init?.signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new Error("cancelled")); }, { once: true });
  })) as typeof fetch }), (error: unknown) => error instanceof BotUpstreamAborted);
  assert.equal(calls, 2);
});

test("Succes en vroege fout behouden resultaat en ruimen lopende aanvragen op", async () => {
  assert.equal(await withBotUpstream(async () => "success", { timeoutMs: 50 }), "success");
  let aborted = false;
  const sentinel = new Error("fixture-error");
  await assert.rejects(withBotUpstream(async fetcher => {
    void fetcher("http://127.0.0.1/").catch(() => {}); throw sentinel;
  }, { fetcher: ((_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => { aborted = true; reject(new Error("cancelled")); }, { once: true });
  })) as typeof fetch }), error => error === sentinel);
  assert.equal(aborted, true);
});

test("Een vooraf geannuleerde aanvraag start geen operatie of upstreamverkeer", async () => {
  const parent = new AbortController(); parent.abort(); let started = false;
  await assert.rejects(withBotUpstream(async () => { started = true; }, { signal: parent.signal }),
    (error: unknown) => error instanceof BotUpstreamAborted);
  assert.equal(started, false);
});
