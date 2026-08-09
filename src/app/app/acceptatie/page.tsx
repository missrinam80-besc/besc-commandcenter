import Link from "next/link";
import {
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  Rocket,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { requireActiveMembership } from "@/lib/auth-context";
import { googleGmailConfiguration } from "@/lib/google-gmail";
import { googlePitchdeckConfiguration, googleWorkspaceConfiguration } from "@/lib/google-workspace";

type CheckStatus = "ready" | "warning" | "blocked";

type CheckItem = {
  label: string;
  status: CheckStatus;
  detail: string;
  href?: string;
};

const manualChecks = [
  "Login testen als beheerder, bestuurslid, vrijwilliger en portaalgebruiker.",
  "Account aanmaken, goedkeuren, profiel aanpassen, Discord koppelen en uitloggen.",
  "Inboxitem maken en omzetten naar taak of dossier.",
  "Project, event, campagne en taak aanmaken, bewerken, koppelen, archiveren en verwijderen.",
  "Drive-map maken voor project en event; documentregister controleren.",
  "Event en vergadering synchroniseren naar Google Calendar; geannuleerd item verwijderen.",
  "Notulen, eventdossier en sponsorrapport genereren en ter goedkeuring voorleggen.",
  "Gmail-concept maken, laten goedkeuren, versturen en dossiercommunicatie controleren.",
  "Nieuwsbriefinschrijving, bevestiging, uitschrijving en goedgekeurde verzending testen.",
  "Rapportage online, CSV/PDF en managementoverzichten vergelijken.",
  "Social accounts koppelen en handmatige sync per actief platform uitvoeren.",
  "Productiedeployment uitvoeren en dezelfde rooktest herhalen.",
];

const decisionGates = [
  { label: "LinkedIn", detail: "Pas bouwen na Community Management-producttoegang." },
  { label: "TikTok", detail: "Pas bouwen na productgoedkeuring en audit." },
  { label: "X", detail: "Pas bouwen na expliciet API-budget en ingestelde kostenlimiet." },
  { label: "Volledige boekhouding", detail: "Pas bouwen na validatie door boekhouder van regime, rapporten en afsluitingen." },
];

function envCheck(label: string, configured: boolean, detail: string, href?: string): CheckItem {
  return { label, status: configured ? "ready" : "blocked", detail, href };
}

function statusLabel(status: CheckStatus) {
  return status === "ready" ? "Klaar" : status === "warning" ? "Te testen" : "Geblokkeerd";
}

function StatusIcon({ status }: { status: CheckStatus }) {
  return status === "ready" ? <CheckCircle2/> : <TriangleAlert/>;
}

export default async function AcceptancePage() {
  const { supabase, membership } = await requireActiveMembership();
  if (!["admin", "board"].includes(membership.role)) {
    return (
      <AppShell active="Productieacceptatie">
        <div className="module-body">
          <div className="permission-note">Alleen bestuur en beheerders kunnen productieacceptatie bekijken.</div>
        </div>
      </AppShell>
    );
  }

  const organizationId = membership.organization_id;
  const workspace = googleWorkspaceConfiguration();
  const gmail = googleGmailConfiguration();
  const pitchdeck = googlePitchdeckConfiguration();

  const [
    { count: activeMembers },
    { count: knowledgeArticles },
    { count: pendingApprovals },
    { count: missingGeneratedDocuments },
    { data: integrations },
  ] = await Promise.all([
    supabase.from("organization_members").select("user_id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "active"),
    supabase.from("knowledge_articles").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "published").is("deleted_at", null),
    supabase.from("approval_requests").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "pending"),
    supabase.from("google_resource_links").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("resource_type", "document").is("web_url", null),
    supabase.from("integration_connections").select("provider,status,last_sync_at,last_error").eq("organization_id", organizationId).is("deleted_at", null),
  ]);

  const integrationRows = integrations ?? [];
  const connectedSocial = integrationRows.filter((item) =>
    ["youtube", "facebook", "instagram", "threads", "twitch"].includes(item.provider) && item.status === "connected"
  );

  const environmentChecks: CheckItem[] = [
    envCheck("Supabase client", Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY), "Publieke Supabase-configuratie voor login en data."),
    envCheck("Supabase server key", Boolean(process.env.SUPABASE_SECRET_KEY), "Server-only sleutel voor beheertaken en integraties."),
    envCheck("Site URL", Boolean(process.env.NEXT_PUBLIC_SITE_URL), "Nodig voor auth callbacks, e-mail en publieke nieuwsbrieflinks."),
    envCheck("Google Workspace", workspace.configured, workspace.configured ? "Drive, Docs en Calendar configuratie aanwezig." : `Ontbrekend: ${workspace.missing.join(", ")}`, "/app/integraties"),
    envCheck("Gmail-concepten", gmail.configured, gmail.configured ? `Afzender: ${gmail.sender}` : "GOOGLE_GMAIL_SENDER ontbreekt.", "/app/communicatie"),
    envCheck("Pitchdecktemplates", Boolean(pitchdeck.sponsor && pitchdeck.event), "Sponsor- en eventpitchdecktemplates voor rapportage.", "/app/rapportage"),
    envCheck("AI-provider", Boolean(process.env.VERCEL_OIDC_TOKEN || process.env.AI_GATEWAY_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY), "Minstens een AI-route voor AI Hub en schrijfhulp.", "/app/ai-hub"),
  ];

  const dataChecks: CheckItem[] = [
    { label: "Actieve gebruikers", status: (activeMembers ?? 0) > 0 ? "ready" : "blocked", detail: `${activeMembers ?? 0} actieve gebruikers.` },
    { label: "Kennisbank", status: (knowledgeArticles ?? 0) >= 3 ? "ready" : "warning", detail: `${knowledgeArticles ?? 0} gepubliceerde artikels.` },
    { label: "Goedkeuringswerkvoorraad", status: (pendingApprovals ?? 0) === 0 ? "ready" : "warning", detail: `${pendingApprovals ?? 0} openstaande goedkeuringen.`, href: "/app/goedkeuringen" },
    { label: "Documentregistraties", status: (missingGeneratedDocuments ?? 0) === 0 ? "ready" : "warning", detail: `${missingGeneratedDocuments ?? 0} gekoppelde documenten zonder web_url.`, href: "/app/documenten" },
    { label: "Social pilots", status: connectedSocial.length ? "warning" : "blocked", detail: connectedSocial.length ? `${connectedSocial.length} social integraties verbonden; handmatige sync vereist.` : "Nog geen verbonden social pilot.", href: "/app/integraties/social" },
  ];

  const readyCount = [...environmentChecks, ...dataChecks].filter((item) => item.status === "ready").length;
  const totalCount = environmentChecks.length + dataChecks.length;
  const blockedCount = [...environmentChecks, ...dataChecks].filter((item) => item.status === "blocked").length;

  return (
    <AppShell active="Productieacceptatie">
      <header className="topbar module-top">
        <div><p>RELEASE & CONTROLE</p><h1>Productieacceptatie</h1></div>
        <Link className="primary" href="/app/kennisbank?zoeken=Productie%20acceptatie"><Rocket size={16}/>Open handleiding</Link>
      </header>
      <div className="module-body acceptance-page">
        <p className="lead">Gebruik dit scherm voor de laatste controle voor preview, productie en echte gebruikersdata. De app toont geen geheimen, alleen of de benodigde configuratie aanwezig is.</p>

        <section className="acceptance-score">
          <article>
            <Rocket/>
            <div><span>Technische status</span><strong>{readyCount}/{totalCount}</strong><small>{blockedCount} blokkades</small></div>
          </article>
          <article>
            <ShieldCheck/>
            <div><span>Omgeving</span><strong>{process.env.VERCEL_ENV ?? "lokaal"}</strong><small>{process.env.VERCEL_GIT_COMMIT_SHA ? process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7) : "geen Vercel commit"}</small></div>
          </article>
          <article>
            <ClipboardCheck/>
            <div><span>Handmatige checks</span><strong>{manualChecks.length}</strong><small>uit te voeren met echte testdata</small></div>
          </article>
        </section>

        <div className="acceptance-grid">
          <section className="form-card acceptance-card">
            <div className="form-heading"><div><span className="eyebrow">CONFIGURATIE</span><h2>Environment en integraties</h2></div></div>
            <div className="acceptance-list">
              {environmentChecks.map((item) => (
                <article className={`acceptance-${item.status}`} key={item.label}>
                  <StatusIcon status={item.status}/>
                  <div><strong>{item.label}</strong><span>{item.detail}</span></div>
                  {item.href ? <Link href={item.href}>Open</Link> : <b>{statusLabel(item.status)}</b>}
                </article>
              ))}
            </div>
          </section>

          <section className="form-card acceptance-card">
            <div className="form-heading"><div><span className="eyebrow">DATA</span><h2>Applicatiestatus</h2></div></div>
            <div className="acceptance-list">
              {dataChecks.map((item) => (
                <article className={`acceptance-${item.status}`} key={item.label}>
                  <StatusIcon status={item.status}/>
                  <div><strong>{item.label}</strong><span>{item.detail}</span></div>
                  {item.href ? <Link href={item.href}>Open</Link> : <b>{statusLabel(item.status)}</b>}
                </article>
              ))}
            </div>
          </section>
        </div>

        <section className="form-card acceptance-card">
          <div className="form-heading"><div><span className="eyebrow">ROOKTEST</span><h2>Handmatige productieacceptatie</h2></div></div>
          <div className="manual-check-grid">
            {manualChecks.map((item, index) => <article key={item}><b>{index + 1}</b><span>{item}</span></article>)}
          </div>
        </section>

        <section className="form-card acceptance-card">
          <div className="form-heading"><div><span className="eyebrow">BESLISPOORTEN</span><h2>Nog niet bouwen zonder aparte beslissing</h2></div></div>
          <div className="acceptance-gates">
            {decisionGates.map((gate) => <article key={gate.label}><TriangleAlert/><div><strong>{gate.label}</strong><span>{gate.detail}</span></div></article>)}
          </div>
        </section>

        <section className="integration-security">
          <ExternalLink/>
          <div><strong>Volgende releaseactie</strong><span>Deploy eerst naar preview, voer de rooktest uit, pas daarna productie. Controleer Supabase Advisors apart in het Supabase-dashboard.</span></div>
        </section>
      </div>
    </AppShell>
  );
}
