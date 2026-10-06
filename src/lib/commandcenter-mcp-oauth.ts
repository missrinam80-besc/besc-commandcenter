import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

export const COMMANDCENTER_MCP_SCOPE = "commandcenter:read";
export const AGENT_RESULT_SCOPE = "agent_results:write";
export const AGENT_COMBINED_SCOPE = `${COMMANDCENTER_MCP_SCOPE} ${AGENT_RESULT_SCOPE}`;
export const COMMANDCENTER_MCP_CLIENT = "besc-commandcenter-chatgpt";
export type McpConfig = { origin: string; resource: string; organizationId: string; signingKey: string; redirects: string[]; agentResultsEnabled?: boolean };
export function allowedMcpScope(scope: string, config: McpConfig) {
  return normalizedMcpScope(scope,config)!==null;
}
function normalizedMcpScope(scope:string,config:McpConfig) {
  if(scope===COMMANDCENTER_MCP_SCOPE)return COMMANDCENTER_MCP_SCOPE;
  if(config.agentResultsEnabled && (scope===AGENT_COMBINED_SCOPE || scope===`${AGENT_RESULT_SCOPE} ${COMMANDCENTER_MCP_SCOPE}`))return AGENT_COMBINED_SCOPE;
  return null;
}
export type McpGrant = { id: string; user_id: string; organization_id: string; client_id: string; resource: string; scope: string; expires_at: string; revoked_at: string | null };
export type AuthorizationRequest = { clientId: string; redirectUri: string; resource: string; scope: string; challenge: string; state: string };
export type OAuthStore = {
  createCode: (input: { grant: McpGrant; redirectUri: string; challenge: string; codeHash: string; codeExpiresAt: string }) => Promise<void>;
  exchange: (input: { tokenHash: string; kind: "code" | "refresh"; clientId: string; redirectUri: string; resource: string; challenge: string; accessHash: string; refreshHash: string }) => Promise<McpGrant | null>;
  findAccess: (hash: string) => Promise<McpGrant | null>;
  revoke: (hash: string, clientId: string) => Promise<void>;
};
export class OAuthError extends Error {
  code: string;
  status: number;
  constructor(code: string, status = 400) { super(code); this.code = code; this.status = status; }
}
export const tokenHash = (value: string) => createHash("sha256").update(value).digest("hex");
export const randomToken = () => randomBytes(32).toString("base64url");
const safeEqual = (a: string, b: string) => timingSafeEqual(Buffer.from(tokenHash(a), "hex"), Buffer.from(tokenHash(b), "hex"));

export function commandcenterMcpConfig(env: Record<string, string | undefined>): McpConfig | null {
  if (env.COMMANDCENTER_MCP_ENABLED !== "true") return null;
  try {
    const url = new URL(env.COMMANDCENTER_MCP_ORIGIN ?? "");
    const signingKey = env.COMMANDCENTER_MCP_SIGNING_KEY ?? "";
    const organizationId = env.COMMANDCENTER_MCP_ORGANIZATION_ID ?? "";
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/"
      || signingKey.length < 32 || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(organizationId)
      || [env.SOCIAL_EXPORT_API_KEY, env.SOCIAL_MCP_SIGNING_KEY, env.CRON_SECRET, env.SUPABASE_SECRET_KEY].some(key => key && key === signingKey)) return null;
    const redirects = (env.COMMANDCENTER_MCP_REDIRECT_URIS ?? "https://chatgpt.com/connector_platform_oauth_redirect").split(",").map(value => value.trim());
    if (!redirects.length || redirects.length > 10 || redirects.some(value => {
      const redirect = new URL(value);
      return redirect.protocol !== "https:" || redirect.username || redirect.password || redirect.hash || redirect.search;
    })) return null;
    return { origin: url.origin, resource: `${url.origin}/mcp/commandcenter`, organizationId, signingKey, redirects,
      agentResultsEnabled: env.COMMANDCENTER_AGENT_RESULTS_ENABLED === "true" };
  } catch { return null; }
}

// Signed public-client registrations persist across app restarts. No client secret is issued.
function signed(value: unknown, key: string) {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${payload}.${createHmac("sha256", key).update(payload).digest("base64url")}`;
}
function unpack(value: string, key: string): unknown {
  if (value.length > 8192 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) throw new OAuthError("invalid_request");
  const [payload, signature] = value.split(".");
  if (!safeEqual(signature, createHmac("sha256", key).update(payload).digest("base64url"))) throw new OAuthError("invalid_request");
  try { return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); } catch { throw new OAuthError("invalid_request"); }
}
export function clientRedirects(clientId: string, config: McpConfig): string[] {
  if (clientId === COMMANDCENTER_MCP_CLIENT) return config.redirects;
  if (!clientId.startsWith("besc.")) throw new OAuthError("invalid_client", 401);
  try {
    const value = unpack(clientId.slice(5), config.signingKey) as { kind: string; redirects: string[] };
    if (value.kind !== "client" || !Array.isArray(value.redirects) || !value.redirects.length
      || !value.redirects.every(uri => typeof uri === "string" && config.redirects.includes(uri))) throw new Error();
    return value.redirects;
  } catch { throw new OAuthError("invalid_client", 401); }
}
export function registerMcpClient(body: unknown, config: McpConfig) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new OAuthError("invalid_client_metadata");
  const input = body as Record<string, unknown>;
  const redirects = input.redirect_uris;
  if (!Array.isArray(redirects) || !redirects.length || redirects.length > 10
    || !redirects.every(uri => typeof uri === "string" && config.redirects.includes(uri))
    || (input.token_endpoint_auth_method !== undefined && input.token_endpoint_auth_method !== "none")
    || (input.scope !== undefined && (typeof input.scope !== "string" || !allowedMcpScope(input.scope, config)))
    || (input.grant_types !== undefined && (!Array.isArray(input.grant_types) || !input.grant_types.every(value => ["authorization_code", "refresh_token"].includes(value))))
    || (input.response_types !== undefined && (!Array.isArray(input.response_types) || input.response_types.length !== 1 || input.response_types[0] !== "code"))) throw new OAuthError("invalid_client_metadata");
  return { client_id: `besc.${signed({ kind: "client", redirects, nonce: randomToken() }, config.signingKey)}`,
    client_name: "BESC Command Center", client_id_issued_at: Math.floor(Date.now() / 1000), redirect_uris: redirects,
    token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], scope: normalizedMcpScope(input.scope as string ?? COMMANDCENTER_MCP_SCOPE,config) };
}
export function parseAuthorization(params: URLSearchParams, config: McpConfig): AuthorizationRequest {
  // Optional language preference is not an authorization input; accept but ignore it.
  const allowed = ["response_type", "client_id", "redirect_uri", "resource", "scope", "state", "code_challenge", "code_challenge_method", "ui_locales"];
  for (const key of params.keys()) if (!allowed.includes(key) || params.getAll(key).length !== 1) throw new OAuthError("invalid_request");
  const clientId = params.get("client_id") ?? "";
  const redirectUri = params.get("redirect_uri") ?? "";
  if (!clientRedirects(clientId, config).includes(redirectUri)) throw new OAuthError("invalid_request");
  const challenge = params.get("code_challenge") ?? "";
  const state = params.get("state") ?? "";
  if (params.get("response_type") !== "code" || params.get("code_challenge_method") !== "S256"
    || !/^[A-Za-z0-9_-]{43}$/.test(challenge) || !state || state.length > 1024
    || params.get("resource") !== config.resource) throw new OAuthError("invalid_request");
  const scope = normalizedMcpScope(params.get("scope") ?? COMMANDCENTER_MCP_SCOPE,config);
  if (!scope) throw new OAuthError("invalid_scope");
  return { clientId, redirectUri, resource: config.resource, scope, challenge, state };
}
export function consentTicket(request: AuthorizationRequest, config: McpConfig, now = Date.now()) {
  return signed({ kind: "consent", request, expires: now + 600_000 }, config.signingKey);
}
export function readConsentTicket(ticket: string, config: McpConfig, now = Date.now()): AuthorizationRequest {
  const value = unpack(ticket, config.signingKey) as { kind: string; expires: number; request: AuthorizationRequest };
  if (value.kind !== "consent" || !Number.isFinite(value.expires) || value.expires < now || value.expires > now + 600_000) throw new OAuthError("invalid_request");
  const item = value.request;
  return parseAuthorization(new URLSearchParams({ response_type: "code", client_id: item.clientId, redirect_uri: item.redirectUri,
    resource: item.resource, scope: item.scope, state: item.state, code_challenge: item.challenge, code_challenge_method: "S256" }), config);
}
export function authorizationRedirect(request: AuthorizationRequest, config: McpConfig, result: { code: string } | { error: string }) {
  const url = new URL(request.redirectUri);
  for (const [name, value] of Object.entries({ ...result, state: request.state, iss: `${config.origin}/mcp/commandcenter` })) url.searchParams.set(name, value);
  return url.toString();
}
export async function issueMcpCode(request: AuthorizationRequest, userId: string, config: McpConfig, store: OAuthStore, now = Date.now()) {
  const code = randomToken();
  const grant: McpGrant = { id: randomUUID(),
    user_id: userId, organization_id: config.organizationId, client_id: request.clientId, resource: config.resource,
    scope: request.scope, expires_at: new Date(now + 30 * 86_400_000).toISOString(), revoked_at: null };
  await store.createCode({ grant, redirectUri: request.redirectUri, challenge: request.challenge, codeHash: tokenHash(code), codeExpiresAt: new Date(now + 300_000).toISOString() });
  return authorizationRedirect(request, config, { code });
}
export async function exchangeMcpToken(params: URLSearchParams, config: McpConfig, store: OAuthStore, canRead: (userId: string) => Promise<boolean>) {
  for (const key of params.keys()) if (!["grant_type", "client_id", "code", "redirect_uri", "code_verifier", "resource", "refresh_token", "scope"].includes(key) || params.getAll(key).length !== 1) throw new OAuthError("invalid_request");
  const clientId = params.get("client_id") ?? "";
  clientRedirects(clientId, config);
  if (params.get("resource") !== config.resource) throw new OAuthError("invalid_target");
  if (params.has("scope") && !allowedMcpScope(params.get("scope")!, config)) throw new OAuthError("invalid_scope");
  const kind = params.get("grant_type") === "authorization_code" ? "code" : params.get("grant_type") === "refresh_token" ? "refresh" : null;
  if (!kind) throw new OAuthError("unsupported_grant_type");
  const raw = params.get(kind === "code" ? "code" : "refresh_token") ?? "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(raw)) throw new OAuthError("invalid_grant");
  const verifier = params.get("code_verifier") ?? "";
  const redirectUri = params.get("redirect_uri") ?? "";
  if (kind === "code" && (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || !clientRedirects(clientId, config).includes(redirectUri))) throw new OAuthError("invalid_grant");
  const access = randomToken(), refresh = randomToken();
  const grant = await store.exchange({ tokenHash: tokenHash(raw), kind, clientId, redirectUri, resource: config.resource,
    challenge: createHash("sha256").update(verifier).digest("base64url"), accessHash: tokenHash(access), refreshHash: tokenHash(refresh) });
  if (!grant || grant.organization_id !== config.organizationId || grant.resource !== config.resource
    || !allowedMcpScope(grant.scope, config) || (params.has("scope") && normalizedMcpScope(params.get("scope")!,config) !== grant.scope)
    || grant.revoked_at || Date.parse(grant.expires_at) <= Date.now()
    || !await canRead(grant.user_id)) {
    if (grant) await store.revoke(tokenHash(refresh), clientId);
    throw new OAuthError("invalid_grant");
  }
  return { access_token: access, token_type: "Bearer", expires_in: Math.min(900, Math.max(0, Math.floor((Date.parse(grant.expires_at) - Date.now()) / 1000))), refresh_token: refresh, scope: grant.scope };
}
export function oauthMetadata(config: McpConfig) {
  return { issuer: `${config.origin}/mcp/commandcenter`, authorization_endpoint: `${config.origin}/mcp/commandcenter/authorize`, token_endpoint: `${config.origin}/mcp/commandcenter/token`,
    registration_endpoint: `${config.origin}/mcp/commandcenter/register`, revocation_endpoint: `${config.origin}/mcp/commandcenter/revoke`,
    scopes_supported: config.agentResultsEnabled ? [COMMANDCENTER_MCP_SCOPE, AGENT_RESULT_SCOPE] : [COMMANDCENTER_MCP_SCOPE], response_types_supported: ["code"], grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"], code_challenge_methods_supported: ["S256"], authorization_response_iss_parameter_supported: true };
}
export function protectedResourceMetadata(config: McpConfig) {
  return { resource: config.resource, resource_name: "BESC Command Center", authorization_servers: [`${config.origin}/mcp/commandcenter`],
    scopes_supported: config.agentResultsEnabled ? [COMMANDCENTER_MCP_SCOPE, AGENT_RESULT_SCOPE] : [COMMANDCENTER_MCP_SCOPE], bearer_methods_supported: ["header"] };
}
export function mcpChallenge(config: McpConfig) {
  return `Bearer resource_metadata="${config.origin}/.well-known/oauth-protected-resource/mcp/commandcenter", scope="${COMMANDCENTER_MCP_SCOPE}"`;
}

// Bounded, per-process abuse guard; a multi-replica deployment needs a shared gateway limiter.
export function createMcpLimiter(maximum = 30) {
  const buckets = new Map<string, { start: number; count: number }>();
  return (key: string, now = Date.now()) => {
    for (const [id, bucket] of buckets) if (now - bucket.start >= 60_000) buckets.delete(id);
    let bucket = buckets.get(key);
    if (!bucket) {
      if (buckets.size >= 1000) return false;
      bucket = { start: now, count: 0 }; buckets.set(key, bucket);
    }
    return ++bucket.count <= maximum;
  };
}
