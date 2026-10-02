import { exchangeMcpToken } from "@/lib/social-mcp-oauth";
import { getMcpConfig, oauthPost } from "@/lib/social-mcp-runtime";
import { createMcpStore, canReadMcpSocial } from "@/lib/social-mcp-store";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return oauthPost(request, "form", body => {
    const config = getMcpConfig()!;
    return exchangeMcpToken(new URLSearchParams(body), config, createMcpStore(), userId => canReadMcpSocial(userId, config.organizationId));
  });
}
