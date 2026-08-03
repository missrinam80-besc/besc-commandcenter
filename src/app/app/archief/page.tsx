import Link from "next/link";
import { Archive, Search } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { requirePermission } from "@/lib/auth-context";
import { formatDateTime } from "@/lib/format";

type ArchiveRow = {
  id: string;
  title: string;
  module: string;
  moduleLabel: string;
  href: string;
  status: string;
  ownerId: string | null;
  updatedAt: string;
  deletedAt: string | null;
};

const moduleLabels: Record<string, string> = {
  projects: "Projecten", events: "Events", content: "Content", partners: "Sponsors & CRM",
  campaigns: "Campagnes", community: "Community", social: "Social planning",
  meetings: "Vergaderingen", knowledge: "Kennisbank",
};

function normalized(rows: Record<string, unknown>[] | null, config: {
  module: string; title: string; route: string; owner?: string;
}): ArchiveRow[] {
  return (rows ?? []).map((row) => ({
    id: String(row.id),
    title: String(row[config.title] ?? "Naamloos dossier"),
    module: config.module,
    moduleLabel: moduleLabels[config.module],
    href: `${config.route}/${row.id}`,
    status: String(row.status),
    ownerId: config.owner ? String(row[config.owner] ?? "") || null : null,
    updatedAt: String(row.updated_at),
    deletedAt: row.deleted_at ? String(row.deleted_at) : null,
  }));
}

export default async function ArchivePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const query = await searchParams;
  const { supabase, membership } = await requirePermission("manageOrganization", "/app?fout=geen-toegang");
  const organizationId = membership.organization_id;
  const [projects, events, content, partners, campaigns, community, social, meetings, knowledge, members] = await Promise.all([
    supabase.from("projects").select("id,title,status,owner_id,updated_at,deleted_at").eq("organization_id", organizationId).or("status.eq.archived,deleted_at.not.is.null"),
    supabase.from("events").select("id,title,status,owner_id,updated_at,deleted_at").eq("organization_id", organizationId).or("status.eq.archived,deleted_at.not.is.null"),
    supabase.from("content_items").select("id,title,status,owner_id,updated_at,deleted_at").eq("organization_id", organizationId).or("status.eq.archived,deleted_at.not.is.null"),
    supabase.from("partners").select("id,name,status,owner_id,updated_at,deleted_at").eq("organization_id", organizationId).or("status.eq.archived,deleted_at.not.is.null"),
    supabase.from("campaigns").select("id,title,status,owner_id,updated_at,deleted_at").eq("organization_id", organizationId).or("status.eq.archived,deleted_at.not.is.null"),
    supabase.from("community_people").select("id,display_name,status,owner_id,updated_at,deleted_at").eq("organization_id", organizationId).or("status.eq.archived,deleted_at.not.is.null"),
    supabase.from("social_posts").select("id,title,status,owner_id,updated_at,deleted_at").eq("organization_id", organizationId).or("status.eq.archived,deleted_at.not.is.null"),
    supabase.from("meetings").select("id,title,status,created_by,updated_at,deleted_at").eq("organization_id", organizationId).or("status.eq.archived,deleted_at.not.is.null"),
    supabase.from("knowledge_articles").select("id,title,status,owner_id,updated_at,deleted_at").eq("organization_id", organizationId).or("status.eq.archived,deleted_at.not.is.null"),
    supabase.from("organization_members").select("user_id,profiles(display_name)").eq("organization_id", organizationId).eq("status", "active"),
  ]);
  const all = [
    ...normalized(projects.data, { module: "projects", title: "title", route: "/app/projecten", owner: "owner_id" }),
    ...normalized(events.data, { module: "events", title: "title", route: "/app/events", owner: "owner_id" }),
    ...normalized(content.data, { module: "content", title: "title", route: "/app/content", owner: "owner_id" }),
    ...normalized(partners.data, { module: "partners", title: "name", route: "/app/sponsors", owner: "owner_id" }),
    ...normalized(campaigns.data, { module: "campaigns", title: "title", route: "/app/campagnes", owner: "owner_id" }),
    ...normalized(community.data, { module: "community", title: "display_name", route: "/app/community", owner: "owner_id" }),
    ...normalized(social.data, { module: "social", title: "title", route: "/app/social", owner: "owner_id" }),
    ...normalized(meetings.data, { module: "meetings", title: "title", route: "/app/vergaderingen", owner: "created_by" }),
    ...normalized(knowledge.data, { module: "knowledge", title: "title", route: "/app/kennisbank", owner: "owner_id" }),
  ];
  const people = new Map((members.data ?? []).map((member) => [member.user_id, (member.profiles as { display_name?: string } | null)?.display_name ?? "Naamloos account"]));
  const needle = (query.zoeken ?? "").trim().toLocaleLowerCase("nl-BE");
  const visible = all.filter((item) => !needle || `${item.title} ${item.moduleLabel}`.toLocaleLowerCase("nl-BE").includes(needle))
    .filter((item) => !query.module || query.module === "all" || item.module === query.module)
    .filter((item) => !query.status || query.status === "all" || (query.status === "deleted" ? item.deletedAt : !item.deletedAt))
    .filter((item) => !query.owner || query.owner === "all" || item.ownerId === query.owner)
    .filter((item) => !query.vanaf || item.updatedAt.slice(0, 10) >= query.vanaf)
    .filter((item) => !query.tot || item.updatedAt.slice(0, 10) <= query.tot)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  return <AppShell active="Archief">
    <header className="topbar module-top"><div><p>BEHEER</p><h1>Centraal archief</h1></div><span className="badge">{visible.length} dossiers</span></header>
    <div className="module-body">
      <p className="lead">Gearchiveerde en soft-verwijderde dossiers uit alle kernmodules. Verwijderde dossiers blijven alleen als historisch spoor zichtbaar.</p>
      <form className="drive-filters">
        <label className="drive-search"><Search size={15}/><input name="zoeken" defaultValue={query.zoeken} placeholder="Zoek dossier…"/></label>
        <label>Module<select name="module" defaultValue={query.module ?? "all"}><option value="all">Alle modules</option>{Object.entries(moduleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Status<select name="status" defaultValue={query.status ?? "all"}><option value="all">Alles</option><option value="archived">Gearchiveerd</option><option value="deleted">Soft-verwijderd</option></select></label>
        <label>Eigenaar<select name="owner" defaultValue={query.owner ?? "all"}><option value="all">Alle eigenaars</option>{[...people.entries()].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <label>Vanaf<input type="date" name="vanaf" defaultValue={query.vanaf}/></label><label>Tot<input type="date" name="tot" defaultValue={query.tot}/></label><button>Filter</button>
      </form>
      <section className="archive-register">
        {visible.map((item) => <article key={`${item.module}:${item.id}`}><Archive size={17}/><div>{item.deletedAt ? <strong>{item.title}</strong> : <Link href={item.href}><strong>{item.title}</strong></Link>}<span>{item.moduleLabel} · {people.get(item.ownerId ?? "") ?? "Geen eigenaar"}</span></div><span className={`document-status ${item.deletedAt ? "missing" : "available"}`}>{item.deletedAt ? "Soft-verwijderd" : "Gearchiveerd"}</span><time>{formatDateTime(item.updatedAt)}</time></article>)}
        {!visible.length ? <div className="empty">Geen archiefitems voor deze filters.</div> : null}
      </section>
    </div>
  </AppShell>;
}
