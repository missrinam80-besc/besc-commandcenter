import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/lib/auth-context";
import { twitchConfiguration, twitchScopes } from "@/lib/twitch-integration";

export async function GET(request: Request) {
  const { supabase, membership } = await requireActiveMembership();
  if (!["admin", "board"].includes(membership.role)) return NextResponse.redirect(new URL("/app?fout=rechten", request.url));
  const accountId = new URL(request.url).searchParams.get("account");
  const { data: account } = accountId ? await supabase.from("social_accounts").select("id").eq("id", accountId).eq("organization_id", membership.organization_id).eq("platform", "twitch").is("deleted_at", null).maybeSingle() : { data: null };
  if (!account) return NextResponse.redirect(new URL("/app/integraties/social?fout=account", request.url));
  const config = twitchConfiguration();
  if (!config.configured) return NextResponse.redirect(new URL(`/app/integraties/social?fout=${encodeURIComponent(config.missing.join(","))}`, request.url));
  const state = randomBytes(32).toString("base64url");
  const cookieStore = await cookies();
  const options = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/app/integraties/social/twitch", maxAge: 600 };
  cookieStore.set("besc_twitch_oauth_state", state, options);
  cookieStore.set("besc_twitch_oauth_account", account.id, options);
  const parameters = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.callbackUrl, response_type: "code", scope: twitchScopes.join(" "), state });
  return NextResponse.redirect(`https://id.twitch.tv/oauth2/authorize?${parameters.toString()}`);
}
