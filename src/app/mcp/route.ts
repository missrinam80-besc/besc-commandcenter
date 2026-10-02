import { createHmac } from "node:crypto";
import { getMcpConfig, mcpRequestLimit, oauthReply } from "@/lib/social-mcp-runtime";
import { clientRedirects, mcpChallenge, tokenHash, SOCIAL_MCP_SCOPE } from "@/lib/social-mcp-oauth";
import { createMcpStore, canReadMcpSocial } from "@/lib/social-mcp-store";
import { handleSocialMcp } from "@/lib/social-mcp-server";
import { handleSocialMetricsExport } from "@/lib/social-metrics-export";
import { readSocialMetricsExportPage } from "@/lib/social-metrics-export-query";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
async function handle(request: Request) {
  const config = getMcpConfig();
  if (!config) return oauthReply({ error: "mcp_not_configured" }, 503);
  return handleSocialMcp(request, {
    origin: config.origin, challenge: mcpChallenge(config), allowRequest: mcpRequestLimit,
    authenticate: async (token) => {
      const grant = await createMcpStore().findAccess(tokenHash(token));
      if (!grant || grant.revoked_at || Date.parse(grant.expires_at) <= Date.now() || grant.organization_id !== config.organizationId
        || grant.resource !== config.resource || grant.scope !== SOCIAL_MCP_SCOPE) return null;
      try { clientRedirects(grant.client_id, config); } catch { return null; }
      if (!await canReadMcpSocial(grant.user_id, config.organizationId)) return null;
      return { userId: grant.user_id };
    },
    readMetrics: async (params, userId) => {
      // Internal reuse; the permanent export key is never forwarded or disclosed.
      const key = createHmac("sha256", config.signingKey).update(`social-cursor:${config.organizationId}:${userId}`).digest("hex");
      const url = new URL(`${config.origin}/api/v1/social/metrics`);
      for (const [name, value] of Object.entries(params)) url.searchParams.set(name, String(value));
      return handleSocialMetricsExport(new Request(url, { headers: { Authorization: `Bearer ${key}` } }), {
        apiKey: key, organizationId: config.organizationId,
        readPage: query => readSocialMetricsExportPage(createAdminClient(), query),
      });
    },
  });
}
export { handle as POST, handle as GET, handle as DELETE };
