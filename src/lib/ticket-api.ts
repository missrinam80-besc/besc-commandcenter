import { createHash, randomUUID } from "node:crypto";
import { authenticateBotClient, BotRateLimiter, type BotClient, type BotScope } from "./bot-api.ts";

export interface TicketStore {
  operation(org: string, client: string, guild: string, operation: string, data: Record<string, unknown>): Promise<Record<string, unknown>>;
}
const snowflake = /^[1-9]\d{16,19}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const limiter = new BotRateLimiter(120);
const errors: Record<string, number> = { channel_not_allowed:403, rate_limited: 429, idempotency_conflict: 409, source_conflict: 409,
  ticket_expired: 410, interaction_expired: 410, ticket_unavailable: 404, delivery_unavailable: 404,
  ticket_closed: 409, thread_not_allowed: 403, thread_conflict: 409, lease_conflict: 409, invalid_delivery_result: 400 };
class Failure extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) { super(code); this.status = status; this.code = code; }
}

// Stream limit also applies to chunked bodies. A stalled body is cancelled.
async function body(request: Request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) throw new Failure(415, "json_required");
  if (Number(request.headers.get("content-length")) > 16384) throw new Failure(413, "body_too_large");
  const reader = request.body?.getReader();
  if (!reader) throw new Failure(400, "invalid_body");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const bytes = await Promise.race([ (async () => {
      const parts: Uint8Array[] = []; let size = 0;
      while (true) {
        const chunk = await reader.read(); if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 16384) throw new Failure(413, "body_too_large");
        parts.push(chunk.value);
      }
      return Buffer.concat(parts).toString("utf8");
    })(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Failure(408, "body_timeout")), 3000); }) ]);
    const parsed: unknown = JSON.parse(bytes);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Failure(400, "invalid_body");
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof Failure) throw error;
    throw new Failure(400, "invalid_body");
  } finally { clearTimeout(timer); void reader.cancel().catch(() => {}); }
}

export async function handleTicketRequest(request: Request, deps: { clients: BotClient[]; store: TicketStore; limiter?: BotRateLimiter; now?: number }): Promise<Response> {
  const requestId = randomUUID();
  const reply = (status: number, data: object) => Response.json(data, { status, headers: {
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Request-Id": requestId,
    ...(status === 401 ? { "WWW-Authenticate": "Bearer" } : {}), ...(status === 429 ? { "Retry-After": "60" } : {}),
  } });
  try {
    const client = authenticateBotClient(request, deps.clients, deps.now);
    if (!client) throw new Failure(401, "invalid_client");
    if (!(deps.limiter ?? limiter).allow(client.id, deps.now ?? Date.now())) throw new Failure(429, "rate_limited");
    const url = new URL(request.url), path = url.pathname.replace(/^\/api\/v1\/bot\//, "").replace(/\/$/, "");
    let op: string, scope: BotScope, id: string | undefined;
    if (path === "tickets") { op = "create"; scope = "tickets:create"; }
    else if (/^tickets\/[^/]+$/.test(path)) { op = "own"; scope = "tickets:own:read"; id = path.split("/")[1]; }
    else if (/^tickets\/[^/]+\/messages$/.test(path)) { op = "ingest"; scope = "tickets:ingest"; id = path.split("/")[1]; }
    else if (path === "ticket-deliveries/claim") { op = "claim"; scope = "tickets:deliver"; }
    else if (/^ticket-deliveries\/[^/]+\/(complete|fail)$/.test(path)) { op = path.split("/")[2]; scope = "tickets:deliver"; id = path.split("/")[1]; }
    else throw new Failure(404, "not_found");
    if (request.method !== (op === "own" ? "GET" : "POST")) throw new Failure(405, "method_not_allowed");
    if (!client.scopes.includes(scope)) throw new Failure(403, "insufficient_scope");
    if (!client.ticketParentChannelId) throw new Failure(503, "ticket_configuration_unavailable");
    if (id && !uuid.test(id)) throw new Failure(400, "invalid_id");
    const data: Record<string, unknown> = op === "own" ? Object.fromEntries(url.searchParams) : await body(request);
    if (op !== "own" && url.searchParams.size) throw new Failure(400, "invalid_query");
    if (op === "own" && [...url.searchParams.keys()].some(k => url.searchParams.getAll(k).length !== 1)) throw new Failure(400, "invalid_query");
    const allowed: Record<string, string[]> = {
      create: ["guild_id","discord_user_id","parent_channel_id","subject","content"],
      own: ["guild_id","discord_user_id"],
      ingest: ["guild_id","discord_user_id","parent_channel_id","thread_id","source_message_id","content"],
      claim: ["guild_id","worker_id"],
      complete: ["guild_id","worker_id","lease_token","thread_id","thread_absent","message_id","parent_channel_id","requester_discord_id","requester_added","invitable"],
      fail: ["guild_id","worker_id","lease_token","error_code","uncertain"],
    };
    if (Object.keys(data).some(k => !allowed[op].includes(k))) throw new Failure(400, "invalid_fields");
    const field = (name: string, regex: RegExp) => {
      if (typeof data[name] !== "string" || !regex.test(data[name] as string)) throw new Failure(400, "invalid_" + name);
    };
    field("guild_id", snowflake);
    if (data.guild_id !== client.guildId) throw new Failure(403, "guild_not_allowed");
    if (["create","own","ingest"].includes(op)) field("discord_user_id", snowflake);
    if (["create","ingest"].includes(op)) {
      field("parent_channel_id", snowflake);
      if (op === "create" && data.parent_channel_id !== client.ticketParentChannelId) throw new Failure(403, "channel_not_allowed");
      if (typeof data.content !== "string" || data.content.trim().length < 1 || data.content.length > 4000) throw new Failure(400, "invalid_content");
      data.content = data.content.trim();
      const key = request.headers.get("idempotency-key") ?? "";
      if (!snowflake.test(key)) throw new Failure(400, "invalid_idempotency_key");
      if (op === "create") {
        if (typeof data.subject !== "string" || data.subject.trim().length < 1 || data.subject.length > 160) throw new Failure(400, "invalid_subject");
        data.subject = data.subject.trim();
      } else {
        field("thread_id", snowflake); field("source_message_id", snowflake);
        if (key !== data.source_message_id) throw new Failure(400, "invalid_idempotency_key");
      }
      if (op === "ingest") data.ticket_id = id;
      data.request_hash = createHash("sha256").update(JSON.stringify(Object.fromEntries(Object.entries(data).sort(([a],[b]) => a.localeCompare(b))))).digest("hex");
      data.idempotency_key = key;
    }
    if (["claim","complete","fail"].includes(op)) field("worker_id", /^[a-zA-Z0-9_-]{8,64}$/);
    if (["complete","fail"].includes(op)) field("lease_token", uuid);
    if (op === "complete") {
      if (data.thread_absent !== undefined && typeof data.thread_absent !== "boolean") throw new Failure(400, "invalid_delivery_result");
      if (data.thread_absent !== true || data.thread_id !== undefined) field("thread_id", snowflake);
      if (data.message_id !== undefined) field("message_id", snowflake);
      if (data.parent_channel_id !== undefined && (typeof data.parent_channel_id !== "string" || !snowflake.test(data.parent_channel_id))) throw new Failure(403, "channel_not_allowed");
    }
    if (op === "fail") {
      if (!["discord_unavailable","permission_denied","thread_missing","unexpected_participants","duplicate_marker","outcome_unknown"].includes(String(data.error_code)) || typeof data.uncertain !== "boolean") throw new Failure(400, "invalid_failure");
    }
    if (id) data[op === "own" || op === "ingest" ? "ticket_id" : "delivery_id"] = id;
    const result = await deps.store.operation(client.organizationId, client.id, client.guildId, op, data);
    if (typeof result.error === "string") throw new Failure(errors[result.error] ?? 503, Object.hasOwn(errors, result.error) ? result.error : "upstream_unavailable");
    return reply(op === "create" ? 201 : 200, result);
  } catch (error) {
    const failure = error instanceof Failure ? error : new Failure(503, "upstream_unavailable");
    return reply(failure.status, { error: { code: failure.code, requestId } });
  }
}
