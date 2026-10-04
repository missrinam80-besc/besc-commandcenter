import { protectedResourceMetadata } from "@/lib/commandcenter-mcp-oauth";
import { getMcpConfig, oauthReply } from "@/lib/commandcenter-mcp-runtime";
export const dynamic = "force-dynamic";
export function GET() {
  const config = getMcpConfig();
  return config ? oauthReply(protectedResourceMetadata(config)) : oauthReply({ error: "mcp_not_configured" }, 503);
}
