import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { socialMcpConfig, parseAuthorization, registerMcpClient, clientRedirects, consentTicket, readConsentTicket, issueMcpCode, exchangeMcpToken, tokenHash, randomToken, oauthMetadata, protectedResourceMetadata, mcpChallenge, createMcpLimiter, type OAuthStore, type McpGrant } from "../src/lib/social-mcp-oauth.ts";
import { handleSocialMcp, type McpServerDependencies } from "../src/lib/social-mcp-server.ts";

const env = { SOCIAL_MCP_ENABLED: "true", SOCIAL_MCP_ORIGIN: "https://besc.example", SOCIAL_MCP_SIGNING_KEY: "mcp-signing-test-only-".repeat(3), SOCIAL_EXPORT_ORGANIZATION_ID: "11111111-1111-4111-8111-111111111111" };
const config = socialMcpConfig(env)!;
const userId = "22222222-2222-4222-8222-222222222222";
const verifier = "pkce-verifier-".repeat(5);
const challenge = createHash("sha256").update(verifier).digest("base64url");
const params = () => new URLSearchParams({ response_type: "code", client_id: "besc-chatgpt", redirect_uri: config.redirects[0], resource: config.resource, scope: "social:read", state: "client-state", code_challenge: challenge, code_challenge_method: "S256" });
const authorization = () => parseAuthorization(params(), config);

test("MCP config is disabled by default and rejects shared secrets, non-HTTPS and invalid tenant", () => {
  assert.equal(socialMcpConfig({}), null);
  for (const change of [{ SOCIAL_MCP_ENABLED: "false" }, { SOCIAL_MCP_SIGNING_KEY: "short" }, { SOCIAL_EXPORT_API_KEY: env.SOCIAL_MCP_SIGNING_KEY },
    { SOCIAL_MCP_ORIGIN: "http://besc.example" }, { SOCIAL_MCP_ORIGIN: "https://besc.example/evil" }, { SOCIAL_MCP_ORIGIN: "https://user:password@besc.example" },
    { SOCIAL_EXPORT_ORGANIZATION_ID: "bad" }, { SOCIAL_MCP_REDIRECT_URIS: "http://evil.example/callback" }]) assert.equal(socialMcpConfig({ ...env, ...change }), null);
  assert.equal(config.resource, "https://besc.example/mcp");
});
test("OAuth discovery describes PKCE, read-only scope, public client, exact resource and issuer", () => {
  const metadata = oauthMetadata(config);
  assert.deepEqual(metadata.scopes_supported, ["social:read"]);
  assert.deepEqual(metadata.code_challenge_methods_supported, ["S256"]);
  assert.deepEqual(metadata.token_endpoint_auth_methods_supported, ["none"]);
  assert.equal(metadata.authorization_response_iss_parameter_supported, true);
  assert.equal(metadata.issuer, config.origin);
  assert.equal(protectedResourceMetadata(config).resource, config.resource);
  assert.match(mcpChallenge(config), /oauth-protected-resource/);
});
test("DCR only accepts explicit callback allowlist and persists across restart without a client secret", () => {
  const result = registerMcpClient({ redirect_uris: config.redirects, token_endpoint_auth_method: "none" }, config);
  assert.deepEqual(clientRedirects(result.client_id, { ...config }), config.redirects);
  assert.equal("client_secret" in result, false);
  for (const input of [{ redirect_uris: ["https://evil.example/callback"] }, { redirect_uris: [config.redirects[0] + "/evil"] },
    { redirect_uris: config.redirects, token_endpoint_auth_method: "client_secret_post" }, { redirect_uris: config.redirects, scope: "write" }]) assert.throws(() => registerMcpClient(input, config));
  assert.throws(() => clientRedirects(result.client_id + "a", config));
  assert.throws(() => clientRedirects(result.client_id, { ...config, signingKey: "rotated" }));
});
test("authorization rejects missing PKCE, wrong audience/scope, duplicate parameters and open redirects", () => {
  assert.equal(authorization().scope, "social:read");
  for (const [name, value] of [["resource", "https://other.example/mcp"], ["scope", "social:write"], ["code_challenge_method", "plain"],
    ["code_challenge", "bad"], ["state", ""], ["redirect_uri", "https://chatgpt.com.evil.example/connector_platform_oauth_redirect"], ["client_id", "unknown"]]) {
    const query = params(); query.set(name, value); assert.throws(() => parseAuthorization(query, config));
  }
  const duplicate = params(); duplicate.append("resource", config.resource); assert.throws(() => parseAuthorization(duplicate, config));
  const unknown = params(); unknown.set("organization_id", "other"); assert.throws(() => parseAuthorization(unknown, config));
});
test("authorization accepts ChatGPT ui_locales without weakening security checks", () => {
  const client = registerMcpClient({ redirect_uris: config.redirects, token_endpoint_auth_method: "none" }, config);
  const query = params();
  query.set("client_id", client.client_id);
  const expected = parseAuthorization(query, config);
  for (const locale of ["nl-BE", "en-US nl-BE", ""]) {
    query.set("ui_locales", locale);
    assert.deepEqual(parseAuthorization(query, config), expected);
    assert.deepEqual(readConsentTicket(consentTicket(parseAuthorization(query, config), config), config), expected);
  }
  const duplicate = new URLSearchParams(query); duplicate.append("ui_locales", "en-US");
  assert.throws(() => parseAuthorization(duplicate, config));
  for (const [name, value] of [["redirect_uri", "https://chatgpt.com/"], ["scope", "social:write"],
    ["resource", "https://other.example/mcp"], ["code_challenge_method", "plain"], ["code_challenge", "bad"],
    ["client_id", client.client_id + "tampered"], ["organization_id", "other"]]) {
    const invalid = new URLSearchParams(query); invalid.set(name, value);
    assert.throws(() => parseAuthorization(invalid, config));
  }
});
test("consent tickets bind the full OAuth request and expire; reject tampering and key rotation", () => {
  const ticket = consentTicket(authorization(), config, 1000);
  assert.deepEqual(readConsentTicket(ticket, config, 2000), authorization());
  assert.throws(() => readConsentTicket(ticket, config, 700_000));
  assert.throws(() => readConsentTicket(ticket + "a", config, 2000));
  assert.throws(() => readConsentTicket(ticket, { ...config, signingKey: "rotated" }, 2000));
});
test("authorization issues only hashed short-lived codes and returns state and issuer", async () => {
  let stored: Parameters<OAuthStore["createCode"]>[0] | undefined;
  const store = { createCode: async (input: Parameters<OAuthStore["createCode"]>[0]) => { stored = input; } } as OAuthStore;
  const redirect = new URL(await issueMcpCode(authorization(), userId, config, store, 1000));
  assert.equal(redirect.searchParams.get("state"), "client-state"); assert.equal(redirect.searchParams.get("iss"), config.origin);
  assert.equal(stored!.codeHash, tokenHash(redirect.searchParams.get("code")!));
  assert.equal(stored!.codeExpiresAt, new Date(301_000).toISOString());
  assert.equal(stored!.grant.organization_id, config.organizationId);
  assert.equal(JSON.stringify(stored).includes(redirect.searchParams.get("code")!), false);
});
test("token endpoint validates resource, PKCE and client before invoking the store", async () => {
  let calls = 0;
  const store = { exchange: async () => { calls++; return null; } } as unknown as OAuthStore;
  const valid = new URLSearchParams({ grant_type: "authorization_code", client_id: "besc-chatgpt", code: randomToken(), code_verifier: verifier, redirect_uri: config.redirects[0], resource: config.resource });
  for (const [key, value] of [["resource", "other"], ["code_verifier", "short"], ["redirect_uri", "https://evil.example"], ["client_id", "other"], ["grant_type", "password"], ["scope", "write"]]) {
    const input = new URLSearchParams(valid); input.set(key, value);
    await assert.rejects(() => exchangeMcpToken(input, config, store, async () => true));
  }
  assert.equal(calls, 0);
});
test("permission loss after code exchange revokes newly issued tokens", async () => {
  let revoked = false;
  const grant: McpGrant = { id: userId, user_id: userId, organization_id: config.organizationId, client_id: "besc-chatgpt", resource: config.resource, scope: "social:read", expires_at: new Date(Date.now() + 86_400_000).toISOString(), revoked_at: null };
  const store = { exchange: async () => grant, revoke: async () => { revoked = true; } } as unknown as OAuthStore;
  const input = new URLSearchParams({ grant_type: "refresh_token", client_id: "besc-chatgpt", refresh_token: randomToken(), resource: config.resource });
  await assert.rejects(() => exchangeMcpToken(input, config, store, async () => false));
  assert.equal(revoked, true);
});

const token = randomToken();
function mcpRequest(body: unknown, extra: Record<string, string> = {}, method = "POST") {
  return new Request(config.resource, { method, headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${token}`, ...extra }, ...(method === "POST" ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}) });
}
function mcpFixture() {
  const calls: Array<{ params: Record<string, string | number>; userId: string }> = [];
  const deps: McpServerDependencies = { origin: config.origin, challenge: mcpChallenge(config), authenticate: async value => value === token ? { userId } : null, allowRequest: () => true,
    readMetrics: async (params, userId) => { calls.push({ params, userId }); return Response.json({ version: "1", mode: params.mode, asOf: new Date().toISOString(), dateFilterBasis: "fetched_at_utc", data: [], count: 0, nextCursor: null, warning: "Niet optellen." }); } };
  return { deps, calls };
}
test("MCP requires OAuth on initialize/list/call and GET, with discovery challenge", async () => {
  const { deps, calls } = mcpFixture();
  for (const method of ["initialize", "tools/list", "tools/call"]) {
    const response = await handleSocialMcp(mcpRequest({ jsonrpc: "2.0", id: 1, method }, { Authorization: "" }), deps);
    assert.equal(response.status, 401); assert.match(response.headers.get("www-authenticate")!, /social:read/);
  }
  assert.equal((await handleSocialMcp(mcpRequest(null, { Authorization: "" }, "GET"), deps)).status, 401);
  assert.equal(calls.length, 0);
});
test("MCP rejects untrusted origins/hosts, URL credentials, oversize bodies and batches", async () => {
  const { deps, calls } = mcpFixture();
  assert.equal((await handleSocialMcp(mcpRequest({}, { Origin: "https://evil.example" }), deps)).status, 403);
  assert.equal((await handleSocialMcp(mcpRequest({}, { Host: "evil.example" }), deps)).status, 403);
  assert.equal((await handleSocialMcp(new Request(`${config.resource}?access_token=secret`), deps)).status, 400);
  assert.equal((await handleSocialMcp(mcpRequest(" ".repeat(65_537)), deps)).status, 413);
  assert.equal((await handleSocialMcp(mcpRequest("invalid"), deps)).status, 400);
  assert.equal((await handleSocialMcp(mcpRequest([]), deps)).status, 400);
  assert.equal(calls.length, 0);
});
test("official SDK negotiates MCP initialize and advertises one read-only OAuth tool", async () => {
  const { deps } = mcpFixture();
  const initialized = await handleSocialMcp(mcpRequest({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } } }), deps);
  assert.equal(initialized.status, 200);
  assert.equal((await initialized.json()).result.serverInfo.name, "besc-socialrapportage");
  const listed = await handleSocialMcp(mcpRequest({ jsonrpc: "2.0", id: 2, method: "tools/list" }), deps);
  const tools = (await listed.json()).result.tools;
  assert.equal(tools.length, 1); assert.equal(tools[0].name, "get_social_metrics");
  assert.equal(tools[0].annotations.readOnlyHint, true); assert.equal(tools[0].annotations.destructiveHint, false);
  assert.equal(tools[0]._meta.securitySchemes[0].type, "oauth2");
  assert.equal(tools[0].securitySchemes[0].type, "oauth2");
});
test("MCP tool calls the tenant-safe export and defaults latest without exposing secrets", async () => {
  const { deps, calls } = mcpFixture();
  const response = await handleSocialMcp(mcpRequest({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_social_metrics", arguments: { platform: "facebook" } } }), deps);
  const result = await response.json();
  assert.equal(response.status, 200); assert.equal(result.result.structuredContent.mode, "latest");
  assert.deepEqual(calls[0], { params: { mode: "latest", platform: "facebook", limit: 50 }, userId });
  assert.equal(JSON.stringify(result).includes(token), false);
});
test("MCP rejects writes, unknown tools, tenant arguments and invalid filters without reading metrics", async () => {
  const { deps, calls } = mcpFixture();
  for (const input of [{ name: "delete_social_metrics", arguments: {} }, { name: "get_social_metrics", arguments: { organization_id: "other" } },
    { name: "get_social_metrics", arguments: { limit: 101 } }]) {
    const result = await (await handleSocialMcp(mcpRequest({ jsonrpc: "2.0", id: 4, method: "tools/call", params: input }), deps)).json();
    assert.ok(result.error || result.result?.isError);
  }
  assert.equal((await handleSocialMcp(mcpRequest(null, {}, "DELETE"), deps)).status, 405);
  assert.equal(calls.length, 0);
});
test("MCP checks current authorization each request, hides database errors, limits authenticated calls", async () => {
  const { deps, calls } = mcpFixture();
  assert.equal((await handleSocialMcp(mcpRequest({}), { ...deps, authenticate: async () => null })).status, 401);
  const response = await handleSocialMcp(mcpRequest({}), { ...deps, authenticate: async () => { throw new Error("database-secret"); } });
  assert.equal(response.status, 503); assert.equal((await response.text()).includes("secret"), false);
  assert.equal((await handleSocialMcp(mcpRequest({}), { ...deps, allowRequest: () => false })).status, 429);
  assert.equal(calls.length, 0);
  const limit = createMcpLimiter(2); assert.equal(limit("user", 0), true); assert.equal(limit("user", 0), true); assert.equal(limit("user", 0), false);
  assert.equal(limit("other", 0), true); assert.equal(limit("user", 60_000), true);
});

test("real PostgreSQL migration: locked token rotation, PKCE, reuse revocation and RLS", async () => {
  const db = new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create table public.organizations(id uuid primary key);");
    await db.exec(readFileSync(new URL("../supabase/migrations/20261002171936_social_mcp_oauth.sql", import.meta.url), "utf8"));
    await db.query("insert into auth.users values ($1)", [userId]); await db.query("insert into public.organizations values ($1)", [config.organizationId]);
    const store: OAuthStore = {
      createCode: async input => {
        await db.query("insert into public.social_mcp_oauth_grants(id,user_id,organization_id,client_id,resource,scope,redirect_uri,code_challenge,expires_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)", [input.grant.id, userId, config.organizationId, input.grant.client_id, config.resource, "social:read", input.redirectUri, input.challenge, input.grant.expires_at]);
        await db.query("insert into public.social_mcp_oauth_tokens(token_hash,grant_id,kind,expires_at) values ($1,$2,'code',$3)", [input.codeHash, input.grant.id, input.codeExpiresAt]);
      },
      exchange: async input => {
        const result = await db.query<{ permission: McpGrant | null }>("select public.exchange_social_mcp_token($1,$2,$3,$4,$5,$6,$7,$8) as permission", [input.tokenHash, input.kind, input.clientId, input.redirectUri, input.resource, input.challenge, input.accessHash, input.refreshHash]);
        return result.rows[0].permission;
      },
      findAccess: async hash => {
        const result = await db.query<McpGrant>("select g.* from public.social_mcp_oauth_tokens t join public.social_mcp_oauth_grants g on g.id=t.grant_id where token_hash=$1 and kind='access' and used_at is null and t.expires_at>now() and g.revoked_at is null", [hash]);
        return result.rows[0] ?? null;
      },
      revoke: async (hash, clientId) => { await db.query("update public.social_mcp_oauth_grants set revoked_at=now() where client_id=$2 and id=(select grant_id from public.social_mcp_oauth_tokens where token_hash=$1)", [hash, clientId]); },
    };
    const code = new URL(await issueMcpCode(authorization(), userId, config, store)).searchParams.get("code")!;
    const codeParams = new URLSearchParams({ grant_type: "authorization_code", client_id: "besc-chatgpt", code, code_verifier: verifier, redirect_uri: config.redirects[0], resource: config.resource });
    const wrong = new URLSearchParams(codeParams); wrong.set("code_verifier", "wrong-verifier-".repeat(5));
    await assert.rejects(() => exchangeMcpToken(wrong, config, store, async () => true));
    const first = await exchangeMcpToken(codeParams, config, store, async () => true);
    assert.ok(await store.findAccess(tokenHash(first.access_token)));
    const refreshParams = new URLSearchParams({ grant_type: "refresh_token", client_id: "besc-chatgpt", refresh_token: first.refresh_token, resource: config.resource });
    const second = await exchangeMcpToken(refreshParams, config, store, async () => true);
    assert.equal(await store.findAccess(tokenHash(first.access_token)), null);
    assert.ok(await store.findAccess(tokenHash(second.access_token)));
    await assert.rejects(() => exchangeMcpToken(refreshParams, config, store, async () => true));
    assert.equal(await store.findAccess(tokenHash(second.access_token)), null); // Reuse revokes entire family.
    const another = new URL(await issueMcpCode(authorization(), userId, config, store)).searchParams.get("code")!;
    const next = new URLSearchParams(codeParams); next.set("code", another);
    const third = await exchangeMcpToken(next, config, store, async () => true);
    await assert.rejects(() => exchangeMcpToken(next, config, store, async () => true));
    assert.equal(await store.findAccess(tokenHash(third.access_token)), null); // Code reuse also revokes.
    const expired = new URL(await issueMcpCode(authorization(), userId, config, store)).searchParams.get("code")!;
    await db.query("update public.social_mcp_oauth_tokens set expires_at=now()-interval '1 second' where token_hash=$1", [tokenHash(expired)]);
    next.set("code", expired); await assert.rejects(() => exchangeMcpToken(next, config, store, async () => true));
    const rls = await db.query<{ enabled: boolean }>("select relrowsecurity as enabled from pg_class where relname in ('social_mcp_oauth_grants','social_mcp_oauth_tokens')");
    assert.equal(rls.rows.length, 2); assert.ok(rls.rows.every(row => row.enabled));
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(() => db.query("select * from public.social_mcp_oauth_tokens"));
      await assert.rejects(() => db.query("select public.exchange_social_mcp_token('a','code','b','c','d','e','f','g')"));
      await db.exec("reset role");
    }
    await db.exec("set role service_role");
    await db.query("select * from public.social_mcp_oauth_tokens limit 1");
    await db.query("select public.exchange_social_mcp_token('a','code','b','c','d','e','f','g')");
    await db.exec("reset role");
  } finally { await db.close(); }
});
