import Link from "next/link";
import { CheckCircle2, CloudCog, RefreshCw, TriangleAlert } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { requireActiveMembership } from "@/lib/auth-context";
import {
  googlePitchdeckConfiguration,
  googleWorkspaceConfiguration,
  type WorkspaceResource,
} from "@/lib/google-workspace";
import { googleGmailConfiguration } from "@/lib/google-gmail";
import SocialAccountsSection from "./social-accounts";
import { saveIntegration, testGoogleWorkspaceConnection } from "./actions";

const providers: Record<string, string> = {
  google_workspace: "Google Workspace",
  discord: "Discord",
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
  const { data, error } = await supabase
    .from("integration_connections")
    .select("*")
    .eq("organization_id", membership.organization_id)
    .is("deleted_at", null)
    .order("provider");
  const rows = (data ?? []).filter((item) => !["vercel_ai_gateway", "openai", "anthropic"].includes(item.provider));
  const google = rows.find((item) => item.provider === "google_workspace");
  const resources = ((google?.configuration as { resources?: WorkspaceResource[] } | null)?.resources ?? []);
  const workspaceConfig = googleWorkspaceConfiguration();
  const pitchdeckConfig = googlePitchdeckConfiguration();
  const gmailConfig = googleGmailConfiguration();
  const envStatus = [
    { name: "Google Workspace", configured: workspaceConfig.configured, variable: workspaceConfig.missing.join(", ") || "9 variabelen aanwezig" },
    { name: "Sponsor-pitchdeck", configured: Boolean(pitchdeckConfig.sponsor), variable: "GOOGLE_TEMPLATE_SPONSOR_PITCHDECK_ID" },
    { name: "Gmail-concepten", configured: gmailConfig.configured, variable: gmailConfig.configured ? gmailConfig.sender : "GOOGLE_GMAIL_SENDER" },
  ];

  return (
    <AppShell active="Integraties">
      <header className="topbar module-top">
        <div><p>VERBINDINGEN & AUTOMATISERING</p><h1>Integraties</h1></div>
        <div className="project-actions"><Link href="/app/integraties/logs">Logs</Link><Link href="/app/rapportage/social">Socialrapportage</Link><Link href="?nieuw=integratie">Integratie registreren</Link><Link className="primary" href="?nieuw=social">Account registreren</Link></div>
      </header>
      <div className="module-body integration-overview">
        {query.fout && <div className="error-note">De verbindingstest of opslag is mislukt ({query.fout}). </div>}
        {query.succes === "google-verbonden" && <div className="success">Drive, Docs en Calendar zijn bereikbaar. </div>}
        {query.succes && query.succes !== "google-verbonden" && <div className="success">Integratie bijgewerkt.</div>}

        {error && <div className="error-note">Integraties konden niet worden geladen.</div>}
        <section className="integration-env-grid">
          {envStatus.map((item) => <article key={item.name} className={item.configured ? "ready" : "missing"}>{item.configured ? <CheckCircle2/> : <TriangleAlert/>}<div><strong>{item.name}</strong><span>{item.configured ? "Ingesteld" : "Nog niet ingesteld"}</span></div></article>)}
        </section>

        <section className="form-card workspace-connection-card">
          <div className="form-heading">
            <div><span className="eyebrow">GOOGLE WORKSPACE</span><h2>Verbinding en bronnen</h2></div>
            <span className={`integration-status ${google?.status ?? "not_configured"}`}>{statuses[google?.status ?? "not_configured"]}</span>
          </div>
          <p>{google?.account_label || "Geen Google-account geregistreerd"}{google?.last_sync_at ? ` · getest ${new Intl.DateTimeFormat("nl-BE", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Brussels" }).format(new Date(google.last_sync_at))}` : ""}</p>
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

        {["1", "integratie"].includes(query.nieuw ?? "") && (
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
        <SocialAccountsSection searchParams={Promise.resolve({ ...query, nieuw: query.nieuw === "social" ? "1" : undefined })}/>
        {rows.some((item) => item.provider !== "google_workspace") && <section className="integration-list">
          {rows.filter((item) => item.provider !== "google_workspace").map((item) => <article key={item.id}><CloudCog/><div><strong>{item.display_name}</strong><span>{providers[item.provider]} · {item.account_label || "Geen accountlabel"}{item.last_sync_at ? ` · getest ${new Intl.DateTimeFormat("nl-BE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Brussels" }).format(new Date(item.last_sync_at))}` : ""}</span></div><b className={`integration-status ${item.status}`}>{statuses[item.status]}</b></article>)}
          {!rows.length && <div className="empty">Nog geen integraties geregistreerd.</div>}
        </section>}
      </div>
    </AppShell>
  );
}
