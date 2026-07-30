import Link from "next/link";
import { Clapperboard, Search, X } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ContentForm } from "@/components/content-form";
import { FormModal } from "@/components/form-modal";
import { SavedViews } from "@/components/saved-views";
import { requireActiveMembership } from "@/lib/auth-context";
import { hasPermission } from "@/lib/permissions";
import { createContent } from "./actions";
import { contentStatuses, contentTypes } from "./constants";

const PAGE_SIZE = 25;

type Row = {
  id: string;
  title: string;
  content_type: string;
  status: string;
  primary_channel: string | null;
  deadline: string | null;
  publication_at: string | null;
  projects: { title: string } | null;
};

export default async function ContentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const search = params.zoek?.trim().slice(0, 100) ?? "";
  const status = Object.hasOwn(contentStatuses, params.status ?? "") ? params.status! : "";
  const type = Object.hasOwn(contentTypes, params.type ?? "") ? params.type! : "";
  const mine = params.van_mij === "1";
  const sort = ["newest", "oldest", "title", "publication"].includes(params.sorteren ?? "")
    ? params.sorteren!
    : "newest";
  const page = Math.max(1, Number.parseInt(params.pagina ?? "1", 10) || 1);
  const { supabase, membership, user } = await requireActiveMembership();
  const canManage = hasPermission(membership, "manageContent");
  const orderColumn =
    sort === "title" ? "title" : sort === "publication" ? "publication_at" : "created_at";
  const ascending = sort === "oldest" || sort === "title" || sort === "publication";

  let query = supabase
    .from("content_items")
    .select(
      "id,title,content_type,status,primary_channel,deadline,publication_at,projects(title)",
      { count: "exact" },
    )
    .eq("organization_id", membership.organization_id)
    .is("deleted_at", null)
    .order(orderColumn, { ascending, nullsFirst: false });
  if (search) query = query.ilike("title", `%${search}%`);
  if (status) query = query.eq("status", status);
  if (type) query = query.eq("content_type", type);
  if (mine) query = query.eq("owner_id", user.id);

  const from = (page - 1) * PAGE_SIZE;
  const [{ data, count }, { data: allRows }, { data: projects }] = await Promise.all([
    query.range(from, from + PAGE_SIZE - 1),
    supabase
      .from("content_items")
      .select("status")
      .eq("organization_id", membership.organization_id)
      .is("deleted_at", null),
    supabase
      .from("projects")
      .select("id,title")
      .eq("organization_id", membership.organization_id)
      .is("deleted_at", null)
      .order("title"),
  ]);
  const rows = (data ?? []) as unknown as Row[];
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const counts = {
    total: allRows?.length ?? 0,
    concept: (allRows ?? []).filter((item) => ["idea", "research", "draft"].includes(item.status))
      .length,
    productie: (allRows ?? []).filter((item) =>
      ["production", "review", "approved"].includes(item.status),
    ).length,
    gepland: (allRows ?? []).filter((item) => item.status === "scheduled").length,
    gepubliceerd: (allRows ?? []).filter((item) => item.status === "published").length,
  };

  function pageUrl(nextPage: number) {
    const next = new URLSearchParams();
    if (search) next.set("zoek", search);
    if (status) next.set("status", status);
    if (type) next.set("type", type);
    if (mine) next.set("van_mij", "1");
    if (sort) next.set("sorteren", sort);
    next.set("pagina", String(nextPage));
    return `?${next.toString()}`;
  }

  return (
    <AppShell active="Content">
      <header className="topbar module-top">
        <div>
          <p>CREATIE & PLANNING</p>
          <h1>Content Studio</h1>
        </div>
        {canManage && (
          <Link className="primary" href="?nieuw=1">
            Nieuwe content
          </Link>
        )}
      </header>
      <div className="module-body">
        <p className="lead">
          Van eerste idee tot publicatie: beheer content, kanalen, assets, goedkeuring en
          planning op één plek.
        </p>
        <section className="history-stats">
          <article><span>Totaal</span><strong>{counts.total}</strong></article>
          <article><span>Concept</span><strong>{counts.concept}</strong></article>
          <article><span>Productie</span><strong>{counts.productie}</strong></article>
          <article><span>Gepland</span><strong>{counts.gepland}</strong></article>
          <article><span>Gepubliceerd</span><strong>{counts.gepubliceerd}</strong></article>
        </section>
        {params.fout && (
          <div className="error-note">Content kon niet worden opgeslagen ({params.fout}).</div>
        )}
        {params.nieuw && canManage && (
          <FormModal title="Nieuw contentitem">
            <ContentForm action={createContent} projects={projects ?? []} />
          </FormModal>
        )}
        <form className="history-filters extended-filters" method="get">
          <label className="search">
            <Search size={16} />
            <span className="sr-only">Zoeken</span>
            <input name="zoek" defaultValue={search} placeholder="Zoeken in content..." />
          </label>
          <select name="status" defaultValue={status} aria-label="Status">
            <option value="">Alle statussen</option>
            {Object.entries(contentStatuses).map(([value, label]) => (
              <option value={value} key={value}>{label}</option>
            ))}
          </select>
          <select name="type" defaultValue={type} aria-label="Contenttype">
            <option value="">Alle types</option>
            {Object.entries(contentTypes).map(([value, label]) => (
              <option value={value} key={value}>{label}</option>
            ))}
          </select>
          <select name="sorteren" defaultValue={sort} aria-label="Sortering">
            <option value="newest">Nieuwste eerst</option>
            <option value="oldest">Oudste eerst</option>
            <option value="title">Titel A–Z</option>
            <option value="publication">Eerstvolgende publicatie</option>
          </select>
          <label className={`mine-filter ${mine ? "active" : ""}`}>
            <input type="checkbox" name="van_mij" value="1" defaultChecked={mine} />
            Mijn items
          </label>
          <button>Filteren</button>
          {(search || status || type || mine || params.sorteren) && (
            <Link href="/app/content" className="filter-reset">
              <X size={14} />Wissen
            </Link>
          )}
          <span className="filter-count">
            {total} {total === 1 ? "resultaat" : "resultaten"}
          </span>
        </form>
        <SavedViews module="content" path="/app/content" currentQuery={pageUrl(1).slice(1)} />
        <div className="content-list">
          {rows.map((row) => (
            <article key={row.id}>
              <div className="content-icon"><Clapperboard size={17} /></div>
              <div>
                <strong>{row.title}</strong>
                <p>
                  {contentTypes[row.content_type as keyof typeof contentTypes] ?? row.content_type}
                  {" · "}
                  {row.projects?.title ?? "Geen project"}
                </p>
              </div>
              <span className="badge">{row.primary_channel ?? "Geen kanaal"}</span>
              <span className="content-date">
                {row.publication_at?.slice(0, 10) ?? row.deadline ?? "Niet gepland"}
              </span>
              <span className="badge purple">
                {contentStatuses[row.status as keyof typeof contentStatuses] ?? row.status}
              </span>
              <Link className="row-action" href={`/app/content/${row.id}`}>Openen</Link>
            </article>
          ))}
          {rows.length === 0 && <div className="empty">Geen content gevonden voor deze filters.</div>}
        </div>
        <nav className="pagination" aria-label="Paginering">
          <span>Pagina {Math.min(page, pages)} van {pages}</span>
          <div>
            {page > 1 && <Link href={pageUrl(page - 1)}>Vorige</Link>}
            {page < pages && <Link href={pageUrl(page + 1)}>Volgende</Link>}
          </div>
        </nav>
      </div>
    </AppShell>
  );
}
