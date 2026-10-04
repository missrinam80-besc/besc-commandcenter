import { exchangeMcpToken } from "@/lib/commandcenter-mcp-oauth";
import { getMcpConfig, oauthPost } from "@/lib/commandcenter-mcp-runtime";
import { createMcpStore, canReadMcpCommandCenter } from "@/lib/commandcenter-mcp-store";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return oauthPost(request, "form", body => {
    const config = getMcpConfig()!;
    return exchangeMcpToken(new URLSearchParams(body), config, createMcpStore(), userId => canReadMcpCommandCenter(userId, config.organizationId));
  });
}
