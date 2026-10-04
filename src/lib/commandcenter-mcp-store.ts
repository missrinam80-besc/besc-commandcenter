import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { McpGrant, OAuthStore } from "./commandcenter-mcp-oauth";

export function createMcpStore(): OAuthStore {
  const admin = createAdminClient();
  return {
    async createCode(input) {
      const { error } = await admin.from("commandcenter_mcp_oauth_grants").insert({ ...input.grant, redirect_uri: input.redirectUri, code_challenge: input.challenge });
      if (error) throw new Error("oauth_store_unavailable");
      const code = await admin.from("commandcenter_mcp_oauth_tokens").insert({ token_hash: input.codeHash, grant_id: input.grant.id, kind: "code", expires_at: input.codeExpiresAt });
      if (code.error) {
        await admin.from("commandcenter_mcp_oauth_grants").delete().eq("id", input.grant.id);
        throw new Error("oauth_store_unavailable");
      }
    },
    async exchange(input) {
      const { data, error } = await admin.rpc("exchange_commandcenter_mcp_token", {
        p_token_hash: input.tokenHash, p_kind: input.kind, p_client_id: input.clientId,
        p_redirect_uri: input.redirectUri, p_resource: input.resource, p_code_challenge: input.challenge,
        p_access_hash: input.accessHash, p_refresh_hash: input.refreshHash,
      });
      if (error) throw new Error("oauth_store_unavailable");
      return data as McpGrant | null;
    },
    async findAccess(hash) {
      const { data, error } = await admin.from("commandcenter_mcp_oauth_tokens")
        .select("commandcenter_mcp_oauth_grants!inner(id,user_id,organization_id,client_id,resource,scope,expires_at,revoked_at)")
        .eq("token_hash", hash).eq("kind", "access").is("used_at", null)
        .gt("expires_at", new Date().toISOString()).maybeSingle();
      if (error) throw new Error("oauth_store_unavailable");
      return data?.commandcenter_mcp_oauth_grants as unknown as McpGrant | null;
    },
    async revoke(hash, clientId) {
      const { data, error } = await admin.from("commandcenter_mcp_oauth_tokens").select("grant_id").eq("token_hash", hash).in("kind", ["access", "refresh"]).maybeSingle();
      if (error) throw new Error("oauth_store_unavailable");
      if (data) {
        const result = await admin.from("commandcenter_mcp_oauth_grants").update({ revoked_at: new Date().toISOString() }).eq("id", data.grant_id).eq("client_id", clientId);
        if (result.error) throw new Error("oauth_store_unavailable");
      }
    },
  };
}

// Live membership check on consent, token exchange AND every MCP request.
// Initial connector is restricted to active managers; no volunteer or member data access; never trust user_metadata.
export async function canReadMcpCommandCenter(userId: string, organizationId: string) {
  const admin = createAdminClient();
  const [{ data: user, error: userError }, membership] = await Promise.all([
    admin.auth.admin.getUserById(userId),
    admin.from("organization_members").select("role,status").eq("organization_id", organizationId).eq("user_id", userId).eq("status", "active").maybeSingle(),
  ]);
  const bannedUntil = (user.user as { banned_until?: string } | null)?.banned_until;
  return !userError && Boolean(user.user) && (!bannedUntil || Date.parse(bannedUntil) <= Date.now()) && !membership.error
    && ["admin", "board"].includes(membership.data?.role ?? "");
}
