import { registerMcpClient, OAuthError } from "@/lib/social-mcp-oauth";
import { getMcpConfig, oauthPost } from "@/lib/social-mcp-runtime";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return oauthPost(request, "json", async (body) => {
    let metadata: unknown;
    try { metadata = JSON.parse(body); } catch { throw new OAuthError("invalid_client_metadata"); }
    return registerMcpClient(metadata, getMcpConfig()!);
  });
}
