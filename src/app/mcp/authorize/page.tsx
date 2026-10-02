import Link from "next/link";
import { getMcpConfig } from "@/lib/social-mcp-runtime";
import { consentTicket, parseAuthorization, type AuthorizationRequest } from "@/lib/social-mcp-oauth";
import { canReadMcpSocial } from "@/lib/social-mcp-store";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { signInForMcp, decideMcpConsent, revokeMcpConnection } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "BESC Socialrapportage – ChatGPT-toegang", robots: { index: false, follow: false } };
export default async function McpConsent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const config = getMcpConfig();
  if (!config) return <main className="module-body"><h1>BESC Socialrapportage</h1><p>De beveiligde ChatGPT-koppeling is nog niet geconfigureerd.</p></main>;
  let request: AuthorizationRequest | null = null;
  try {
    if (query.client_id) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (key === "fout") continue;
        if (Array.isArray(value)) value.forEach(item => params.append(key, item));
        else if (value !== undefined) params.append(key, value);
      }
      request = parseAuthorization(params, config);
    }
  } catch { return <main className="module-body"><h1>Verbindingsverzoek geweigerd</h1><p>Het terugkeeradres, de rechten of de PKCE-beveiliging zijn niet geldig. Start de verbinding opnieuw vanuit ChatGPT.</p></main>; }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const ticket = request ? consentTicket(request, config) : "";
  if (!user) return <main className="module-body"><section className="login-card"><h1>BESC Socialrapportage</h1><p>Log in met je bestaande Command Center-account. Daarna kies je expliciet of ChatGPT toegang krijgt.</p>
    {query.fout && <p role="alert">Inloggen of verbinden is niet gelukt. Controleer je gegevens en probeer opnieuw.</p>}
    <form action={signInForMcp}><input type="hidden" name="ticket" value={ticket}/>
      <label>E-mailadres<input name="email" type="email" autoComplete="email" required/></label>
      <label>Wachtwoord<input name="password" type="password" autoComplete="current-password" required/></label>
      <button className="login-submit" type="submit">Inloggen</button></form>
    <p>Gebruik je alleen Discord? <Link href="/login" target="_blank" rel="noopener noreferrer">Log in via het gewone aanmeldscherm</Link> en vernieuw daarna deze pagina.</p>
    </section></main>;
  if (!await canReadMcpSocial(user.id, config.organizationId)) return <main className="module-body"><h1>Geen toegang tot socialrapportage</h1><p>Alleen actieve BESC-beheerders, bestuursleden en teamleden kunnen deze koppeling toestaan.</p></main>;
  if (request) return <main className="module-body"><section className="login-card"><h1>ChatGPT toegang geven?</h1>
    <p>Je bent aangemeld als {user.email}. Je staat deze verbinding toe om opgeslagen socialmetingen van BESC te lezen.</p>
    <p>Recht: <strong>social:read</strong>. Geen wijzigingen, synchronisaties, e-mails of toegang tot andere dossiers.</p>
    <p>Terugkeeradres: <code>{request.redirectUri}</code></p>
    <p>Deze toestemming verloopt na 30 dagen. Je kunt ze eerder intrekken op deze pagina.</p>
    <form action={decideMcpConsent}><input type="hidden" name="ticket" value={ticket}/>
      <button type="submit" name="decision" value="approve" className="login-submit">Alleen-lezen toegang toestaan</button>
      <button type="submit" name="decision" value="deny">Weigeren</button></form></section></main>;
  const { data: grants, error } = await createAdminClient().from("social_mcp_oauth_grants").select("id,created_at,expires_at")
    .eq("user_id", user.id).eq("organization_id", config.organizationId).is("revoked_at", null)
    .gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(100);
  return <main className="module-body"><h1>Mijn BESC ChatGPT-verbindingen</h1>
    <p>Intrekken blokkeert onmiddellijk alle toegangstokens van die verbinding.</p>
    {query.ingetrokken === "1" && <p role="status">Toegang ingetrokken.</p>}
    {(error || query.fout) && <p role="alert">De verbindingen konden niet worden geladen of bijgewerkt. Controleer of de database-migratie is toegepast.</p>}
    {!error && !grants?.length && <p>Geen actieve verbindingen.</p>}
    {grants?.map(grant => <section key={grant.id}><p>Verbinding van {new Date(grant.created_at).toLocaleString("nl-BE", { timeZone: "Europe/Brussels" })} — verloopt {new Date(grant.expires_at).toLocaleDateString("nl-BE", { timeZone: "Europe/Brussels" })}</p>
      <form action={revokeMcpConnection}><input type="hidden" name="grant_id" value={grant.id}/><button type="submit">Toegang intrekken</button></form></section>)}
    <Link href="/app/rapportage/social">Terug naar Socialrapportage</Link></main>;
}
