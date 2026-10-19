import { randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  rewardsIntegrationSourceSchema, RewardsIntegrationFailure as Failure,
  readRewardsIntegrationBody, RewardsIntegrationLimiter, hashRewardsPreviewKey as hashKey,
} from "./rewards-integration-preview.ts";

const id = z.string().regex(/^[a-z0-9-]{3,64}$/);
const scopes = z.enum(["rewards:intake:write", "rewards:receipts:read"]);
const registrySchema = z.object({
  sources: z.array(rewardsIntegrationSourceSchema).max(32),
  clients: z.array(z.object({
    id, sourceId: id, keyHash: z.string().regex(/^[a-f0-9]{64}$/),
    scopes: z.array(scopes).min(1).max(2), expiresAt: z.iso.datetime({ precision: 3 }), revoked: z.boolean(),
  }).strict()).max(32),
}).strict();
export type RewardsIntakeRegistry = z.infer<typeof registrySchema>;
type Source = RewardsIntakeRegistry["sources"][number];
function unique(values: string[]) { return new Set(values).size === values.length; }
export function parseRewardsIntakeRegistry(raw?: string): RewardsIntakeRegistry {
  if (!raw) return { sources: [], clients: [] };
  try {
    if (Buffer.byteLength(raw) > 65536) throw Error();
    const parsed = registrySchema.parse(JSON.parse(raw));
    if (!unique(parsed.sources.map(s => s.id)) || !unique(parsed.clients.map(c => c.id))
      || !unique(parsed.clients.map(c => c.keyHash))
      || !unique(parsed.sources.map(s => `${s.organizationId.toLowerCase()}:${s.platform}:${s.broadcasterId}`))
      || parsed.sources.some(s => !unique(s.kinds))
      || parsed.clients.some(c => !unique(c.scopes) || !parsed.sources.some(s => s.id === c.sourceId))) throw Error();
    return parsed;
  } catch { throw Error("invalid_rewards_intake_registry"); }
}

const fields = {
  schemaVersion: z.union([z.literal(1), z.literal(2)]), simulation: z.literal(false),
  event_id: z.string().min(1).max(128).refine(value => !/[^\x21-\x7e]/.test(value)),
  broadcaster_id: z.string().regex(/^[1-9]\d{0,19}$/),
  twitch_user_id: z.string().regex(/^[1-9]\d{0,19}$/), occurred_at: z.iso.datetime({ precision: 3 }),
};
export const rewardsIntakeEventSchema = z.discriminatedUnion("kind", [
  z.object({ ...fields, kind: z.literal("twitch.follow"), facts: z.object({}).strict() }).strict(),
  z.object({ ...fields, kind: z.literal("twitch.cheer"), facts: z.object({
    bits: z.number().int().min(1).max(1_000_000), is_anonymous: z.literal(false),
  }).strict() }).strict(),
]).refine(event => event.schemaVersion === 2 || z.uuid().safeParse(event.event_id).success);
// Fail closed on drift/unknown database responses; never spread a privileged RPC payload.
const receiptSchema = z.object({
  schemaVersion: z.literal(1), mode: z.literal("intake_only"), receiptId: z.uuid(),
  eventKey: z.string().regex(/^[a-f0-9]{64}$/), receivedAt: z.iso.datetime({ offset: true }),
  decision: z.enum(["held", "rejected"]), reason: z.enum(["earning_disabled", "account_ineligible"]),
  persisted: z.literal(true), awarded: z.literal(false), earningEnabled: z.literal(false),
  identityChecked: z.literal(true), accountCheckPassed: z.boolean(), providerProofVerified: z.literal(false), replay: z.boolean(),
}).strict().refine(r => (r.decision === "held") === (r.reason === "earning_disabled"));
const defaultLimiter = new RewardsIntegrationLimiter();

export async function handleRewardsIntakeRequest(request: Request, deps: {
  enabled: boolean; registry: () => RewardsIntakeRegistry; now?: number; limiter?: RewardsIntegrationLimiter;
  operation: (source: Source, op: "receive" | "receipt", data: Record<string, unknown>, key: string | null) => Promise<unknown>;
}): Promise<Response> {
  const requestId = randomUUID();
  const headers: Record<string, string> = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Request-Id": requestId };
  try {
    if (!deps.enabled) throw new Failure(404, "not_found");
    const registry = deps.registry();
    const now = deps.now ?? Date.now();
    const match = /^Bearer (bri_([a-z0-9-]{3,64})\.[A-Za-z0-9_-]{43})$/.exec(request.headers.get("authorization") ?? "");
    const client = match && registry.clients.find(c => c.id === match[2]);
    if (!client || !match || client.revoked || Date.parse(client.expiresAt) <= now
      || !timingSafeEqual(Buffer.from(hashKey(match[1]), "hex"), Buffer.from(client.keyHash, "hex"))) throw new Failure(401, "invalid_client");
    const source = registry.sources.find(s => s.id === client.sourceId);
    if (!source || source.revoked) throw new Failure(403, "source_unavailable");
    const url = new URL(request.url);
    const path = /^\/api\/v1\/integrations\/rewards\/intake\/(activities|receipts\/([a-f0-9]{64}))\/?$/.exec(url.pathname);
    if (!path) throw new Failure(404, "not_found");
    const op = path[1] === "activities" ? "receive" : "receipt";
    if (request.method !== (op === "receive" ? "POST" : "GET")) {
      headers.Allow = op === "receive" ? "POST" : "GET";
      throw new Failure(405, "method_not_allowed");
    }
    if (url.search) throw new Failure(400, "invalid_query");
    const required = op === "receive" ? "rewards:intake:write" : "rewards:receipts:read";
    if (!client.scopes.includes(required)) throw new Failure(403, "insufficient_scope");
    if (!(deps.limiter ?? defaultLimiter).allow(client.id, now)) throw new Failure(429, "rate_limited");
    let data: Record<string, unknown> = {};
    if (op === "receive") {
      const event = rewardsIntakeEventSchema.safeParse(await readRewardsIntegrationBody(request));
      if (!event.success) throw new Failure(400, "invalid_fields");
      if (event.data.broadcaster_id !== source.broadcasterId) throw new Failure(403, "source_not_allowed");
      if (!source.kinds.includes(event.data.kind)) throw new Failure(403, "kind_not_allowed");
      data = { ...event.data, event_id: event.data.schemaVersion === 1 ? event.data.event_id.toLowerCase() : event.data.event_id };
      // Freshness is a database decision AFTER checking durable replay state.
    }
    const raw = await deps.operation(source, op, data, path[2] ?? null);
    if (raw && typeof raw === "object" && "error" in raw) {
      const code = (raw as { error: unknown }).error;
      if (code === "idempotency_conflict") throw new Failure(409, code);
      if (code === "not_found") throw new Failure(404, code);
      if (code === "event_time_out_of_range") throw new Failure(422, code);
      if (code === "invalid_fields") throw new Failure(400, code);
      throw Error("intake_unavailable");
    }
    const result = receiptSchema.safeParse(raw);
    if (!result.success) throw Error("intake_unavailable");
    return Response.json(result.data, { headers });
  } catch (error) {
    const status = error instanceof Failure ? error.status : 503;
    if (status === 401) headers["WWW-Authenticate"] = "Bearer";
    if (status === 429) headers["Retry-After"] = "60";
    return Response.json({ error: { code: error instanceof Failure ? error.code : "intake_unavailable", requestId } }, { status, headers });
  }
}
