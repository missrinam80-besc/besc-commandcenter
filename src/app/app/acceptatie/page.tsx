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
import { completeAcceptanceRun, startAcceptanceRun, updateAcceptanceCheck } from "@/app/app/acceptatie/actions";
import { acceptanceChecks, acceptanceStatusLabel } from "@/lib/acceptance";
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

type AcceptanceRun = {
  id: string;
  title: string;
  status: string;
  environment: string;
  commit_sha: string | null;
  notes: string | null;
  started_at: string;
  completed_at: string | null;
  starter?: { display_name: string | null } | { display_name: string | null }[] | null;
};

type AcceptanceCheckResult = {
  id: string;
  run_id: string;
  check_key: string;
  category: string;
  title: string;
  status: string;
  evidence: string | null;
  updated_at: string;
};

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

function runStatusLabel(status: string) {
  if (status === "accepted") return "Formeel geaccepteerd";
  if (status === "passed") return "Geslaagd";
  if (status === "failed") return "Niet geslaagd";
  if (status === "archived") return "Gearchiveerd";
  return "Lopend";
}

function formatDateTime(value: string | null) {
  if (!value) return "Nog niet afgerond";
  return new Intl.DateTimeFormat("nl-BE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function starterName(starter: AcceptanceRun["starter"]) {
  const row = Array.isArray(starter) ? starter[0] : starter;
  return row?.display_name ?? "onbekend";
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
    { data: runs },
  ] = await Promise.all([
    supabase.from("organization_members").select("user_id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "active"),
    supabase.from("knowledge_articles").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "published").is("deleted_at", null),
    supabase.from("approval_requests").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "pending"),
    supabase.from("google_resource_links").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("resource_type", "document").is("web_url", null),
    supabase.from("integration_connections").select("provider,status,last_sync_at,last_error").eq("organization_id", organizationId).is("deleted_at", null),
    supabase.from("acceptance_runs")
      .select("id,title,status,environment,commit_sha,notes,started_at,completed_at,starter:profiles!acceptance_runs_started_by_fkey(display_name)")
      .eq("organization_id", organizationId)
      .order("started_at", { ascending: false })
      .limit(8),
  ]);

  const runRows = (runs ?? []) as unknown as AcceptanceRun[];
  const activeRun = runRows.find((run) => run.status === "in_progress") ?? runRows[0] ?? null;
  const { data: checkRows } = activeRun
    ? await supabase.from("acceptance_check_results")
      .select("id,run_id,check_key,category,title,status,evidence,updated_at")
      .eq("organization_id", organizationId)
      .eq("run_id", activeRun.id)
      .order("category", { ascending: true })
      .order("created_at", { ascending: true })
    : { data: [] };
  const acceptanceResults = (checkRows ?? []) as AcceptanceCheckResult[];
  const passedManualChecks = acceptanceResults.filter((check) => ["passed", "not_applicable"].includes(check.status)).length;
  const blockingManualChecks = acceptanceResults.filter((check) => ["failed", "blocked", "pending"].includes(check.status)).length;

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
            <div><span>Actieve testronde</span><strong>{activeRun ? `${passedManualChecks}/${acceptanceChecks.length}` : "Geen"}</strong><small>{activeRun ? `${blockingManualChecks} open/blokkerend` : "start eerst een run"}</small></div>
          </article>
        </section>

        <section className="form-card acceptance-card">
          <div className="form-heading">
            <div><span className="eyebrow">TESTRONDE</span><h2>Releaseacceptatie registreren</h2></div>
          </div>
          <form action={startAcceptanceRun} className="acceptance-start-form">
            <label><span>Titel</span><input name="title" defaultValue={`Acceptatietest ${new Date().toLocaleDateString("nl-BE")}`}/></label>
            <label><span>Omgeving</span><select name="environment" defaultValue={process.env.VERCEL_ENV === "production" ? "production" : process.env.VERCEL_ENV === "preview" ? "preview" : "local"}><option value="local">Lokaal</option><option value="preview">Preview</option><option value="production">Productie</option></select></label>
            <label><span>Notities</span><input name="notes" placeholder="Bijvoorbeeld: test met bestuurdersaccount en vrijwilligeraccount"/></label>
            <button className="primary" type="submit"><Rocket size={15}/>Nieuwe testronde starten</button>
          </form>
          {activeRun ? (
            <div className={`acceptance-run-banner run-${activeRun.status}`}>
              <div>
                <strong>{activeRun.title}</strong>
                <span>{runStatusLabel(activeRun.status)} · {activeRun.environment} · gestart op {formatDateTime(activeRun.started_at)} · {starterName(activeRun.starter)}</span>
              </div>
              <div className="acceptance-run-actions">
                <small>{activeRun.commit_sha ? activeRun.commit_sha.slice(0, 7) : "geen commit"}</small>
                <Link href={`/app/acceptatie/export?run=${activeRun.id}`}>CSV-export</Link>
                <span>Print/PDF: Ctrl+P</span>
              </div>
            </div>
          ) : <p className="empty-inline">Er is nog geen acceptatieronde geregistreerd.</p>}
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
          {activeRun && acceptanceResults.length ? (
            <div className="acceptance-check-table">
              {acceptanceResults.map((check, index) => (
                <form action={updateAcceptanceCheck} key={check.id} className={`acceptance-check-row check-${check.status}`}>
                  <input type="hidden" name="id" value={check.id}/>
                  <input type="hidden" name="run_id" value={check.run_id}/>
                  <b>{index + 1}</b>
                  <div>
                    <strong>{check.title}</strong>
                    <span>{check.category} · {acceptanceStatusLabel(check.status)}</span>
                  </div>
                  <select name="status" defaultValue={check.status}>
                    <option value="pending">Te testen</option>
                    <option value="passed">Geslaagd</option>
                    <option value="failed">Mislukt</option>
                    <option value="blocked">Geblokkeerd</option>
                    <option value="not_applicable">Niet van toepassing</option>
                  </select>
                  <input name="evidence" defaultValue={check.evidence ?? ""} placeholder="Bewijs, opmerking of link"/>
                  <button type="submit">Opslaan</button>
                </form>
              ))}
            </div>
          ) : (
            <div className="manual-check-grid">
              {acceptanceChecks.map((item, index) => <article key={item.key}><b>{index + 1}</b><span>{item.title}</span></article>)}
            </div>
          )}
          {activeRun ? (
            <div className="acceptance-complete-actions">
              <form action={completeAcceptanceRun}>
                <input type="hidden" name="id" value={activeRun.id}/>
                <input type="hidden" name="decision" value="complete"/>
                <input name="notes" placeholder="Afrondnotitie"/>
                <button type="submit">Testronde afronden</button>
              </form>
              <form action={completeAcceptanceRun}>
                <input type="hidden" name="id" value={activeRun.id}/>
                <input type="hidden" name="decision" value="accept"/>
                <input name="notes" placeholder="Formele acceptatienotitie"/>
                <button className="primary" type="submit">Formeel accepteren</button>
              </form>
            </div>
          ) : null}
        </section>

        <section className="form-card acceptance-card">
          <div className="form-heading"><div><span className="eyebrow">HISTORIEK</span><h2>Laatste acceptatierondes</h2></div></div>
          <div className="acceptance-run-list">
            {runRows.length ? runRows.map((run) => (
              <article key={run.id}>
                <div><strong>{run.title}</strong><span>{run.environment} · {formatDateTime(run.started_at)} · {runStatusLabel(run.status)}</span></div>
                <div className="acceptance-run-actions">
                  <small>{run.completed_at ? `afgerond ${formatDateTime(run.completed_at)}` : "nog lopend"}</small>
                  <Link href={`/app/acceptatie/export?run=${run.id}`}>CSV</Link>
                </div>
              </article>
            )) : <p className="empty-inline">Nog geen testrondes.</p>}
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
