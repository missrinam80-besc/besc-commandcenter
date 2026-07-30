import Link from "next/link";
import { CalendarDays, Search, X } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { EventForm, eventStatuses, eventTypes } from "@/components/event-form";
import { FormModal } from "@/components/form-modal";
import { SavedViews } from "@/components/saved-views";
import { requireActiveMembership } from "@/lib/auth-context";
import { hasPermission } from "@/lib/permissions";
import { saveEvent } from "./actions";

const PAGE_SIZE = 25;

type Row = {
  id: string;
  title: string;
  event_type: string;
  status: string;
  start_at: string | null;
  location: string | null;
  is_online: boolean;
  projects: { title: string } | null;
};

export default async function Events({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const search = params.zoek?.trim().slice(0, 100) ?? "";
  const status = Object.hasOwn(eventStatuses, params.status ?? "") ? params.status! : "";
  const type = Object.hasOwn(eventTypes, params.type ?? "") ? params.type! : "";
  const mine = params.van_mij === "1";
  const sort = ["date", "newest", "oldest", "title"].includes(params.sorteren ?? "")
    ? params.sorteren!
    : "date";
  const page = Math.max(1, Number.parseInt(params.pagina ?? "1", 10) || 1);
  const { supabase, membership, user } = await requireActiveMembership();
  const canManage = hasPermission(membership, "manageEvents");
  const orderColumn = sort === "title" ? "title" : sort === "date" ? "start_at" : "created_at";
  const ascending = sort === "date" || sort === "oldest" || sort === "title";

  let query = supabase
    .from("events")
    .select("id,title,event_type,status,start_at,location,is_online,projects(title)", {
      count: "exact",
    })
    .eq("organization_id", membership.organization_id)
    .is("deleted_at", null)
    .order(orderColumn, { ascending, nullsFirst: false });
  if (search) query = query.ilike("title", `%${search}%`);
  if (status) query = query.eq("status", status);
  if (type) query = query.eq("event_type", type);
  if (mine) query = query.eq("owner_id", user.id);

  const from = (page - 1) * PAGE_SIZE;
  const [{ data, count }, { data: projects }] = await Promise.all([
    query.range(from, from + PAGE_SIZE - 1),
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
    <AppShell active="Events">
      <header className="topbar module-top">
        <div><p>PLANNING & PRODUCTIE</p><h1>Events</h1></div>
        {canManage && <Link className="primary" href="?nieuw=1">Nieuw event</Link>}
      </header>
      <div className="module-body">
        <p className="lead">
          Beheer community-events, workshops, streams en externe deelnames in één dossier.
        </p>
        {params.fout && <div className="error-note">Event kon niet worden opgeslagen.</div>}
        {params.nieuw && canManage && (
          <FormModal title="Nieuw event">
            <EventForm action={saveEvent} projects={projects ?? []} />
          </FormModal>
        )}
        <form className="history-filters extended-filters" method="get">
          <label className="search">
            <Search size={16} /><span className="sr-only">Zoeken</span>
            <input name="zoek" defaultValue={search} placeholder="Zoeken in events..." />
          </label>
          <select name="status" defaultValue={status} aria-label="Status">
            <option value="">Alle statussen</option>
            {Object.entries(eventStatuses).map(([value, label]) => (
              <option value={value} key={value}>{label}</option>
            ))}
          </select>
          <select name="type" defaultValue={type} aria-label="Eventtype">
            <option value="">Alle types</option>
            {Object.entries(eventTypes).map(([value, label]) => (
              <option value={value} key={value}>{label}</option>
            ))}
          </select>
          <select name="sorteren" defaultValue={sort} aria-label="Sortering">
            <option value="date">Eerstvolgende datum</option>
            <option value="newest">Nieuwste eerst</option>
            <option value="oldest">Oudste eerst</option>
            <option value="title">Titel A–Z</option>
          </select>
          <label className={`mine-filter ${mine ? "active" : ""}`}>
            <input type="checkbox" name="van_mij" value="1" defaultChecked={mine} />
            Mijn items
          </label>
          <button>Filteren</button>
          {(search || status || type || mine || params.sorteren) && (
            <Link href="/app/events" className="filter-reset"><X size={14} />Wissen</Link>
          )}
          <span className="filter-count">
            {total} {total === 1 ? "resultaat" : "resultaten"}
          </span>
        </form>
        <SavedViews module="events" path="/app/events" currentQuery={pageUrl(1).slice(1)} />
        <div className="content-list">
          {rows.map((event) => (
            <article key={event.id}>
              <div className="content-icon"><CalendarDays size={17} /></div>
              <div>
                <strong>{event.title}</strong>
                <p>
                  {eventTypes[event.event_type as keyof typeof eventTypes]}
                  {" · "}
                  {event.projects?.title ?? (event.is_online ? "Online" : event.location ?? "Locatie onbekend")}
                </p>
              </div>
              <span className="badge">
                {eventStatuses[event.status as keyof typeof eventStatuses]}
              </span>
              <span className="content-date">
                {event.start_at
                  ? new Intl.DateTimeFormat("nl-BE", { dateStyle: "medium" }).format(
                      new Date(event.start_at),
                    )
                  : "Niet gepland"}
              </span>
              <span />
              <Link className="row-action" href={`/app/events/${event.id}`}>Openen</Link>
            </article>
          ))}
          {!rows.length && <div className="empty">Geen events gevonden voor deze filters.</div>}
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
