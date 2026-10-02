import { clientRedirects, tokenHash, OAuthError } from "@/lib/social-mcp-oauth";
import { getMcpConfig, oauthPost } from "@/lib/social-mcp-runtime";
import { createMcpStore } from "@/lib/social-mcp-store";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return oauthPost(request, "form", async body => {
    const params = new URLSearchParams(body), clientId = params.get("client_id") ?? "";
    for (const key of params.keys()) if (!["token", "client_id", "token_type_hint"].includes(key) || params.getAll(key).length !== 1) throw new OAuthError("invalid_request");
    clientRedirects(clientId, getMcpConfig()!);
    const token = params.get("token") ?? "";
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new OAuthError("invalid_request");
    await createMcpStore().revoke(tokenHash(token), clientId);
    return {}; // Unknown tokens give the same response, per RFC 7009.
  });
}
