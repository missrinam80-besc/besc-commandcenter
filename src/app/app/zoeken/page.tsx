import Link from "next/link";
import { ArrowRight, Search, SearchX } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { requireActiveMembership } from "@/lib/auth-context";
import {
  groupSearchResults,
  rankSearchResults,
  searchPattern,
  searchSourceLabels,
  type SearchResult,
} from "@/lib/global-search";

type SearchRow = {
  id: string;
  title?: string;
  name?: string;
  display_name?: string;
  status?: string;
  lifecycle?: string;
  updated_at?: string;
  created_at?: string;
  summary?: string | null;
  description?: string | null;
  notes?: string | null;
  copy?: string | null;
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const query = (params.zoeken ?? "").trim();
  const selectedSource = params.bron && params.bron in searchSourceLabels ? params.bron : "all";
  const { supabase, membership } = await requireActiveMembership();
  const organizationId = membership.organization_id;
  const manager = ["admin", "board"].includes(membership.role);
  let results: SearchResult[] = [];

  if (query.length >= 2) {
    const pattern = searchPattern(query);
    const [
      tasks, projects, inbox, content, social, events, sponsors, campaigns,
      community, knowledge, meetings, administration, products, launches, history,
    ] = await Promise.all([
      supabase.from("tasks").select("id,title,status,updated_at,description").eq("organization_id", organizationId).is("deleted_at", null).ilike("title", pattern).limit(12),
      supabase.from("projects").select("id,title,status,updated_at,description").eq("organization_id", organizationId).is("deleted_at", null).ilike("title", pattern).limit(12),
      manager ? supabase.from("inbox_items").select("id,title,status,updated_at,description").eq("organization_id", organizationId).is("deleted_at", null).not("status", "in", "(processed,archived)").ilike("title", pattern).limit(12) : Promise.resolve({ data: [] }),
      supabase.from("content_items").select("id,title,status,updated_at,description").eq("organization_id", organizationId).is("deleted_at", null).ilike("title", pattern).limit(12),
      supabase.from("social_posts").select("id,title,status,updated_at,copy").eq("organization_id", organizationId).is("deleted_at", null).ilike("title", pattern).limit(12),
      supabase.from("events").select("id,title,status,updated_at,description").eq("organization_id", organizationId).is("deleted_at", null).ilike("title", pattern).limit(12),
      supabase.from("partners").select("id,name,status,updated_at,notes").eq("organization_id", organizationId).is("deleted_at", null).ilike("name", pattern).limit(12),
      supabase.from("campaigns").select("id,title,status,updated_at,notes").eq("organization_id", organizationId).is("deleted_at", null).ilike("title", pattern).limit(12),
      supabase.from("community_people").select("id,display_name,status,updated_at,notes").eq("organization_id", organizationId).is("deleted_at", null).ilike("display_name", pattern).limit(12),
      supabase.from("knowledge_articles").select("id,title,status,updated_at,summary").eq("organization_id", organizationId).is("deleted_at", null).ilike("title", pattern).limit(12),
      supabase.from("meetings").select("id,title,status,updated_at,notes").eq("organization_id", organizationId).is("deleted_at", null).ilike("title", pattern).limit(12),
      manager ? supabase.from("administrative_documents").select("id,title,status,updated_at,notes").eq("organization_id", organizationId).is("deleted_at", null).ilike("title", pattern).limit(12) : Promise.resolve({ data: [] }),
      supabase.from("shop_products").select("id,name,status,updated_at,description").eq("organization_id", organizationId).is("deleted_at", null).ilike("name", pattern).limit(12),
      supabase.from("merch_launches").select("id,title,status,updated_at,description").eq("organization_id", organizationId).is("deleted_at", null).ilike("title", pattern).limit(12),
      manager ? supabase.from("legacy_records").select("id,title,lifecycle,updated_at").eq("organization_id", organizationId).is("deleted_at", null).ilike("title", pattern).limit(12) : Promise.resolve({ data: [] }),
    ]);

    function add(rows: SearchRow[] | null, source: string, href: (id: string) => string) {
      for (const row of rows ?? []) {
        results.push({
          id: `${source}-${row.id}`,
          title: row.title ?? row.name ?? row.display_name ?? "Naamloos item",
          source,
          sourceLabel: searchSourceLabels[source] ?? "Overige",
          href: href(row.id),
          status: row.status ?? row.lifecycle ?? "onbekend",
          updatedAt: row.updated_at ?? row.created_at ?? "",
          description: row.summary ?? row.description ?? row.notes ?? row.copy ?? undefined,
        });
      }
    }

    add(tasks.data, "task", (id) => `/app/taken/${id}`);
    add(projects.data, "project", (id) => `/app/projecten/${id}`);
    add(inbox.data, "inbox", () => "/app/inbox");
    add(content.data, "content", (id) => `/app/content/${id}`);
    add(social.data, "social", (id) => `/app/social/${id}`);
    add(events.data, "event", (id) => `/app/events/${id}`);
    add(sponsors.data, "sponsor", (id) => `/app/sponsors/${id}`);
    add(campaigns.data, "campaign", (id) => `/app/campagnes/${id}`);
    add(community.data, "community", (id) => `/app/community/${id}`);
    add(knowledge.data, "knowledge", (id) => `/app/kennisbank/${id}`);
    add(meetings.data, "meeting", (id) => `/app/vergaderingen/${id}`);
    add(administration.data, "administration", () => "/app/administratie");
    add(products.data, "shop", (id) => `/app/shop/producten/${id}`);
    add(launches.data, "shop", (id) => `/app/shop/lanceringen/${id}`);
    add(history.data, "history", (id) => `/app/historiek/${id}`);
    results = rankSearchResults(results, query).filter((result) => selectedSource === "all" || result.source === selectedSource);
  }

  const grouped = groupSearchResults(results);
  const availableSources = Object.keys(grouped);

  return (
    <AppShell active="Zoeken">
      <header className="topbar module-top"><div><p>SNEL VINDEN</p><h1>Zoeken</h1></div></header>
      <div className="module-body global-search-page">
        <form className="global-search-form">
          <Search size={20}/>
          <input name="zoeken" minLength={2} required autoFocus defaultValue={query} placeholder="Zoek in heel BESC…"/>
          {selectedSource !== "all" && <input type="hidden" name="bron" value={selectedSource}/>}
          <button>Zoeken</button>
        </form>
        {!query && <section className="search-welcome"><Search size={26}/><h2>Wat wil je terugvinden?</h2><p>Zoek door alle BESC-modules waarop je toegang hebt. Gebruik overal <kbd>Ctrl K</kbd> om dit zoekvenster snel te openen.</p></section>}
        {query.length === 1 && <div className="permission-note">Typ minstens twee tekens om te zoeken.</div>}
        {query.length >= 2 && (
          <>
            <div className="search-result-summary"><strong>{results.length} resultaten</strong><span>voor “{query}”</span></div>
            {availableSources.length > 0 && <nav className="search-source-filter"><Link className={selectedSource === "all" ? "active" : ""} href={`/app/zoeken?zoeken=${encodeURIComponent(query)}`}>Alles</Link>{availableSources.map((source) => <Link className={selectedSource === source ? "active" : ""} href={`/app/zoeken?zoeken=${encodeURIComponent(query)}&bron=${source}`} key={source}>{searchSourceLabels[source]} <b>{grouped[source].length}</b></Link>)}</nav>}
            <section className="search-results">
              {Object.entries(grouped).map(([source, items]) => (
                <div className="search-result-group" key={source}>
                  <div className="search-group-heading"><span>{searchSourceLabels[source]}</span><b>{items.length}</b></div>
                  {items.map((item) => <Link href={item.href} key={item.id}><div><strong>{item.title}</strong>{item.description && <p>{item.description}</p>}<span>{item.status} · bijgewerkt {item.updatedAt ? new Intl.DateTimeFormat("nl-BE", { dateStyle: "medium" }).format(new Date(item.updatedAt)) : "onbekend"}</span></div><ArrowRight size={15}/></Link>)}
                </div>
              ))}
            </section>
            {!results.length && <section className="search-empty"><SearchX size={25}/><h2>Geen resultaten</h2><p>Probeer een kortere zoekterm of zoek zonder modulefilter.</p>{selectedSource !== "all" && <Link href={`/app/zoeken?zoeken=${encodeURIComponent(query)}`}>Zoek in alle modules</Link>}</section>}
          </>
        )}
      </div>
    </AppShell>
  );
}
