import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const identifier = z.string().regex(/^[a-z0-9-]{3,64}$/);
const twitchId = z.string().regex(/^[1-9]\d{0,19}$/);
const kind = z.enum(["twitch.follow", "twitch.cheer"]);
const scope = z.enum(["rewards:preview:read", "rewards:preview:validate"]);
const utc = z.iso.datetime({ precision: 3 });
const sourceSchema = z.object({
  id: identifier, organizationId: z.uuid(), platform: z.literal("twitch"),
  broadcasterId: twitchId, kinds: z.array(kind).min(1).max(2), revoked: z.boolean(),
}).strict();
const clientSchema = z.object({
  id: identifier, sourceId: identifier, keyHash: z.string().regex(/^[a-f0-9]{64}$/),
  scopes: z.array(scope).min(1).max(2), expiresAt: utc, revoked: z.boolean(),
}).strict();
const registrySchema = z.object({
  sources: z.array(sourceSchema).max(32), clients: z.array(clientSchema).max(32),
}).strict();
export type RewardsPreviewRegistry = z.infer<typeof registrySchema>;
type Source = RewardsPreviewRegistry["sources"][number];

export const PREVIEW_MAX_BODY_BYTES = 8192;
export const PREVIEW_MAX_EVENT_AGE_MS = 120_000;
export const PREVIEW_MAX_FUTURE_MS = 5000;
export const hashRewardsPreviewKey = (token: string) => createHash("sha256").update(token).digest("hex");

function unique(values: string[]) { return new Set(values).size === values.length; }

/** Separate, server-only pilot credentials. Never accept the existing Discord client registry. */
export function parseRewardsPreviewRegistry(raw?: string): RewardsPreviewRegistry {
  if (!raw) return { sources: [], clients: [] };
  try {
    if (Buffer.byteLength(raw) > 65536) throw Error();
    const registry = registrySchema.parse(JSON.parse(raw));
    if (!unique(registry.sources.map(s => s.id)) || !unique(registry.clients.map(c => c.id))
      || !unique(registry.clients.map(c => c.keyHash))
      || !unique(registry.sources.map(s => `${s.organizationId.toLowerCase()}:${s.platform}:${s.broadcasterId}`))
      || registry.sources.some(s => !unique(s.kinds))
      || registry.clients.some(c => !unique(c.scopes) || !registry.sources.some(s => s.id === c.sourceId))) throw Error();
    return registry;
  } catch { throw Error("invalid_rewards_preview_registry"); }
}

const eventFields = {
  schemaVersion: z.literal(1), simulation: z.literal(true),
  event_id: z.uuid(), broadcaster_id: twitchId, twitch_user_id: twitchId, occurred_at: utc,
};
export const rewardsPreviewEventSchema = z.discriminatedUnion("kind", [
  z.object({ ...eventFields, kind: z.literal("twitch.follow"), facts: z.object({}).strict() }).strict(),
  z.object({ ...eventFields, kind: z.literal("twitch.cheer"), facts: z.object({
    bits: z.number().int().min(1).max(1_000_000), is_anonymous: z.literal(false),
  }).strict() }).strict(),
]);

class PreviewFailure extends Error {
  status: number; code: string;
  constructor(status: number, code: string) { super(code); this.status = status; this.code = code; }
}

export async function readRewardsPreviewBody(request: Request, timeoutMs = 3000): Promise<unknown> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) throw new PreviewFailure(415, "json_required");
  const length = request.headers.get("content-length");
  if (length !== null && !/^\d+$/.test(length)) throw new PreviewFailure(400, "invalid_body");
  if (length !== null && Number(length) > PREVIEW_MAX_BODY_BYTES) throw new PreviewFailure(413, "body_too_large");
  const reader = request.body?.getReader();
  if (!reader) throw new PreviewFailure(400, "invalid_body");
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort = () => {};
  const cancelled = new Promise<never>((_, reject) => {
    onAbort = () => reject(new PreviewFailure(408, "request_aborted"));
    request.signal.addEventListener("abort", onAbort, { once: true });
    if (request.signal.aborted) onAbort();
    timer = setTimeout(() => reject(new PreviewFailure(408, "body_timeout")), timeoutMs);
  });
  try {
    return await Promise.race([cancelled, (async () => {
      const chunks: Uint8Array[] = []; let size = 0;
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > PREVIEW_MAX_BODY_BYTES) throw new PreviewFailure(413, "body_too_large");
        chunks.push(part.value);
      }
      try {
        const json = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
        return JSON.parse(json);
      } catch { throw new PreviewFailure(400, "invalid_body"); }
    })()]);
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener("abort", onAbort);
    void reader.cancel().catch(() => {});
  }
}

// Bounded to the configured clients (maximum 32), not attacker-supplied IDs/IPs.
export class RewardsPreviewLimiter {
  private windows = new Map<string, { until: number; count: number }>();
  allow(client: string, now: number) {
    for (const [id, row] of this.windows) if (row.until <= now) this.windows.delete(id);
    const row = this.windows.get(client) ?? { until: now + 60_000, count: 0 };
    this.windows.set(client, row);
    return ++row.count <= 60;
  }
}
const defaultLimiter = new RewardsPreviewLimiter();

function validateObservation(input: unknown, source: Source, now: number) {
  const parsed = rewardsPreviewEventSchema.safeParse(input);
  if (!parsed.success) throw new PreviewFailure(400, "invalid_fields");
  const event = parsed.data;
  if (event.broadcaster_id !== source.broadcasterId) throw new PreviewFailure(403, "source_not_allowed");
  if (!source.kinds.includes(event.kind)) throw new PreviewFailure(403, "kind_not_allowed");
  const stamp = Date.parse(event.occurred_at);
  if (stamp < now - PREVIEW_MAX_EVENT_AGE_MS || stamp > now + PREVIEW_MAX_FUTURE_MS) throw new PreviewFailure(422, "event_time_out_of_range");
  // A transport observation key, NOT a financial deduplication/entitlement decision.
  // Both hashes deliberately omit rotating client IDs, source-record IDs and rule revisions.
  const identity = [1, "preview", source.organizationId.toLowerCase(), source.platform,
    source.broadcasterId, event.kind, event.event_id.toLowerCase(), event.twitch_user_id];
  const observationKey = hashRewardsPreviewKey(JSON.stringify(identity));
  const facts = event.kind === "twitch.cheer" ? [event.facts.bits, event.facts.is_anonymous] : [];
  const contentHash = hashRewardsPreviewKey(JSON.stringify([identity, event.occurred_at, facts]));
  return { observationKey, contentHash };
}

/** No storage/identity/ledger dependency: this API can only validate synthetic envelopes. */
export async function handleRewardsPreviewRequest(request: Request, deps: {
  enabled: boolean; registry: () => RewardsPreviewRegistry; now?: number; limiter?: RewardsPreviewLimiter;
}): Promise<Response> {
  const requestId = randomUUID();
  const headers: Record<string, string> = {
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Request-Id": requestId,
  };
  try {
    if (!deps.enabled) throw new PreviewFailure(404, "not_found");
    const now = deps.now ?? Date.now();
    const registry = deps.registry();
    const match = /^Bearer (brp_([a-z0-9-]{3,64})\.[A-Za-z0-9_-]{43})$/.exec(request.headers.get("authorization") ?? "");
    const client = match && registry.clients.find(c => c.id === match[2]);
    if (!match || !client || client.revoked || Date.parse(client.expiresAt) <= now
      || !timingSafeEqual(Buffer.from(hashRewardsPreviewKey(match[1]), "hex"), Buffer.from(client.keyHash, "hex"))) throw new PreviewFailure(401, "invalid_client");
    const source = registry.sources.find(s => s.id === client.sourceId);
    if (!source || source.revoked) throw new PreviewFailure(403, "source_unavailable");
    const url = new URL(request.url);
    const resource = /^\/api\/v1\/integrations\/rewards\/preview\/(config|validate)\/?$/.exec(url.pathname)?.[1];
    if (!resource) throw new PreviewFailure(404, "not_found");
    if (request.method !== (resource === "config" ? "GET" : "POST")) throw new PreviewFailure(405, "method_not_allowed");
    if (url.search) throw new PreviewFailure(400, "invalid_query");
    const required = resource === "config" ? "rewards:preview:read" : "rewards:preview:validate";
    if (!client.scopes.includes(required)) throw new PreviewFailure(403, "insufficient_scope");
    if (!(deps.limiter ?? defaultLimiter).allow(client.id, now)) throw new PreviewFailure(429, "rate_limited");
    const state = { schemaVersion: 1, mode: "preview", earningEnabled: false, persisted: false, awarded: false };
    if (resource === "config") return Response.json({
      ...state, source: { platform: source.platform, broadcasterId: source.broadcasterId, kinds: source.kinds },
      limits: { bodyBytes: PREVIEW_MAX_BODY_BYTES, requestsPerMinute: 60, maxAgeMs: PREVIEW_MAX_EVENT_AGE_MS, maxFutureMs: PREVIEW_MAX_FUTURE_MS },
    }, { headers });
    const result = validateObservation(await readRewardsPreviewBody(request), source, now);
    return Response.json({ ...state, status: "validated_only", identityChecked: false, proofVerified: false, ...result }, { headers });
  } catch (error) {
    const status = error instanceof PreviewFailure ? error.status : 503;
    if (status === 401) headers["WWW-Authenticate"] = "Bearer";
    if (status === 429) headers["Retry-After"] = "60";
    if (status === 405) headers.Allow = /\/config\/?$/.test(new URL(request.url).pathname) ? "GET" : "POST";
    return Response.json({ error: { code: error instanceof PreviewFailure ? error.code : "preview_unavailable", requestId } }, { status, headers });
  }
}
