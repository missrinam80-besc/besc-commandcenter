import Link from "next/link";
import { CheckCircle2, CloudCog, KeyRound, RefreshCw, TriangleAlert } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { requireActiveMembership } from "@/lib/auth-context";
import {
  googlePitchdeckConfiguration,
  googleWorkspaceConfiguration,
  type WorkspaceResource,
} from "@/lib/google-workspace";
import { googleGmailConfiguration } from "@/lib/google-gmail";
import { saveIntegration, testGoogleWorkspaceConnection } from "./actions";

const providers: Record<string, string> = {
  google_workspace: "Google Workspace",
  discord: "Discord",
  vercel_ai_gateway: "Vercel AI Gateway",
  openai: "OpenAI",
  anthropic: "Claude / Anthropic",
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  twitch: "Twitch",
  tiktok: "TikTok",
  other: "Overige",
};
const statuses: Record<string, string> = {
  not_configured: "Niet geconfigureerd",
  configured: "Geconfigureerd",
  connected: "Verbonden",
  error: "Fout",
  disabled: "Uitgeschakeld",
};
const resourceLabels: Record<string, string> = {
  shared_drive: "Gedeelde Drive",
  folder: "Hoofdmap",
  calendar: "Agenda",
  minutes: "Template notulen",
  sponsor_report: "Template sponsorrapport",
  event: "Template event",
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams;
  const { supabase, membership } = await requireActiveMembership();
  if (!["admin", "board"].includes(membership.role)) {
    return <AppShell active="Integraties"><div className="module-body"><div className="permission-note">Alleen bestuur en beheerders kunnen integraties beheren.</div></div></AppShell>;
  }
  const { data } = await supabase
    .from("integration_connections")
    .select("*")
    .eq("organization_id", membership.organization_id)
    .is("deleted_at", null)
    .order("provider");
  const rows = data ?? [];
  const google = rows.find((item) => item.provider === "google_workspace");
  const resources = ((google?.configuration as { resources?: WorkspaceResource[] } | null)?.resources ?? []);
  const workspaceConfig = googleWorkspaceConfiguration();
  const pitchdeckConfig = googlePitchdeckConfiguration();
  const gmailConfig = googleGmailConfiguration();
  const envStatus = [
    { name: "Google Workspace", configured: workspaceConfig.configured, variable: workspaceConfig.missing.join(", ") || "9 variabelen aanwezig" },
    { name: "Sponsor-pitchdeck", configured: Boolean(pitchdeckConfig.sponsor), variable: "GOOGLE_TEMPLATE_SPONSOR_PITCHDECK_ID" },
    { name: "Event-pitchdeck", configured: Boolean(pitchdeckConfig.event), variable: "GOOGLE_TEMPLATE_EVENT_PITCHDECK_ID" },
    { name: "Gmail-concepten", configured: gmailConfig.configured, variable: gmailConfig.configured ? gmailConfig.sender : "GOOGLE_GMAIL_SENDER" },
    { name: "Vercel AI Gateway", configured: Boolean(process.env.VERCEL_OIDC_TOKEN || process.env.AI_GATEWAY_API_KEY), variable: "VERCEL_OIDC_TOKEN" },
    { name: "OpenAI", configured: Boolean(process.env.OPENAI_API_KEY), variable: "OPENAI_API_KEY" },
    { name: "Claude", configured: Boolean(process.env.ANTHROPIC_API_KEY), variable: "ANTHROPIC_API_KEY" },
  ];

  return (
    <AppShell active="Integraties">
      <header className="topbar module-top">
        <div><p>VERBINDINGEN & AUTOMATISERING</p><h1>Integraties</h1></div>
        <Link className="primary" href="?nieuw=1">Integratie registreren</Link>
      </header>
      <div className="module-body">
        <p className="lead">Beheer verbindingsmetadata en controleer serverconfiguratie zonder geheime sleutels in de database op te slaan.</p>
        {query.fout && <div className="error-note">De verbindingstest of opslag is mislukt ({query.fout}). Controleer hieronder de foutmelding.</div>}
        {query.succes === "google-verbonden" && <div className="success">Drive, Docs en Calendar zijn bereikbaar. Alleen metadata werd in Supabase geregistreerd.</div>}
        {query.succes && query.succes !== "google-verbonden" && <div className="success">Integratie bijgewerkt.</div>}

        <section className="integration-security">
          <KeyRound/><div><strong>Geheimen blijven buiten Supabase</strong><span>API-sleutels staan uitsluitend in Vercel Environment Variables en lokaal in .env.local.</span></div>
        </section>
        <section className="integration-env-grid">
          {envStatus.map((item) => <article key={item.name} className={item.configured ? "ready" : "missing"}>{item.configured ? <CheckCircle2/> : <TriangleAlert/>}<div><strong>{item.name}</strong><span>{item.configured ? "Serverconfiguratie gevonden" : `${item.variable} ontbreekt`}</span></div></article>)}
        </section>

        <section className="form-card workspace-connection-card">
          <div className="form-heading">
            <div><span className="eyebrow">GOOGLE WORKSPACE</span><h2>Verbinding en bronnen</h2></div>
            <span className={`integration-status ${google?.status ?? "not_configured"}`}>{statuses[google?.status ?? "not_configured"]}</span>
          </div>
          <p>De test leest de ingestelde Drive, hoofdmap, agenda en drie templates. Google blijft verantwoordelijk voor alle toegangsrechten.</p>
          {google?.last_error && <div className="error-note">{google.last_error}</div>}
          {resources.length > 0 && (
            <div className="workspace-resource-grid">
              {resources.map((resource) => (
                <article key={`${resource.type}-${resource.role ?? resource.id}`}>
                  <CheckCircle2/>
                  <div><strong>{resourceLabels[resource.role ?? resource.type] ?? resource.type}</strong><span>{resource.name}</span></div>
                  {resource.webUrl && <a href={resource.webUrl} target="_blank" rel="noreferrer">Open</a>}
                </article>
              ))}
            </div>
          )}
          <form action={testGoogleWorkspaceConnection}>
            <button className="primary" disabled={!workspaceConfig.configured}><RefreshCw size={15}/>{google?.status === "connected" ? "Opnieuw testen" : "Verbinding testen"}</button>
          </form>
        </section>

        {query.nieuw && (
          <section className="form-card">
            <div className="form-heading"><h2>Integratie registreren</h2><Link href="?">Sluiten</Link></div>
            <form action={saveIntegration}>
              <div className="form-row">
                <label>Dienst<select name="provider">{Object.entries(providers).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                <label>Naam<input name="display_name" required placeholder="BESC Google Workspace"/></label>
                <label>Account / workspace<input name="account_label"/></label>
                <label>Status<select name="status">{Object.entries(statuses).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
              </div>
              <div className="form-actions"><button className="primary">Opslaan</button></div>
            </form>
          </section>
        )}
        <section className="integration-list">
          {rows.map((item) => <article key={item.id}><CloudCog/><div><strong>{item.display_name}</strong><span>{providers[item.provider]} · {item.account_label || "Geen accountlabel"}{item.last_sync_at ? ` · getest ${new Date(item.last_sync_at).toLocaleString("nl-BE")}` : ""}</span></div><b className={`integration-status ${item.status}`}>{statuses[item.status]}</b></article>)}
          {!rows.length && <div className="empty">Nog geen integraties geregistreerd.</div>}
        </section>
      </div>
    </AppShell>
  );
}
