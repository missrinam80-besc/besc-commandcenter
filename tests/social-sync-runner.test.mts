import assert from "node:assert/strict";
import test from "node:test";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

async function run(mode: string | undefined, handler: (request: IncomingMessage, response: ServerResponse) => void, secret = "private-cron-token") {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const child = spawn(process.execPath, [fileURLToPath(new URL("../ops/run-social-sync.cjs", import.meta.url)), ...(mode ? [mode] : [])], {
    env: { ...process.env, PORT: String(address.port), CRON_SECRET: secret }, stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += String(chunk); });
  child.stderr.on("data", (chunk) => { output += String(chunk); });
  try {
    const code = await new Promise<number | null>((resolve, reject) => { child.on("error", reject); child.on("close", resolve); });
    assert.ok(!output.includes("private-cron-token"));
    return { code, output };
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test("VPS-script houdt dry-run read-only en toont geen secret of accountpayload", async () => {
  const result = await run("--dry-run", (request, response) => {
    assert.equal(request.url, "/api/cron/social-sync?dry_run=1");
    assert.equal(request.headers.authorization, "Bearer private-cron-token");
    response.end(JSON.stringify({ ok: true, dryRun: true, due: 1, remaining: 0, batch: [{ id: "private-account-id" }] }));
  });
  assert.equal(result.code, 0);
  assert.ok(result.output.includes('"dryRun":true'));
  assert.ok(!result.output.includes("private-account-id"));
});

test("VPS-script vereist daadwerkelijk 401 voor de beveiligingstest", async () => {
  const result = await run("--check-auth", (request, response) => {
    assert.equal(request.headers.authorization, undefined);
    response.writeHead(401).end();
  });
  assert.equal(result.code, 0);
  const unsafe = await run("--check-auth", (_request, response) => response.end("unprotected"));
  assert.equal(unsafe.code, 1);
});

test("VPS-script faalt op partial en logt geen onbetrouwbare serverdetails", async () => {
  const result = await run(undefined, (_request, response) => response.writeHead(503).end(JSON.stringify({ ok: false, partial: 1, error: "private-cron-token" })));
  assert.equal(result.code, 1);
  assert.ok(result.output.includes('"partial":1'));
});

test("VPS-script verwerkt resterende batches en stopt daarna", async () => {
  let calls = 0;
  const result = await run(undefined, (_request, response) => {
    calls++;
    response.end(JSON.stringify({ ok: true, succeeded: calls === 1 ? 8 : 1, remaining: calls === 1 ? 1 : 0 }));
  });
  assert.equal(result.code, 0);
  assert.equal(calls, 2);
});

test("VPS-script faalt zonder geheim voordat er een HTTP-aanroep gebeurt", async () => {
  let calls = 0;
  const result = await run(undefined, (_request, response) => { calls++; response.end(); }, "");
  assert.equal(result.code, 1);
  assert.equal(calls, 0);
});
