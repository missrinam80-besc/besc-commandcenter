// Local production HTTP smoke test: synthetic config, no real credentials/database access.
// Run after `pnpm build`: node scripts/check-social-mcp.mjs
// Optional isolated browser preview: --browser=<agent-browser executable> --screenshot=<path>
import { spawn, spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";

const port = 3107;
const base = `http://127.0.0.1:${port}`;
// Canonical fixture host matches the local listener. Public production still requires HTTPS.
const origin = `https://127.0.0.1:${port}`;
const browser = process.argv.find(value => value.startsWith("--browser="))?.slice(10);
const screenshot = process.argv.find(value => value.startsWith("--screenshot="))?.slice(13);
let logs = "";
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env,
    SOCIAL_MCP_ENABLED: "true", SOCIAL_MCP_ORIGIN: origin,
    SOCIAL_MCP_SIGNING_KEY: randomBytes(32).toString("hex"), SOCIAL_EXPORT_ORGANIZATION_ID: "11111111-1111-4111-8111-111111111111",
    SOCIAL_MCP_REDIRECT_URIS: "https://chatgpt.com/connector_platform_oauth_redirect",
    SUPABASE_URL_SERVER: "http://127.0.0.1:9", SUPABASE_SECRET_KEY: "test-only-not-real", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-only",
  },
});
child.stdout.on("data", data => { logs += data; });
child.stderr.on("data", data => { logs += data; });
const runBrowser = (...args) => {
  const result = spawnSync(browser, ["--session", "besc-social-mcp-check", ...args], { encoding: "utf8", windowsHide: true, timeout: 30_000 });
  if (result.error || result.status !== 0) throw new Error(`Browsercontrole mislukt: ${result.stderr || result.error}`);
  return result.stdout;
};
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { await fetch(`${base}/openapi/social-export.json`); ready = true; break; } catch { await new Promise(resolve => setTimeout(resolve, 200)); }
  }
  assert.ok(ready, "Productieserver niet gestart");
  const request = (path, options = {}) => fetch(`${base}${path}`, options);
  const unauthenticated = await request("/mcp");
  assert.equal(unauthenticated.status, 401); assert.match(unauthenticated.headers.get("www-authenticate"), /oauth-protected-resource/);
  console.log("PASS /mcp zonder token: 401 met OAuth-discovery");
  for (const path of ["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp", "/.well-known/oauth-authorization-server"]) {
    const response = await request(path); assert.equal(response.status, 200);
    const body = await response.json(); assert.equal(body.resource || body.issuer, path.includes("protected-resource") ? `${origin}/mcp` : origin);
    console.log(`PASS ${path}: 200, vaste issuer/resource`);
  }
  const registration = await request("/mcp/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect"], token_endpoint_auth_method: "none" }) });
  assert.equal(registration.status, 201); const registered = await registration.json(); assert.ok(registered.client_id); assert.equal(registered.client_secret, undefined);
  console.log("PASS registratie: publieke client zonder clientsecret");
  const rejected = await request("/mcp/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ redirect_uris: ["https://evil.example/callback"] }) });
  assert.equal(rejected.status, 400); console.log("PASS onveilig callbackadres geweigerd");
  const token = await request("/mcp/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", client_id: "besc-chatgpt", resource: "wrong" }) });
  assert.equal(token.status, 400); assert.equal((await token.json()).error, "invalid_target"); console.log("PASS verkeerde audience geweigerd vóór database-toegang");
  const query = new URLSearchParams({ response_type: "code", client_id: registered.client_id, redirect_uri: "https://chatgpt.com/connector_platform_oauth_redirect", resource: `${origin}/mcp`, scope: "social:read", state: "test-state", code_challenge_method: "S256", code_challenge: createHash("sha256").update("test-verifier-".repeat(5)).digest("base64url") });
  const consentUrl = `${base}/mcp/authorize?${query}`;
  const consent = await fetch(consentUrl); assert.equal(consent.status, 200);
  assert.match(await consent.text(), /Log in met je bestaande Command Center-account/);
  console.log("PASS toestemmingsflow toont BESC-login, geen automatische toestemming");
  if (browser) {
    runBrowser("open", consentUrl);
    console.log(runBrowser("snapshot", "-i"));
    if (screenshot) runBrowser("screenshot", screenshot);
  }
  console.log("Geen live database of gebruikersaccount gebruikt. Volledige ChatGPT-login/refresh blijft een deploymenttest.");
} catch (error) {
  console.error(error.message);
  // Logs are from this isolated fixture server, not production.
  console.error(logs);
  process.exitCode = 1;
} finally {
  if (browser) { try { runBrowser("close"); } catch {} }
  child.kill();
}
