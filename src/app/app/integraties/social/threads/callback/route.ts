import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/lib/auth-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeThreadsCode, fetchThreadsProfile, threadsConfiguration, threadsScopes } from "@/lib/threads-integration";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const trustedOrigin = threadsConfiguration().siteUrl || url.origin;
  const cookieStore = await cookies();
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const expectedState = cookieStore.get("besc_threads_oauth_state")?.value;
  const accountId = cookieStore.get("besc_threads_oauth_account")?.value;
  cookieStore.delete("besc_threads_oauth_state");
  cookieStore.delete("besc_threads_oauth_account");
  if (!state || !expectedState || state !== expectedState || !code || !accountId) return NextResponse.redirect(new URL("/app/integraties/social?fout=oauth-state", trustedOrigin));
  const { supabase, user, membership } = await requireActiveMembership();
  if (!["admin", "board"].includes(membership.role)) return NextResponse.redirect(new URL("/app?fout=rechten", trustedOrigin));
  const { data: account } = await supabase.from("social_accounts").select("id").eq("id", accountId).eq("organization_id", membership.organization_id).eq("platform", "threads").is("deleted_at", null).maybeSingle();
  if (!account) return NextResponse.redirect(new URL("/app/integraties/social?fout=account", trustedOrigin));
  try {
    const token = await exchangeThreadsCode(code);
    const profile = await fetchThreadsProfile(token.access_token!);
    const expiresAt = new Date(Date.now() + (token.expires_in ?? 5_184_000) * 1000).toISOString();
    const admin = createAdminClient();
    const { error: credentialError } = await admin.rpc("store_social_account_credentials", {
      p_account_id: account.id, p_access_token: token.access_token, p_refresh_token: null, p_expires_at: expiresAt,
    });
    if (credentialError) throw credentialError;
    const { error: accountError } = await supabase.from("social_accounts").update({
      account_name: profile.username || profile.name || "BESC Threads", external_account_id: profile.id,
      account_type: "profile", status: "connected", granted_scopes: threadsScopes, token_expires_at: expiresAt,
      connected_by: user.id, last_error: null, updated_at: new Date().toISOString(),
    }).eq("id", account.id).eq("organization_id", membership.organization_id);
    if (accountError) throw accountError;
    return NextResponse.redirect(new URL("/app/integraties/social?succes=threads-verbonden", trustedOrigin));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Onbekende Threads OAuth-fout";
    await supabase.from("social_accounts").update({ status: "error", last_error: message.slice(0, 1000), updated_at: new Date().toISOString() }).eq("id", account.id).eq("organization_id", membership.organization_id);
    return NextResponse.redirect(new URL("/app/integraties/social?fout=threads-oauth", trustedOrigin));
  }
}
