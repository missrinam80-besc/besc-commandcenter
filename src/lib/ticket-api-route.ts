import { parseBotClients } from "@/lib/bot-api";
import { withBotUpstream } from "@/lib/bot-api-upstream";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleTicketRequest } from "@/lib/ticket-api";

export async function ticketRoute(request: Request) {
  try {
    return await withBotUpstream(fetcher => {
      const db = createAdminClient(fetcher);
      return handleTicketRequest(request, { clients: parseBotClients(process.env.BESC_BOT_CLIENTS_JSON), store: {
        async operation(org, client, guild, operation, data) {
          const result = await db.rpc("ticket_bot_operation", { p_org: org, p_client: client, p_guild: guild, p_op: operation, p_data: data });
          if (result.error || !result.data) throw Error("ticket_store_unavailable");
          return result.data;
        },
      } });
    }, { signal: request.signal });
  } catch {
    return Response.json({ error: { code: "upstream_unavailable" } }, { status: 503, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  }
}
