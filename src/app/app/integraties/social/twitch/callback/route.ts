import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/lib/auth-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeTwitchCode, fetchTwitchOperationalData, twitchConfiguration, validateTwitchToken } from "@/lib/twitch-integration";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const trustedOrigin = twitchConfiguration().siteUrl || url.origin;
  const cookieStore = await cookies();
  const state = url.searchParams.get("state"); const code = url.searchParams.get("code");
  const expectedState = cookieStore.get("besc_twitch_oauth_state")?.value; const accountId = cookieStore.get("besc_twitch_oauth_account")?.value;
  cookieStore.delete("besc_twitch_oauth_state"); cookieStore.delete("besc_twitch_oauth_account");
  if (!state || !expectedState || state !== expectedState || !code || !accountId) return NextResponse.redirect(new URL("/app/integraties/social?fout=oauth-state", trustedOrigin));
  const { supabase, user, membership } = await requireActiveMembership();
  if (!["admin", "board"].includes(membership.role)) return NextResponse.redirect(new URL("/app?fout=rechten", trustedOrigin));
  const { data: account } = await supabase.from("social_accounts").select("id").eq("id", accountId).eq("organization_id", membership.organization_id).eq("platform", "twitch").is("deleted_at", null).maybeSingle();
  if (!account) return NextResponse.redirect(new URL("/app/integraties/social?fout=account", trustedOrigin));
  try {
    const token = await exchangeTwitchCode(code);
    const validation = await validateTwitchToken(token.access_token!);
    const channel = await fetchTwitchOperationalData(token.access_token!, validation.user_id!);
    const expiresAt = new Date(Date.now() + (token.expires_in ?? 14_400) * 1000).toISOString();
    const admin = createAdminClient();
    const { error: credentialError } = await admin.rpc("store_social_account_credentials", { p_account_id: account.id, p_access_token: token.access_token, p_refresh_token: token.refresh_token ?? null, p_expires_at: expiresAt });
    if (credentialError) throw credentialError;
    const { error: accountError } = await supabase.from("social_accounts").update({ account_name: channel.user.display_name, external_account_id: channel.user.id, account_type: "channel", status: "connected", granted_scopes: token.scope ?? [], token_expires_at: expiresAt, connected_by: user.id, last_error: null, updated_at: new Date().toISOString() }).eq("id", account.id).eq("organization_id", membership.organization_id);
    if (accountError) throw accountError;
    return NextResponse.redirect(new URL("/app/integraties/social?succes=twitch-verbonden", trustedOrigin));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Onbekende Twitch OAuth-fout";
    await supabase.from("social_accounts").update({ status: "error", last_error: message.slice(0, 1000), updated_at: new Date().toISOString() }).eq("id", account.id).eq("organization_id", membership.organization_id);
    return NextResponse.redirect(new URL("/app/integraties/social?fout=twitch-oauth", trustedOrigin));
  }
}
