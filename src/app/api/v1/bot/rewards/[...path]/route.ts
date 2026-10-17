import { withBotUpstream } from "@/lib/bot-api-upstream";
import { parseBotClients } from "@/lib/bot-api";
import { createBotStore } from "@/lib/bot-api-store";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleRewardsBotRequest } from "@/lib/rewards-bot-api";
export const runtime = "nodejs";
async function handle(request: Request) {
  try {
    return await withBotUpstream(fetcher => {
      const db = createAdminClient(fetcher);
      return handleRewardsBotRequest(request, {
        clients: parseBotClients(process.env.BESC_BOT_CLIENTS_JSON), identity: createBotStore(db),
        activityEnabled: process.env.BESC_REWARDS_ACTIVITY_ENABLED === "true",
        store: client => ({ async operation(op, actor, d, key) {
          const r = await db.rpc("rewards_bot", { o: client.organizationId, u: actor, c: op === "activity" ? "discord-activity" : ["request", "cancel"].includes(op) ? "discord-command" : client.id,
            g: client.guildId, op, d, k: key ?? null });
          if (r.error) throw Error("rewards_unavailable"); return r.data ?? {};
        } }),
      });
    }, { signal: request.signal });
  } catch {
    return Response.json({ error: { code: "upstream_unavailable" } }, { status: 503, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  }
}
export const GET = handle;
export const POST = handle;
