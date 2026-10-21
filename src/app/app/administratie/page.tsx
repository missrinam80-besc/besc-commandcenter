import { dossierEditorGate } from "@/components/dossier-editor-gate";
import Link from "next/link";
import { CheckCircle2, ExternalLink, FileText, ShieldAlert, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { requireActiveMembership } from "@/lib/auth-context";
import { completeComplianceDeadline } from "./actions";

const documentTypes: Record<string, string> = {
  articles: "Statuten",
  incorporation: "Oprichtingsakte",
  official_gazette: "Belgisch Staatsblad",
  kbo: "KBO",
  ubo: "UBO",
  vat: "BTW",
  minutes: "Notulen",
  annual_accounts: "Jaarrekening",
  budget: "Begroting",
  insurance: "Verzekering",
  contract: "Contract",
  subsidy: "Subsidie",
  policy: "Beleid",
  register: "Register",
  other: "Overige",
};
const memberTypes: Record<string, string> = {
  effective: "Effectief lid",
  adherent: "Toegetreden lid",
  honorary: "Erelid",
  volunteer: "Vrijwilliger",
};
const mandateRoles: Record<string, string> = {
  chair: "Voorzitter",
  vice_chair: "Ondervoorzitter",
  secretary: "Secretaris",
  treasurer: "Penningmeester",
  director: "Bestuurder",
  daily_management: "Dagelijks bestuur",
  other: "Andere functie",
};
const deadlineCategories: Record<string, string> = {
  general_assembly: "Algemene Vergadering",
  board: "Bestuur",
  finance: "Financiën",
  kbo: "KBO",
  ubo: "UBO",
  tax: "Belastingen",
  insurance: "Verzekering",
  subsidy: "Subsidie",
  publication: "Publicatie",
  contract: "Contract",
  other: "Overige",
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams;
  const unifiedEditor = await dossierEditorGate({group:"administration",query:query});
  if (unifiedEditor) return unifiedEditor;

  const overdueOnly = query.periode === "achterstallig";
  const { supabase, membership } = await requireActiveMembership();
  const mayManage = ["admin", "board"].includes(membership.role);
  if (!mayManage) {
    return (
      <AppShell active="VZW-administratie">
        <header className="topbar module-top"><div><p>BESTUUR</p><h1>VZW-administratie</h1></div></header>
        <div className="module-body"><div className="permission-note">Deze module bevat vertrouwelijke bestuurs- en ledengegevens en is alleen toegankelijk voor bestuur en beheerders.</div></div>
      </AppShell>
    );
  }

  const organizationId = membership.organization_id;
  const [membersResult, documentsResult, mandatesResult, deadlinesResult] = await Promise.all([
    supabase.from("association_members").select("*").eq("organization_id", organizationId).is("deleted_at", null).order("full_name"),
    supabase.from("administrative_documents").select("*").eq("organization_id", organizationId).is("deleted_at", null).order("document_date", { ascending: false }),
    supabase.from("governance_mandates").select("*,association_members(full_name)").eq("organization_id", organizationId).is("deleted_at", null).order("start_date", { ascending: false }),
    supabase.from("compliance_deadlines").select("*,profiles(display_name),administrative_documents(title)").eq("organization_id", organizationId).is("deleted_at", null).order("due_date")
  ]);

  const members = membersResult.data ?? [];
  const documents = documentsResult.data ?? [];
  const mandates = mandatesResult.data ?? [];
  const deadlines = deadlinesResult.data ?? [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const inThirtyDays = new Date(today);
  inThirtyDays.setDate(inThirtyDays.getDate() + 30);
  const openDeadlines = deadlines.filter((item) => ["open", "planned"].includes(item.status));
  const overdue = openDeadlines.filter(
    (item) => item.due_date && new Date(`${item.due_date}T00:00:00`) < today,
  );
  const upcoming = openDeadlines.filter((item) => {
    if (!item.due_date) return false;
    const date = new Date(`${item.due_date}T00:00:00`);
    return date >= today && date <= inThirtyDays;
  });
  const expiringDocuments = documents.filter((item) => {
    if (!item.valid_until || item.status === "archived") return false;
    const date = new Date(`${item.valid_until}T00:00:00`);
    return date <= inThirtyDays;
  });

  return (
    <AppShell active="VZW-administratie">
      <header className="topbar module-top">
        <div><p>BESTUUR & COMPLIANCE</p><h1>VZW-administratie</h1></div>
        <div className="project-actions">
          <Link href="/app/administratie/werkstromen">Bewijs, rollen en publicatie</Link>
          <Link href="?nieuw=lid">Nieuw lid</Link>
          <Link href="?nieuw=mandaat">Nieuw mandaat</Link>
          <Link href="?nieuw=deadline">Nieuwe deadline</Link>
          <Link className="primary" href="?nieuw=document">Nieuw document</Link>
        </div>
      </header>
      <div className="module-body">
        <p className="lead">Beheer officiële documenten, leden, bestuursmandaten en wettelijke verplichtingen vanuit één vertrouwelijke bestuursomgeving.</p>
        {query.fout && <div className="error-note">Opslaan is mislukt ({query.fout}).</div>}
        {query.succes && <div className="success">De VZW-administratie is bijgewerkt.</div>}
        {overdueOnly && <div className="permission-note">Je ziet hieronder alleen achterstallige VZW-deadlines. <Link href="/app/administratie#deadlines">Toon alle deadlines</Link></div>}

        <section className="administration-summary">
          <article><FileText size={19}/><div><span>Documenten</span><strong>{documents.length}</strong></div></article>
          <article><Users size={19}/><div><span>Actieve leden</span><strong>{members.filter((item) => item.status === "active").length}</strong></div></article>
          <article><CheckCircle2 size={19}/><div><span>Actieve mandaten</span><strong>{mandates.filter((item) => item.status === "active").length}</strong></div></article>
          <article className={overdue.length ? "warning" : ""}><ShieldAlert size={19}/><div><span>Te laat</span><strong>{overdue.length}</strong></div></article>
        </section>

        {(overdue.length > 0 || upcoming.length > 0 || expiringDocuments.length > 0) && (
          <section className="administration-alerts">
            <div className="section-heading"><div><span className="eyebrow">AANDACHT NODIG</span><h2>Bestuurlijke opvolging</h2></div></div>
            {[...overdue, ...upcoming].map((item) => (
              <article key={item.id} className={new Date(`${item.due_date}T00:00:00`) < today ? "overdue" : ""}>
                <div><strong>{item.title}</strong><span>{deadlineCategories[item.category]} · deadline {item.due_date}</span></div>
                <form action={completeComplianceDeadline}><input type="hidden" name="id" value={item.id}/><button>Administratief afronden</button></form>
              </article>
            ))}
            {expiringDocuments.map((item) => <article key={item.id}><div><strong>{item.title}</strong><span>Document vervalt op {item.valid_until}</span></div>{item.drive_url && <a className="row-action" href={item.drive_url} target="_blank" rel="noreferrer">Open</a>}</article>)}
          </section>
        )}

        <div className="administration-grid">
          <section id="deadlines" className="project-task-section administration-wide"><div className="section-heading"><div><span className="eyebrow">COMPLIANCE</span><h2>{overdueOnly ? "Achterstallige deadlines" : "Deadlines"}</h2></div><span>{overdueOnly ? overdue.length : openDeadlines.length} open</span></div><div className="administration-list">{(overdueOnly ? overdue : deadlines).map((item) => <article key={item.id}><Link className="row-action" href={`?bewerken=${item.id}&fiche=deadline`}>Bewerken</Link><div><strong>{item.title}</strong><span>{deadlineCategories[item.category]} · {item.due_date || 'Termijn onbekend'} · {item.recurrence}</span></div><span className="badge">{item.status}</span>{["open","planned"].includes(item.status) && <form action={completeComplianceDeadline}><input type="hidden" name="id" value={item.id}/><button>Administratief afronden</button></form>}</article>)}{!(overdueOnly ? overdue : deadlines).length && <p className="empty-inline">{overdueOnly ? "Geen achterstallige deadlines." : "Nog geen deadlines geregistreerd."}</p>}</div></section>
          <section className="project-task-section"><div className="section-heading"><div><span className="eyebrow">DOSSIER</span><h2>Documenten</h2></div><span>{documents.length}</span></div><div className="administration-list">{documents.map((item) => <article key={item.id}><Link className="row-action" href={`?bewerken=${item.id}&fiche=administration`}>Bewerken</Link><div><strong>{item.title}</strong><span>{documentTypes[item.document_type]} · {item.status}</span></div>{item.drive_url && <a className="row-action" href={item.drive_url} target="_blank" rel="noreferrer"><ExternalLink size={13}/>Open</a>}</article>)}{!documents.length && <p className="empty-inline">Nog geen documenten geregistreerd.</p>}</div></section>
          <section className="project-task-section"><div className="section-heading"><div><span className="eyebrow">LEDENREGISTER</span><h2>Leden</h2></div><span>{members.length}</span></div><div className="administration-list">{members.map((item) => <article key={item.id}><Link className="row-action" href={`?bewerken=${item.id}&fiche=member`}>Bewerken</Link><div><strong>{item.full_name}</strong><span>{item.member_number || "Geen lidnummer"} · {memberTypes[item.membership_type]} · {item.status}</span></div>{item.voting_right && <span className="badge">Stemrecht</span>}</article>)}{!members.length && <p className="empty-inline">Nog geen leden geregistreerd.</p>}</div></section>
          <section className="project-task-section administration-wide"><div className="section-heading"><div><span className="eyebrow">BESTUUR</span><h2>Mandaten</h2></div><span>{mandates.length}</span></div><div className="administration-list mandate-list">{mandates.map((item) => <article key={item.id}><Link className="row-action" href={`?bewerken=${item.id}&fiche=mandate`}>Bewerken</Link><div><strong>{item.association_members?.[0]?.full_name || "Onbekend lid"}</strong><span>{item.role_label || mandateRoles[item.role]} · {item.start_date} tot {item.end_date || "onbepaald"}</span></div><span className="badge">{item.status}</span>{item.appointment_document_url && <a className="row-action" href={item.appointment_document_url} target="_blank" rel="noreferrer">Aanstelling</a>}</article>)}{!mandates.length && <p className="empty-inline">Nog geen bestuursmandaten geregistreerd.</p>}</div></section>
        </div>
      </div>
    </AppShell>
  );
}
