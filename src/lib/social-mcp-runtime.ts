import "server-only";
import { socialMcpConfig, OAuthError, createMcpLimiter } from "./social-mcp-oauth";

export const mcpRequestLimit = createMcpLimiter();
const oauthLimit = createMcpLimiter(60);
export function getMcpConfig() { return socialMcpConfig(process.env); }
export function oauthReply(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "Pragma": "no-cache", "X-Content-Type-Options": "nosniff" } });
}
export async function oauthPost(request: Request, kind: "json" | "form", action: (body: string) => Promise<unknown>) {
  const config = getMcpConfig();
  if (!config) return oauthReply({ error: "mcp_not_configured" }, 503);
  if (!oauthLimit("public-endpoints")) return new Response(null, { status: 429, headers: { "Retry-After": "60", "Cache-Control": "no-store" } });
  const origin = request.headers.get("origin");
  if ((request.headers.get("host") ?? new URL(request.url).host) !== new URL(config.origin).host
    || (origin && ![config.origin, "https://chatgpt.com"].includes(origin))) return oauthReply({ error: "invalid_origin" }, 403);
  if (request.headers.has("authorization")) return oauthReply({ error: "invalid_client" }, 401);
  const expected = kind === "json" ? "application/json" : "application/x-www-form-urlencoded";
  if (!request.headers.get("content-type")?.startsWith(expected)) return oauthReply({ error: "invalid_request" }, 415);
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new OAuthError("invalid_request");
    let size = 0; const parts: Uint8Array[] = [];
    for (;;) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 16_384) { await reader.cancel(); throw new OAuthError("invalid_request", 413); }
      parts.push(chunk.value);
    }
    return oauthReply(await action(Buffer.concat(parts).toString("utf8")), kind === "json" ? 201 : 200);
  } catch (error) {
    if (error instanceof OAuthError) return oauthReply({ error: error.code }, error.status);
    return oauthReply({ error: "server_error" }, 503);
  }
}
