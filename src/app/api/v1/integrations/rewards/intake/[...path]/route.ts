import { withBotUpstream } from "@/lib/bot-api-upstream";
import { handleRewardsIntakeRequest, parseRewardsIntakeRegistry } from "@/lib/rewards-intake";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request: Request) {
  try {
    return await withBotUpstream(fetcher => handleRewardsIntakeRequest(request, {
      enabled: process.env.BESC_REWARDS_INTAKE_ENABLED === "true",
      registry: () => parseRewardsIntakeRegistry(process.env.BESC_REWARDS_INTAKE_REGISTRY_JSON),
      async operation(source, op, data, key) {
        const result = await createAdminClient(fetcher).rpc("rewards_intake", {
          o: source.organizationId, b: source.broadcasterId, op, d: data, k: key,
        });
        if (result.error) throw Error("intake_unavailable");
        return result.data;
      },
    }), { signal: request.signal });
  } catch {
    return Response.json({ error: { code: "intake_unavailable" } }, {
      status: 503, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });
  }
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
export const HEAD = handle;
