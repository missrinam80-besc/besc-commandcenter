import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { createServer as createHttpServer } from "node:http";
import { once } from "node:events";

// Local Next.js production-server smoke. All credentials and upstream data are synthetic loopback fixtures.
const key = `bb_fixture-smoke.${randomBytes(32).toString("base64url")}`;
const guild = "111111111111111111";
const reservation = createServer(); reservation.listen(0, "127.0.0.1"); await once(reservation, "listening");
const address = reservation.address(); assert.ok(address && typeof address !== "string");
const port = address.port; await new Promise(resolve => reservation.close(resolve));
let mode = "failure", stalled = false, closed = false;
const upstream = createHttpServer((req, res) => {
  if (mode === "failure") { res.writeHead(503); res.end("TESTFIXTURE"); return; }
  stalled = true; req.socket.once("close", () => { closed = true; });
});
upstream.listen(0, "127.0.0.1"); await once(upstream, "listening");
const upstreamAddress = upstream.address(); assert.ok(upstreamAddress && typeof upstreamAddress !== "string");
const upstreamUrl = `http://127.0.0.1:${upstreamAddress.port}`;
const cwd = fileURLToPath(new URL("../", import.meta.url));
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", SUPABASE_URL_SERVER: upstreamUrl, NEXT_PUBLIC_SUPABASE_URL: upstreamUrl,
    SUPABASE_SECRET_KEY: "TESTFIXTURE-NOT-A-REAL-SECRET", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "TESTFIXTURE-NOT-A-REAL-KEY",
    BESC_BOT_CLIENTS_JSON: JSON.stringify([{ id: "fixture-smoke", keyHash: createHash("sha256").update(key).digest("hex"),
      organizationId: "11111111-1111-4111-8111-111111111111", guildId: guild,
      scopes: ["identity:read", "account:read", "events:read"], expiresAt: "2099-01-01T00:00:00Z", revoked: false }]) },
});
child.stdout.resume(); child.stderr.resume();
const exited = once(child, "exit");
try {
  const base = `http://127.0.0.1:${port}/api/v1/bot/`;
  let ready = false;
  for (let n = 0; n < 100; n++) {
    if (child.exitCode !== null) throw Error("Local Next process exited");
    try { await fetch(`${base}identity?guild_id=${guild}`, { signal: AbortSignal.timeout(300) }); ready = true; break; }
    catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  assert.equal(ready, true);
  const headers = { authorization: `Bearer ${key}` };
  const identity = await fetch(`${base}identity?guild_id=${guild}`, { headers });
  assert.equal(identity.status, 200); assert.equal((await identity.json()).clientId, "fixture-smoke");
  assert.equal(identity.headers.get("cache-control"), "no-store");
  assert.equal((await fetch(`${base}identity?guild_id=${guild}`)).status, 401);
  assert.equal((await fetch(`${base}identity?guild_id=222222222222222222`, { headers })).status, 403);
  assert.equal((await fetch(`${base}identity?guild_id=${guild}&organization_id=other`, { headers })).status, 400);
  assert.equal((await fetch(`${base}unknown?guild_id=${guild}`, { headers })).status, 404);
  assert.equal((await fetch(`${base}identity`, { method: "POST", headers })).status, 405);
  const account = await fetch(`${base}account?guild_id=${guild}&discord_user_id=222222222222222222`, { headers });
  assert.equal(account.status, 503); assert.equal((await account.json()).error.code, "upstream_unavailable");
  mode = "stall";
  const started = Date.now();
  const timeout = await fetch(`${base}account?guild_id=${guild}&discord_user_id=222222222222222222`, {
    headers, signal: AbortSignal.timeout(8000),
  });
  assert.equal(timeout.status, 503);
  const failure = await timeout.json(); assert.equal(failure.error.code, "upstream_unavailable");
  assert.equal(failure.error.requestId, timeout.headers.get("x-request-id"));
  assert.ok(Date.now() - started < 7500); assert.equal(stalled, true);
  for (let n = 0; n < 100 && !closed; n++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(closed, true, "route-timeout annuleert de upstreamsocket vóór cleanup");
  console.info("PASS: 9 lokale Next.js-routechecks, inclusief timeout met echte upstreamannulering. Geen Cloud-verbindingen.");
} finally { child.kill(); await exited; upstream.close(); upstream.closeAllConnections(); }
