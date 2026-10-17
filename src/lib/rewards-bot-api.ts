import { randomUUID } from "node:crypto";
import { z } from "zod";
import { authenticateBotClient, BotRateLimiter, type BotClient, type BotStore, type BotScope } from "./bot-api.ts";
import { rewardSchemas, rewardErrors } from "./rewards.ts";

type Store = { operation(op: string, actor: string | null, data: Record<string, unknown>, key?: string): Promise<Record<string, unknown>> };
const snow = z.string().regex(/^[1-9]\d{16,19}$/);
const envelope = z.object({ guild_id: snow, discord_user_id: snow, idempotency_key: z.string().min(8).max(128), data: z.record(z.string(), z.unknown()) }).strict();
const limiter = new BotRateLimiter(180);
class Failure extends Error {
  status: number; code: string;
  constructor(status: number, code: string) { super(code); this.status = status; this.code = code; }
}
async function body(request: Request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) throw new Failure(415, "json_required");
  if (Number(request.headers.get("content-length")) > 8192) throw new Failure(413, "body_too_large");
  const reader = request.body?.getReader();
  if (!reader) throw new Failure(400, "invalid_body");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([(async () => {
      const chunks: Uint8Array[] = []; let size = 0;
      while (true) {
        const part = await reader.read(); if (part.done) break;
        size += part.value.byteLength; if (size > 8192) throw new Failure(413, "body_too_large"); chunks.push(part.value);
      }
      try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new Failure(400, "invalid_body"); }
    })(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Failure(408, "body_timeout")), 3000); })]);
  } finally { clearTimeout(timer); void reader.cancel().catch(() => {}); }
}
export async function handleRewardsBotRequest(request: Request, deps: {
  clients: BotClient[]; identity: Pick<BotStore, "findAccount" | "findMembership">;
  store: (client: BotClient) => Store; activityEnabled: boolean; now?: number;
}) {
  const requestId = randomUUID();
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Request-Id": requestId };
  try {
    const client = authenticateBotClient(request, deps.clients, deps.now);
    if (!client) throw new Failure(401, "invalid_client");
    const url = new URL(request.url);
    const path = /^\/api\/v1\/bot\/rewards\/(account|catalog|requests|activity|config)(?:\/([0-9a-f-]{36})\/(cancel))?\/?$/.exec(url.pathname);
    if (!path || (path[2] && path[1] !== "requests")) throw new Failure(404, "not_found");
    const resource = path[1];
    const read = request.method === "GET" && !path[2] && ["account", "catalog", "requests", "config"].includes(resource);
    const write = request.method === "POST" && ["requests", "activity"].includes(resource);
    if (!read && !write) throw new Failure(405, "method_not_allowed");
    const required: BotScope = resource === "activity" || resource === "config" ? "rewards:activity:ingest" : read ? "rewards:own:read" : "rewards:own:write";
    if (!client.scopes.includes(required)) throw new Failure(403, "insufficient_scope");
    if (!limiter.allow(client.id, deps.now ?? Date.now())) throw new Failure(429, "rate_limited");
    let discordId = "", key: string | undefined, op: string = resource, data: Record<string, unknown> = {};
    if (read) {
      const allowed = resource === "config" ? ["guild_id"] : ["guild_id", "discord_user_id", "offset"];
      for (const name of url.searchParams.keys()) if (!allowed.includes(name) || url.searchParams.getAll(name).length !== 1) throw new Failure(400, "invalid_query");
      if (url.searchParams.get("guild_id") !== client.guildId) throw new Failure(403, "guild_not_allowed");
      if (resource === "config") {
        const config = deps.activityEnabled ? await deps.store(client).operation("activity_config", null, {}) : { rules: [] };
        return Response.json({ schemaVersion: 1, enabled: deps.activityEnabled, ...config }, { headers });
      }
      discordId = url.searchParams.get("discord_user_id") ?? "";
      const offset = url.searchParams.get("offset") ?? "0";
      if (!/^(0|[1-9]\d{0,4})$/.test(offset) || Number(offset) > 99975) throw new Failure(400, "invalid_offset");
      data = { offset: Number(offset) };
    } else {
      if (url.search) throw new Failure(400, "invalid_query");
      const parsed = envelope.safeParse(await body(request));
      if (!parsed.success) throw new Failure(400, "invalid_fields");
      if (parsed.data.guild_id !== client.guildId) throw new Failure(403, "guild_not_allowed");
      discordId = parsed.data.discord_user_id; key = parsed.data.idempotency_key;
      op = resource === "activity" ? "activity" : path[2] ? "cancel" : "request";
      if (path[2] && Object.hasOwn(parsed.data.data, "id") && parsed.data.data.id !== path[2]) throw new Failure(400, "invalid_fields");
      const fields = rewardSchemas[op as "activity" | "request" | "cancel"].safeParse(path[2] ? { ...parsed.data.data, id: path[2] } : parsed.data.data);
      if (!fields.success) throw new Failure(400, "invalid_fields");
      data = fields.data;
      if (resource !== "activity") {
        if (!snow.safeParse(key).success) throw new Failure(400, "invalid_event_id");
        key = `${client.guildId}:command:${key}`;
      }
      if (resource === "activity") {
        if (!deps.activityEnabled) throw new Failure(409, "activity_disabled");
        // Text events are Discord message snowflakes, bound to their timestamp.
        if (data.kind === "text") {
          if (!snow.safeParse(key).success) throw new Failure(400, "invalid_event_id");
          const stamp = Number((BigInt(key) >> BigInt(22)) + BigInt(1420070400000));
          if (Math.abs(stamp - Date.parse(String(data.occurred_at))) > 1000) throw new Failure(400, "invalid_event_id");
        }
        // Globally deduplicate events across API-client rotations too.
        key = data.kind === "text" ? `${client.guildId}:text:${key}` : `${client.guildId}:voice:${discordId}:${Date.parse(String(data.occurred_at))}`;
      }
    }
    if (!snow.safeParse(discordId).success) throw new Failure(400, "invalid_discord_id");
    const actor = await deps.identity.findAccount(discordId);
    if (!actor || actor.banned || actor.verifiedDiscordId !== discordId) throw new Failure(404, "account_unavailable");
    const member = await deps.identity.findMembership(actor.userId, client.organizationId);
    if (!member || member.organization_id !== client.organizationId || member.status !== "active" || !["admin", "board", "member", "volunteer"].includes(member.role)) throw new Failure(403, "membership_required");
    const result = await deps.store(client).operation(op, actor.userId, data, key);
    if (typeof result.error === "string") {
      const safe = Object.hasOwn(rewardErrors, result.error) || ["activity_disabled", "activity_expired", "voice_ineligible", "cooldown", "daily_limit"].includes(result.error);
      if (!safe) throw new Failure(503, "upstream_unavailable");
      throw new Failure(result.error === "idempotency_conflict" || result.error === "stale_version" ? 409 : 422, result.error);
    }
    const rows = result[op === "account" ? "ledger" : op === "catalog" ? "items" : "requests"];
    const next = read && Array.isArray(rows) && rows.length === 25 && Number(data.offset) + 25 <= 99975 ? Number(data.offset) + 25 : null;
    return Response.json({ schemaVersion: 1, ...result, ...(read ? { nextOffset: next } : {}) }, { headers });
  } catch (error) {
    const status = error instanceof Failure ? error.status : 503;
    return Response.json({ error: { code: error instanceof Failure ? error.code : "upstream_unavailable", requestId } }, {
      status, headers: { ...headers, ...(status === 401 ? { "WWW-Authenticate": "Bearer" } : {}), ...(status === 429 ? { "Retry-After": "60" } : {}) },
    });
  }
}
