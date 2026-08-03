import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/lib/auth-context";
import { threadsConfiguration, threadsScopes } from "@/lib/threads-integration";

export async function GET(request: Request) {
  const { supabase, membership } = await requireActiveMembership();
  if (!["admin", "board"].includes(membership.role)) return NextResponse.redirect(new URL("/app?fout=rechten", request.url));
  const accountId = new URL(request.url).searchParams.get("account");
  if (!accountId) return NextResponse.redirect(new URL("/app/integraties/social?fout=account", request.url));
  const { data: account } = await supabase.from("social_accounts").select("id").eq("id", accountId).eq("organization_id", membership.organization_id).eq("platform", "threads").is("deleted_at", null).maybeSingle();
  if (!account) return NextResponse.redirect(new URL("/app/integraties/social?fout=account", request.url));
  const config = threadsConfiguration();
  if (!config.configured) return NextResponse.redirect(new URL(`/app/integraties/social?fout=${encodeURIComponent(config.missing.join(","))}`, request.url));
  const state = randomBytes(32).toString("base64url");
  const cookieStore = await cookies();
  const options = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/app/integraties/social/threads", maxAge: 600 };
  cookieStore.set("besc_threads_oauth_state", state, options);
  cookieStore.set("besc_threads_oauth_account", account.id, options);
  const parameters = new URLSearchParams({ client_id: config.appId, redirect_uri: config.callbackUrl, scope: threadsScopes.join(","), response_type: "code", state });
  return NextResponse.redirect(`https://threads.net/oauth/authorize?${parameters.toString()}`);
}
