import Link from "next/link";
import {
  CheckCircle2,
  Cloud,
  ExternalLink,
  FileText,
  FolderOpen,
  Link2Off,
  Search,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { requireActiveMembership } from "@/lib/auth-context";
import {
  driveCoverage,
  driveSourceLabels,
  filterDriveDocuments,
  makeDriveDocument,
  type DriveDocument,
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

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams;
  const { supabase, membership } = await requireActiveMembership();
  const organizationId = membership.organization_id;
  const source = query.bron && query.bron in driveSourceLabels ? query.bron : "all";
  const linkState = query.koppeling === "ontbreekt" ? "missing" : query.koppeling === "gekoppeld" ? "linked" : "all";
  const search = query.zoeken ?? "";

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
  ]);

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

  const allDocuments: DriveDocument[] = [
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
  const coverage = driveCoverage(allDocuments);
  const documents = filterDriveDocuments(allDocuments, search, source, linkState);

  return (
    <AppShell active="Documenten & Drive">
      <header className="topbar module-top">
        <div><p>GOOGLE WORKSPACE</p><h1>Documenten & Drive</h1></div>
        <a className="primary" href="https://drive.google.com/drive/shared-drives" target="_blank" rel="noreferrer"><Cloud size={16}/>Open Google Drive</a>
      </header>
      <div className="module-body">
        <p className="lead">Het Command Center bewaart context en links; Google Drive blijft de centrale opslagplaats voor bestanden.</p>
        <section className="drive-principle">
          <Cloud size={20}/>
          <div><strong>Eén bron voor documenten</strong><span>Bestanden worden niet gedupliceerd in Supabase. Alleen de koppeling met het juiste BESC-dossier wordt hier beheerd.</span></div>
        </section>
        <section className="drive-stats">
          <article><FolderOpen/><div><span>Dossiers</span><strong>{coverage.total}</strong></div></article>
          <article className="linked"><CheckCircle2/><div><span>Drive gekoppeld</span><strong>{coverage.linked}</strong></div></article>
          <article className={coverage.missing ? "missing" : "linked"}><Link2Off/><div><span>Link ontbreekt</span><strong>{coverage.missing}</strong></div></article>
          <article><FileText/><div><span>Dekking</span><strong>{coverage.percentage}%</strong></div></article>
        </section>
        <form className="drive-filters">
          <label className="drive-search"><Search size={15}/><input name="zoeken" defaultValue={search} placeholder="Zoek dossier, bron of status…"/></label>
          <label>Bron<select name="bron" defaultValue={source}><option value="all">Alle bronnen</option>{Object.entries(driveSourceLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label>Koppeling<select name="koppeling" defaultValue={linkState === "linked" ? "gekoppeld" : linkState === "missing" ? "ontbreekt" : "all"}><option value="all">Alle dossiers</option><option value="gekoppeld">Drive gekoppeld</option><option value="ontbreekt">Link ontbreekt</option></select></label>
          <button>Filter</button>
          {(search || source !== "all" || linkState !== "all") && <Link href="/app/documenten">Wissen</Link>}
        </form>
        <section className="drive-register">
          <div className="drive-register-head"><span>Dossier</span><span>Bron</span><span>Status</span><span>Document</span></div>
          {documents.map((document) => (
            <article key={document.id}>
              <div><FileText size={16}/><Link href={document.sourceHref}><strong>{document.title}</strong><small>Bijgewerkt {new Intl.DateTimeFormat("nl-BE", { dateStyle: "medium" }).format(new Date(document.updatedAt))}</small></Link></div>
              <span className={`drive-source source-${document.source}`}>{document.sourceLabel}</span>
              <span className="drive-status">{document.status}</span>
              {document.driveUrl
                ? <a className="drive-open" href={document.driveUrl} target="_blank" rel="noreferrer">Open Drive <ExternalLink size={13}/></a>
                : <Link className="drive-missing" href={document.sourceHref}>Koppeling toevoegen</Link>}
            </article>
          ))}
          {!documents.length && <div className="empty">Geen dossiers gevonden voor deze selectie.</div>}
        </section>
      </div>
    </AppShell>
  );
}
