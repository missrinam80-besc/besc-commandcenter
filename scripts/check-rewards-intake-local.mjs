// Built Next route + fake loopback PostgREST. No Cloud/provider/database access.
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createServer as reservationServer } from "node:net";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

const org = "10000000-0000-4000-8000-000000000001", broadcaster = "123456789";
const token = `bri_fixture-http.${randomBytes(32).toString("base64url")}`;
const registry = { sources: [{ id: "fixture-source", organizationId: org, platform: "twitch", broadcasterId: broadcaster, kinds: ["twitch.cheer"], revoked: false }],
  clients: [{ id: "fixture-http", sourceId: "fixture-source", keyHash: createHash("sha256").update(token).digest("hex"), scopes: ["rewards:intake:write", "rewards:receipts:read"], expiresAt: "2099-01-01T00:00:00.000Z", revoked: false }] };
const event = { schemaVersion: 1, simulation: false, kind: "twitch.cheer", event_id: "30000000-0000-4000-8000-000000000001", broadcaster_id: broadcaster, twitch_user_id: "987654321", occurred_at: new Date().toISOString(), facts: { bits: 100, is_anonymous: false } };
const receipt = { schemaVersion: 1, mode: "intake_only", receiptId: "40000000-0000-4000-8000-000000000001", eventKey: "a".repeat(64), receivedAt: new Date().toISOString(), decision: "held", reason: "earning_disabled", persisted: true, awarded: false, earningEnabled: false, identityChecked: true, accountCheckPassed: true, providerProofVerified: false, replay: false };
let mode = "ok", calls = 0, received = false, closed = false;
const upstream = createServer(async (req, res) => {
  calls++;
  if (mode === "stall") {
    req.socket.once("close", () => { closed = true; });
    res.writeHead(200, { "content-type": "application/json" }); res.write("{"); return;
  }
  try {
    assert.equal(req.url, "/rest/v1/rpc/rewards_intake");
    const chunks = []; for await (const part of req) chunks.push(part);
    const body = JSON.parse(Buffer.concat(chunks));
    assert.equal(body.o, org); assert.equal(body.b, broadcaster);
    assert.deepEqual(Object.keys(body).sort(), ["b", "d", "k", "o", "op"]);
    res.setHeader("content-type", "application/json");
    if (mode === "conflict") return res.end(JSON.stringify({ error: "idempotency_conflict" }));
    if (mode === "unsafe") return res.end(JSON.stringify({ ...receipt, user_id: "PRIVATE TESTFIXTURE", awarded: true }));
    if (body.op === "receive") {
      assert.deepEqual(body.d, event); assert.equal(body.k, null);
      const replay = received; received = true; return res.end(JSON.stringify({ ...receipt, replay }));
    }
    assert.equal(body.op, "receipt"); assert.deepEqual(body.d, {}); assert.equal(body.k, receipt.eventKey);
    res.end(JSON.stringify({ ...receipt, replay: true }));
  } catch { res.statusCode = 500; res.end('{"message":"TESTFIXTURE mock assertion failed"}'); }
});
upstream.listen(0, "127.0.0.1"); await once(upstream, "listening");
const upstreamUrl = `http://127.0.0.1:${upstream.address().port}`;
try {
  for (const enabled of [false, true]) {
    const reservation = reservationServer(); reservation.listen(0, "127.0.0.1"); await once(reservation, "listening");
    const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
    const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
      cwd: fileURLToPath(new URL("../", import.meta.url)), windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", SUPABASE_URL_SERVER: upstreamUrl, NEXT_PUBLIC_SUPABASE_URL: upstreamUrl,
        SUPABASE_SECRET_KEY: "TESTFIXTURE-NOT-A-REAL-SECRET", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "TESTFIXTURE-NOT-A-REAL-KEY",
        BESC_REWARDS_INTAKE_ENABLED: String(enabled), BESC_REWARDS_INTAKE_REGISTRY_JSON: enabled ? JSON.stringify(registry) : "invalid-on-purpose" },
    });
    child.stdout.resume(); child.stderr.resume(); const exited = once(child, "exit");
    const base = `http://127.0.0.1:${port}/api/v1/integrations/rewards/intake/`;
    const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
    const post = (data = event) => fetch(base + "activities", { method: "POST", headers, body: JSON.stringify(data), signal: AbortSignal.timeout(8000) });
    try {
      let ready = false;
      for (let n = 0; n < 100; n++) {
        if (child.exitCode !== null) throw Error("Local Next process exited");
        try { await fetch(base + "activities", { signal: AbortSignal.timeout(300) }); ready = true; break; }
        catch { await new Promise(resolve => setTimeout(resolve, 100)); }
      }
      assert.equal(ready, true);
      if (!enabled) {
        assert.equal((await post()).status, 404); assert.equal(calls, 0);
        console.info("PASS: disabled intake makes no registry/upstream call"); continue;
      }
      assert.equal((await fetch(base + "activities", { method: "POST" })).status, 401); assert.equal(calls, 0);
      for (const [patch, status] of [[{ broadcaster_id: "999" }, 403], [{ bucks: 150 }, 400], [{ simulation: true }, 400]]) assert.equal((await post({ ...event, ...patch })).status, status);
      assert.equal(calls, 0);
      const first = await post(); assert.equal(first.status, 200); assert.deepEqual(await first.json(), receipt); assert.equal(first.headers.get("cache-control"), "no-store");
      const replay = await post(); assert.equal(replay.status, 200); assert.equal((await replay.json()).receiptId, receipt.receiptId);
      const lookup = await fetch(base + "receipts/" + receipt.eventKey, { headers }); assert.equal(lookup.status, 200); assert.equal((await lookup.json()).awarded, false);
      mode = "conflict"; assert.equal((await post()).status, 409);
      mode = "unsafe"; const unsafe = await post(); assert.equal(unsafe.status, 503); assert.equal((await unsafe.text()).includes("PRIVATE"), false);
      mode = "stall"; const start = Date.now(); const timed = await post(); assert.equal(timed.status, 503); assert.ok(Date.now() - start < 7500);
      for (let n = 0; n < 100 && !closed; n++) await new Promise(resolve => setTimeout(resolve, 10));
      assert.equal(closed, true, "Real responsebody I/O must be cancelled");
      console.info("PASS: built intake route enforces source binding, safe receipt projection, replay, conflicts and actual upstream cancellation");
    } finally { child.kill(); await exited; }
  }
} finally { const stopped = new Promise(resolve => upstream.close(resolve)); upstream.closeAllConnections(); await stopped; }
