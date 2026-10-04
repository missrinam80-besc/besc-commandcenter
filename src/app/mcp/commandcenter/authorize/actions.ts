"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMcpConfig } from "@/lib/commandcenter-mcp-runtime";
import { readConsentTicket, issueMcpCode, authorizationRedirect, type AuthorizationRequest } from "@/lib/commandcenter-mcp-oauth";
import { canReadMcpCommandCenter, createMcpStore } from "@/lib/commandcenter-mcp-store";

function consentPath(request: AuthorizationRequest | null) {
  if (!request) return "/mcp/commandcenter/authorize";
  return `/mcp/commandcenter/authorize?${new URLSearchParams({ response_type: "code", client_id: request.clientId, redirect_uri: request.redirectUri,
    resource: request.resource, scope: request.scope, state: request.state, code_challenge: request.challenge, code_challenge_method: "S256" })}`;
}
export async function signInForMcp(form: FormData) {
  const config = getMcpConfig();
  if (!config) redirect("/mcp/commandcenter/authorize?fout=configuratie");
  let request: AuthorizationRequest | null = null;
  try {
    const ticket = String(form.get("ticket") ?? "");
    if (ticket) request = readConsentTicket(ticket, config);
  } catch { redirect("/mcp/commandcenter/authorize?fout=verzoek"); }
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: String(form.get("email") ?? "").trim(), password: String(form.get("password") ?? "") });
  const destination = consentPath(request);
  redirect(error ? `${destination}${request ? "&" : "?"}fout=inloggegevens` : destination);
}
export async function decideMcpConsent(form: FormData) {
  const config = getMcpConfig();
  if (!config) redirect("/mcp/commandcenter/authorize?fout=configuratie");
  let destination: string;
  try {
    const request = readConsentTicket(String(form.get("ticket") ?? ""), config);
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !await canReadMcpCommandCenter(user.id, config.organizationId)) {
      destination = authorizationRedirect(request, config, { error: "access_denied" });
    } else if (form.get("decision") === "deny") {
      destination = authorizationRedirect(request, config, { error: "access_denied" });
    } else if (form.get("decision") === "approve") {
      destination = await issueMcpCode(request, user.id, config, createMcpStore());
    } else { destination = "/mcp/commandcenter/authorize?fout=verzoek"; }
  } catch { destination = "/mcp/commandcenter/authorize?fout=verzoek"; }
  redirect(destination);
}
export async function revokeMcpConnection(form: FormData) {
  const config = getMcpConfig();
  if (!config) redirect("/mcp/commandcenter/authorize?fout=configuratie");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const id = String(form.get("grant_id") ?? "");
  if (!user || !/^[0-9a-f-]{36}$/i.test(id)) redirect("/mcp/commandcenter/authorize?fout=verzoek");
  const { error } = await createAdminClient().from("commandcenter_mcp_oauth_grants").update({ revoked_at: new Date().toISOString() })
    .eq("id", id).eq("user_id", user.id).eq("organization_id", config.organizationId);
  redirect(error ? "/mcp/commandcenter/authorize?fout=verzoek" : "/mcp/commandcenter/authorize?ingetrokken=1");
}
