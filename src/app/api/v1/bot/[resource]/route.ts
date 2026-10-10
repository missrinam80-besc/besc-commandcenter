import { handleBotRequest, parseBotClients } from "@/lib/bot-api";
import { createBotStore } from "@/lib/bot-api-store";
import { createAdminClient } from "@/lib/supabase/admin";
import { BotUpstreamAborted, withBotUpstream } from "@/lib/bot-api-upstream";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    return await withBotUpstream(fetcher => handleBotRequest(request, {
      clients: parseBotClients(process.env.BESC_BOT_CLIENTS_JSON),
      store: createBotStore(createAdminClient(fetcher)),
      audit: record => console.info(JSON.stringify({ type: "besc_bot_api", ...record })),
    }), { signal: request.signal });
  } catch (error) {
    const requestId = randomUUID();
    const code = error instanceof BotUpstreamAborted ? "upstream_unavailable" : "server_configuration_unavailable";
    console.info(JSON.stringify({ type: "besc_bot_api", requestId, clientId: null, resource: "unknown", status: 503, code }));
    return Response.json({ error: { code, requestId } }, {
      status: 503, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Request-Id": requestId },
    });
  }
}
