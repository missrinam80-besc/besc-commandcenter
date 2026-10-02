import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/lib/auth-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeMetaCode, fetchMetaManagedAssets, metaConfiguration, selectMetaAsset, verifyMetaToken, type MetaPlatform } from "@/lib/meta-integration";
import { metaPermissionSummary } from "@/lib/meta-token-diagnostics";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const trustedOrigin = metaConfiguration().siteUrl || url.origin;
  const cookieStore = await cookies();
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const expectedState = cookieStore.get("besc_meta_oauth_state")?.value;
  const accountId = cookieStore.get("besc_meta_oauth_account")?.value;
  cookieStore.delete("besc_meta_oauth_state");
  cookieStore.delete("besc_meta_oauth_account");
  if (!state || !expectedState || state !== expectedState || !code || !accountId) return NextResponse.redirect(new URL("/app/integraties/social?fout=oauth-state", trustedOrigin));

  const { supabase, user, membership } = await requireActiveMembership();
  if (!["admin", "board"].includes(membership.role)) return NextResponse.redirect(new URL("/app?fout=rechten", trustedOrigin));
  const { data: account } = await supabase.from("social_accounts").select("id,platform,external_account_id").eq("id", accountId).eq("organization_id", membership.organization_id).in("platform", ["facebook", "instagram"]).is("deleted_at", null).maybeSingle();
  if (!account) return NextResponse.redirect(new URL("/app/integraties/social?fout=account", trustedOrigin));

  try {
    const platform = account.platform as MetaPlatform;
    const token = await exchangeMetaCode(code);
    const assets = await fetchMetaManagedAssets(token.access_token!);
    const asset = selectMetaAsset(assets, platform, account.external_account_id);
    const diagnostics = await verifyMetaToken(asset.accessToken, platform);
    const expiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null;
    const admin = createAdminClient();
    const { error: credentialError } = await admin.rpc("store_social_account_credentials", {
      p_account_id: account.id,
      p_access_token: asset.accessToken,
      p_refresh_token: null,
      p_expires_at: expiresAt,
    });
    if (credentialError) throw credentialError;
    const { error: accountError } = await supabase.from("social_accounts").update({
      account_name: asset.name,
      external_account_id: asset.externalId,
      account_type: asset.accountType,
      status: "connected",
      granted_scopes: diagnostics.scopes,
      token_expires_at: expiresAt,
      connected_by: user.id,
      last_error: diagnostics.missingScopes.length ? metaPermissionSummary(diagnostics) : null,
      updated_at: new Date().toISOString(),
    }).eq("id", account.id).eq("organization_id", membership.organization_id);
    if (accountError) throw accountError;
    return NextResponse.redirect(new URL(`/app/integraties/social?succes=${platform}-verbonden`, trustedOrigin));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Onbekende Meta OAuth-fout";
    await supabase.from("social_accounts").update({ status: "error", last_error: message.slice(0, 1000), updated_at: new Date().toISOString() }).eq("id", account.id).eq("organization_id", membership.organization_id);
    return NextResponse.redirect(new URL("/app/integraties/social?fout=meta-oauth", trustedOrigin));
  }
}
