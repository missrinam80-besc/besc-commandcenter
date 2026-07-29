import Link from "next/link";
import {
  CheckCircle2,
  Cloud,
  ExternalLink,
  FileText,
  FolderOpen,
  Search,
  TriangleAlert,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { submitForApproval } from "@/app/app/goedkeuringen/actions";
import { requireActiveMembership } from "@/lib/auth-context";
import { approvalStatusLabels, type ApprovalStatus } from "@/lib/approvals";
import {
  documentModuleLabels,
  driveCoverage,
  driveSourceLabels,
  filterGeneratedDocuments,
  generatedDocumentTypeLabels,
  makeDriveDocument,
  type DriveDocument,
  type GeneratedDocumentRecord,
} from "@/lib/drive-documents";

type BasicRow = {
  id: string;
  title?: string;
  name?: string;
  display_name?: string;
  status: string;
  drive_url?: string | null;
  minutes_url?: string | null;
  updated_at: string;
};

type GoogleDocumentLink = {
  id: string;
  entity_type: "meeting" | "event" | "partner";
  entity_id: string;
  name: string;
  web_url: string;
  updated_at: string;
};

const moduleForEntity = {
  meeting: "meetings",
  event: "events",
  partner: "sponsors",
} as const;

const documentTypeForEntity = {
  meeting: "minutes",
  event: "event_dossier",
  partner: "sponsor_report",
} as const;

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams;
  const { supabase, membership } = await requireActiveMembership();
  const organizationId = membership.organization_id;
  const search = query.zoeken ?? "";
  const moduleFilter = query.module && query.module in documentModuleLabels ? query.module : "all";
  const typeFilter = query.type && query.type in generatedDocumentTypeLabels ? query.type : "all";
  const statusFilter = ["available", "missing"].includes(query.status ?? "") ? query.status! : "all";

  const [
    projects,
    content,
    events,
    sponsors,
    campaigns,
    community,
    knowledge,
    administration,
    meetings,
    launches,
    generatedLinks,
    documentApprovals,
  ] = await Promise.all([
    supabase.from("projects").select("id,title,status,drive_url,updated_at").eq("organization_id", organizationId).is("deleted_at", null).not("status", "eq", "archived"),
    supabase.from("content_items").select("id,title,status,drive_url,updated_at").eq("organization_id", organizationId).is("deleted_at", null).not("status", "eq", "archived"),
    supabase.from("events").select("id,title,status,drive_url,updated_at").eq("organization_id", organizationId).is("deleted_at", null).not("status", "eq", "archived"),
    supabase.from("partners").select("id,name,status,drive_url,updated_at").eq("organization_id", organizationId).is("deleted_at", null).not("status", "eq", "archived"),
    supabase.from("campaigns").select("id,title,status,drive_url,updated_at").eq("organization_id", organizationId).is("deleted_at", null).not("status", "eq", "archived"),
    supabase.from("community_people").select("id,display_name,status,drive_url,updated_at").eq("organization_id", organizationId).is("deleted_at", null).not("status", "eq", "archived"),
    supabase.from("knowledge_articles").select("id,title,status,drive_url,updated_at").eq("organization_id", organizationId).is("deleted_at", null).not("status", "eq", "archived"),
    supabase.from("administrative_documents").select("id,title,status,drive_url,updated_at").eq("organization_id", organizationId).is("deleted_at", null).not("status", "eq", "archived"),
    supabase.from("meetings").select("id,title,status,minutes_url,updated_at").eq("organization_id", organizationId).is("deleted_at", null).not("status", "eq", "archived"),
    supabase.from("merch_launches").select("id,title,status,drive_url,updated_at").eq("organization_id", organizationId).is("deleted_at", null).not("status", "eq", "archived"),
    supabase.from("google_resource_links").select("id,entity_type,entity_id,name,web_url,updated_at").eq("organization_id", organizationId).eq("resource_type", "document").in("entity_type", ["meeting", "event", "partner"]),
    supabase.from("approval_requests").select("entity_id,status").eq("organization_id", organizationId).eq("entity_type", "document").order("requested_at", { ascending: false }),
  ]);

  const links = new Map(
    ((generatedLinks.data ?? []) as GoogleDocumentLink[]).map((link) => [`${link.entity_type}:${link.entity_id}`, link]),
  );
  const documentApprovalMap = new Map<string, ApprovalStatus>();
  for (const request of documentApprovals.data ?? []) {
    if (!documentApprovalMap.has(request.entity_id)) {
      documentApprovalMap.set(request.entity_id, request.status as ApprovalStatus);
    }
  }

  function expectedDocuments(
    rows: BasicRow[] | null,
    entityType: keyof typeof moduleForEntity,
    sourceHref: (id: string) => string,
    include: (row: BasicRow) => boolean,
  ): GeneratedDocumentRecord[] {
    const moduleKey = moduleForEntity[entityType];
    const documentType = documentTypeForEntity[entityType];
    return (rows ?? []).filter(include).map((row) => {
      const link = links.get(`${entityType}:${row.id}`);
      const entityTitle = row.title ?? row.name ?? "Naamloos dossier";
      return {
        id: `${entityType}:${row.id}`,
        entityId: row.id,
        documentLinkId: link?.id ?? null,
        title: link?.name ?? `${generatedDocumentTypeLabels[documentType]} - ${entityTitle}`,
        module: moduleKey,
        moduleLabel: documentModuleLabels[moduleKey],
        documentType,
        documentTypeLabel: generatedDocumentTypeLabels[documentType],
        status: link ? "available" : "missing",
        sourceStatus: row.status,
        sourceHref: sourceHref(row.id),
        driveUrl: link?.web_url ?? null,
        updatedAt: link?.updated_at ?? row.updated_at,
      };
    });
  }

  const generatedDocuments = [
    ...expectedDocuments(meetings.data, "meeting", (id) => `/app/vergaderingen/${id}`, (row) => !["cancelled", "archived"].includes(row.status)),
    ...expectedDocuments(events.data, "event", (id) => `/app/events/${id}`, (row) => !["cancelled", "archived"].includes(row.status)),
    ...expectedDocuments(sponsors.data, "partner", (id) => `/app/sponsors/${id}`, (row) => row.status === "active"),
  ];
  const visibleDocuments = filterGeneratedDocuments(generatedDocuments, {
    query: search,
    module: moduleFilter,
    documentType: typeFilter,
    status: statusFilter,
  });
  const availableCount = generatedDocuments.filter((document) => document.status === "available").length;
  const missingCount = generatedDocuments.length - availableCount;
  const documentCoverage = generatedDocuments.length
    ? Math.round((availableCount / generatedDocuments.length) * 100)
    : 0;

  function convert(
    rows: BasicRow[] | null,
    sourceKey: string,
    href: (id: string) => string,
    urlColumn: "drive_url" | "minutes_url" = "drive_url",
  ) {
    return (rows ?? []).map((row) =>
      makeDriveDocument({
        id: `${sourceKey}-${row.id}`,
        title: row.title ?? row.name ?? row.display_name ?? "Naamloos dossier",
        source: sourceKey,
        sourceHref: href(row.id),
        driveUrl: row[urlColumn] ?? null,
        status: row.status,
        updatedAt: row.updated_at,
      }),
    );
  }

  const allDossiers: DriveDocument[] = [
    ...convert(projects.data, "project", (id) => `/app/projecten/${id}`),
    ...convert(content.data, "content", (id) => `/app/content/${id}`),
    ...convert(events.data, "event", (id) => `/app/events/${id}`),
    ...convert(sponsors.data, "sponsor", (id) => `/app/sponsors/${id}`),
    ...convert(campaigns.data, "campaign", (id) => `/app/campagnes/${id}`),
    ...convert(community.data, "community", (id) => `/app/community/${id}`),
    ...convert(knowledge.data, "knowledge", (id) => `/app/kennisbank/${id}`),
    ...convert(administration.data, "administration", () => "/app/administratie"),
    ...convert(meetings.data, "meeting", (id) => `/app/vergaderingen/${id}`, "minutes_url"),
    ...convert(launches.data, "launch", (id) => `/app/shop/lanceringen/${id}`),
  ];
  const dossierCoverage = driveCoverage(allDossiers);

  return (
    <AppShell active="Documenten & Drive">
      <header className="topbar module-top">
        <div><p>GOOGLE WORKSPACE</p><h1>Documentregister</h1></div>
        <a className="primary" href="https://drive.google.com/drive/shared-drives" target="_blank" rel="noreferrer"><Cloud size={16}/>Open Google Drive</a>
      </header>
      <div className="module-body">
        <p className="lead">Notulen, eventdossiers en sponsorrapporten centraal opgevolgd. Bestanden blijven in Google Drive; Supabase bewaart alleen links en metadata.</p>
        {query.succes === "goedkeuring-aangevraagd" && <div className="success">Het document is ter goedkeuring voorgelegd.</div>}
        {query.fout && <div className="error-note">De goedkeuringsactie is mislukt ({query.fout}).</div>}
        <section className="drive-principle">
          <Cloud size={20}/>
          <div><strong>Google Drive blijft de documentbron</strong><span>Een ontbrekend document is een verwachte output waarvoor nog geen Google-document geregistreerd is.</span></div>
        </section>
        <section className="drive-stats">
          <article><FileText/><div><span>Verwachte documenten</span><strong>{generatedDocuments.length}</strong></div></article>
          <article className="linked"><CheckCircle2/><div><span>Beschikbaar</span><strong>{availableCount}</strong></div></article>
          <article className={missingCount ? "missing" : "linked"}><TriangleAlert/><div><span>Ontbrekend</span><strong>{missingCount}</strong></div></article>
          <article><FolderOpen/><div><span>Dekking</span><strong>{documentCoverage}%</strong></div></article>
        </section>
        <form className="drive-filters">
          <label className="drive-search"><Search size={15}/><input name="zoeken" defaultValue={search} placeholder="Zoek document of dossier…"/></label>
          <label>Module<select name="module" defaultValue={moduleFilter}><option value="all">Alle modules</option>{Object.entries(documentModuleLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label>Documenttype<select name="type" defaultValue={typeFilter}><option value="all">Alle types</option>{Object.entries(generatedDocumentTypeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label>Status<select name="status" defaultValue={statusFilter}><option value="all">Alle statussen</option><option value="available">Beschikbaar</option><option value="missing">Ontbrekend</option></select></label>
          <button>Filter</button>
          {(search || moduleFilter !== "all" || typeFilter !== "all" || statusFilter !== "all") && <Link href="/app/documenten">Wissen</Link>}
        </form>
        <section className="drive-register document-register">
          <div className="drive-register-head"><span>Document</span><span>Module / type</span><span>Status</span><span>Actie</span></div>
          {visibleDocuments.map((document) => (
            <article key={document.id}>
              <div><FileText size={16}/><Link href={document.sourceHref}><strong>{document.title}</strong><small>Bronstatus: {document.sourceStatus} · bijgewerkt {new Intl.DateTimeFormat("nl-BE", { dateStyle: "medium" }).format(new Date(document.updatedAt))}</small></Link></div>
              <span className={`drive-source source-${document.module === "meetings" ? "meeting" : document.module === "events" ? "event" : "sponsor"}`}>{document.moduleLabel} · {document.documentTypeLabel}</span>
              <span className={`document-status ${document.status}`}>{document.status === "available" ? "Beschikbaar" : "Ontbreekt"}</span>
              {document.driveUrl
                ? <div className="document-actions"><a className="drive-open" href={document.driveUrl} target="_blank" rel="noreferrer">Open document <ExternalLink size={13}/></a>
                    {document.documentLinkId && documentApprovalMap.get(document.documentLinkId) === "pending"
                      ? <Link href="/app/goedkeuringen">Wacht op goedkeuring</Link>
                      : document.documentLinkId && <form action={submitForApproval}>
                          <input type="hidden" name="entity_type" value="document"/>
                          <input type="hidden" name="entity_id" value={document.documentLinkId}/>
                          <input type="hidden" name="source_href" value="/app/documenten"/>
                          <button>Ter goedkeuring</button>
                        </form>}
                    {document.documentLinkId && documentApprovalMap.get(document.documentLinkId) && documentApprovalMap.get(document.documentLinkId) !== "pending" &&
                      <small>{approvalStatusLabels[documentApprovalMap.get(document.documentLinkId)!]}</small>}
                  </div>
                : <Link className="drive-missing" href={document.sourceHref}>Document genereren</Link>}
            </article>
          ))}
          {!visibleDocuments.length && <div className="empty">Geen documenten gevonden voor deze selectie.</div>}
        </section>
        <details className="drive-dossier-summary">
          <summary>Drive-dossierkoppelingen bekijken <span>{dossierCoverage.linked}/{dossierCoverage.total} gekoppeld</span></summary>
          <div className="drive-dossier-grid">
            {allDossiers.map((dossier) => (
              <article key={dossier.id}>
                <div><strong>{dossier.title}</strong><span>{driveSourceLabels[dossier.source]} · {dossier.status}</span></div>
                {dossier.driveUrl
                  ? <a href={dossier.driveUrl} target="_blank" rel="noreferrer">Open <ExternalLink size={12}/></a>
                  : <Link href={dossier.sourceHref}>Koppelen</Link>}
              </article>
            ))}
          </div>
        </details>
      </div>
    </AppShell>
  );
}
