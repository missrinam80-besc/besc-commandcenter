import { dossierEditorGate } from "@/components/dossier-editor-gate";
import Link from "next/link";
import { partnerRoleLabels } from "@/lib/f1-workflows";
import { CalendarDays, List, Search, X } from "lucide-react";
import { operationalModules, type OperationalModule, } from "@/app/app/operations/config";
import { AppShell } from "@/components/app-shell";
import { SavedViews } from "@/components/saved-views";
import { requireActiveMembership } from "@/lib/auth-context";
import { hasPermission } from "@/lib/permissions";
import { formatDateTime } from "@/lib/format";

const PAGE_SIZE = 25;

type Row = {
  id: string;
  status: string;
  notes: string | null;
  copy?: string | null;
  social_post_variants?: { id: string; platform: string }[];
  [key: string]: unknown;
};

function channelLabel(row: Row) {
  const variants = row.social_post_variants ?? [];
  return variants.length
    ? `${variants.length} kanalen`
    : String(row.platform ?? "Nog geen kanalen");
}

function secondaryValue(module: OperationalModule, row: Row) {
  if (module === "sponsors") {
    return String(row.contact_name ?? row.email ?? "Geen contactpersoon");
  }
  if (module === "campagnes") {
    return row.end_date ? `Eindigt ${String(row.end_date).slice(0, 10)}` : "Geen einddatum";
  }
  if (module === "community") {
    return String(row.discord_handle ?? row.handle ?? "Geen Discord/handle");
  }
  return `${channelLabel(row)} · ${
    row.scheduled_at
      ? formatDateTime(String(row.scheduled_at))
      : "Niet gepland"
  }`;
}

export async function OperationalModulePage({
  module,
  searchParams,
}: {
  module: OperationalModule;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const unifiedEditor = await dossierEditorGate({module,query:params});
  if (unifiedEditor) return unifiedEditor;

  const config = operationalModules[module];
  const search = params.zoek?.trim().slice(0, 100) ?? "";
  const status = Object.hasOwn(config.statuses, params.status ?? "") ? params.status! : "";
  const type = Object.hasOwn(config.types, params.type ?? "") ? params.type! : "";
  const mine = params.van_mij === "1";
  const openOnly = params.weergave === "open";
  const sort = ["newest", "oldest", "title", "date"].includes(params.sorteren ?? "")
    ? params.sorteren!
    : module === "social"
      ? "date"
      : "newest";
  const page = Math.max(1, Number.parseInt(params.pagina ?? "1", 10) || 1);
  const { supabase, membership, user } = await requireActiveMembership();
  const canManage = hasPermission(membership, "manageOrganization");
  const org = membership.organization_id;
  const partnerRole=module==='sponsors'&&Object.hasOwn(partnerRoleLabels,params.rol??'')?params.rol!:'';
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Brussels',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const columns = module === "social" ? "*,social_post_variants(id,platform)" : "*";
  const orderColumn =
    sort === "title"
      ? config.titleColumn
      : sort === "date" && config.dateColumn
        ? config.dateColumn
        : "created_at";
  const ascending = sort === "oldest" || sort === "title" || sort === "date";

  let query = supabase
    .from(config.table)
    .select(partnerRole?columns+',partner_roles!inner(role,valid_from,valid_until,revoked_at,organization_id)':columns, { count: "exact" })
    .eq("organization_id", org)
    .is("deleted_at", null)
    .order(orderColumn, { ascending, nullsFirst: false });
  if (search) query = query.ilike(config.titleColumn, `%${search}%`);
  if (status) query = query.eq("status", status);
  if (type) query = query.eq(config.typeColumn, type);
  if(partnerRole)query=query.eq('partner_roles.organization_id',org).eq('partner_roles.role',partnerRole).is('partner_roles.revoked_at',null).lte('partner_roles.valid_from',today).or(`valid_until.is.null,valid_until.gte.${today}`,{referencedTable:'partner_roles'});
  if (mine) query = query.eq("owner_id", user.id);
  if (openOnly) {
    query = query.not(
      "status",
      "in",
      "(completed,published,inactive,rejected,archived,cancelled)",
    );
  }

  const from = (page - 1) * PAGE_SIZE;
  const [rowsResult, allResult] = await Promise.all([
    query.range(from, from + PAGE_SIZE - 1),
    supabase
        .from(config.table)
        .select(module === "community" ? "status,person_type" : "status")
        .eq("organization_id", org)
        .is("deleted_at", null)
  ]);

  const rows = (rowsResult.data ?? []) as unknown as Row[];
  const all = (allResult.data ?? []) as unknown as {status:string;person_type?:string}[];
  const peopleCount = module === "community" ? all.filter(row => row.person_type !== "functional_account").length : 0;
  const functionalCount = module === "community" ? all.length - peopleCount : 0;
  const total = rowsResult.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const active = all.filter(
    (row) =>
      !["completed", "published", "inactive", "rejected", "archived", "cancelled"].includes(
        row.status,
      ),
  ).length;
  const calendar = module === "social" && params.weergave === "kalender";
  const hasFilters = Boolean(search || status || type || mine || openOnly || params.sorteren);

  function queryString(overrides: Record<string, string | null>) {
    const next = new URLSearchParams();
    if (search) next.set("zoek", search);
    if (status) next.set("status", status);
    if (type) next.set("type", type);
    if (mine) next.set("van_mij", "1");
    if (openOnly) next.set("weergave", "open");
    if (sort) next.set("sorteren", sort);
    if (calendar) next.set("weergave", "kalender");
    next.set("pagina", String(page));
    for (const [key, value] of Object.entries(overrides)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    return next.toString();
  }

  return (
    <AppShell active={config.label}>
      <header className="topbar module-top">
        <div>
          <p>{config.eyebrow}</p>
          <h1>{config.label}</h1>
        </div>
        {canManage && (
          <Link className="primary" href="?nieuw=1">
            Nieuwe {config.singular}
          </Link>
        )}
      </header>
      <div className="module-body">
        <p className="lead">
          Centraal beheer, opvolging en historiek voor {config.label.toLowerCase()}.
        </p>
        <section className="history-stats">
          <article>
            <span>{module === "community" ? "Contacten totaal" : "Totaal"}</span>
            <strong>{all.length}</strong>
          </article>
          <article>
            <span>Actief / open</span>
            <strong>{active}</strong>
          </article>
          <article>
            <span>Afgerond / archief</span>
            <strong>{all.length - active}</strong>
          </article>
        </section>
        {module === "community" && <p className="form-help">{peopleCount} personen · {functionalCount} functionele accounts. Functionele accounts tellen niet mee als personen of vrijwilligers.</p>}
        {params.fout && <div className="error-note">{params.fout === "dossier-niet-beschikbaar" ? "Het dossier is niet meer beschikbaar. De link werd niet gewijzigd." : params.fout === "dossier-controleren" ? "Het dossier kon niet worden gecontroleerd. De link werd niet gewijzigd. Probeer opnieuw." : `Opslaan is mislukt (${params.fout}).`}</div>}
        {params.succes && <div className="success">Wijziging opgeslagen.</div>}

        <div className="view-toolbar">
          <form className="history-filters extended-filters" method="get">
            {module==='sponsors'&&<label>Bevestigde rol<select name="rol" defaultValue={partnerRole}><option value="">Alle rollen en historische classificaties</option>{Object.entries(partnerRoleLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>}
            {calendar && <input type="hidden" name="weergave" value="kalender" />}
            {openOnly && <input type="hidden" name="weergave" value="open" />}
            <label className="search">
              <Search size={16} />
              <span className="sr-only">Zoeken</span>
              <input name="zoek" defaultValue={search} placeholder="Zoeken..." />
            </label>
            <label>
              <span className="sr-only">Status</span>
              <select name="status" defaultValue={status}>
                <option value="">Alle statussen</option>
                {Object.entries(config.statuses).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Type</span>
              <select name="type" defaultValue={type}>
                <option value="">Alle types</option>
                {Object.entries(config.types).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Sortering</span>
              <select name="sorteren" defaultValue={sort}>
                <option value="newest">Nieuwste eerst</option>
                <option value="oldest">Oudste eerst</option>
                <option value="title">Naam A–Z</option>
                {config.dateColumn && <option value="date">Eerstvolgende datum</option>}
              </select>
            </label>
            <label className={`mine-filter ${mine ? "active" : ""}`}>
              <input type="checkbox" name="van_mij" value="1" defaultChecked={mine} />
              Mijn items
            </label>
            <button>Filteren</button>
            {hasFilters && (
              <Link href={`/app/${module}`} className="filter-reset">
                <X size={14} />
                Wissen
              </Link>
            )}
            <span className="filter-count">
              {total} {total === 1 ? "resultaat" : "resultaten"}
            </span>
          </form>
          {module === "social" && (
            <div className="view-switch">
              <Link
                className={!calendar ? "active" : ""}
                href={`?${queryString({ weergave: null, pagina: "1" })}`}
              >
                <List size={15} />
                Lijst
              </Link>
              <Link
                className={calendar ? "active" : ""}
                href={`?${queryString({ weergave: "kalender", pagina: "1" })}`}
              >
                <CalendarDays size={15} />
                Kalender
              </Link>
            </div>
          )}
        </div>
        <SavedViews
          module={module}
          path={`/app/${module}`}
          currentQuery={queryString({ pagina: null })}
        />
        {calendar ? (
          <div className="social-calendar">
            {rows
              .filter((row) => row.scheduled_at)
              .map((row) => (
                <Link href={`/app/social/${row.id}`} key={row.id}>
                  <time>{String(row.scheduled_at).slice(0, 10)}</time>
                  <strong>{String(row.title)}</strong>
                  <span>
                    {channelLabel(row)} ·{" "}
                    {config.statuses[row.status as keyof typeof config.statuses] ?? row.status}
                  </span>
                </Link>
              ))}
            {!rows.some((row) => row.scheduled_at) && (
              <div className="empty">Geen posts met publicatiemoment voor deze selectie.</div>
            )}
          </div>
        ) : (
          <div className="operations-table">
            <div className="operations-head">
              <span>Naam</span>
              <span>Type</span>
              <span>Contact / planning</span>
              <span>Status</span>
              <span />
            </div>
            {rows.map((row) => (
              <article key={row.id}>
                <div>
                  <strong>{String(row[config.titleColumn])}</strong>
                  {module === "community" && Boolean(row.account_user_id) && <span className="badge">Account gekoppeld</span>}
                  <p>
                    {String(row.notes ?? row.copy ?? "").slice(0, 100) || "Geen notities"}
                  </p>
                </div>
                <span>
                  {config.types[String(row[config.typeColumn]) as keyof typeof config.types] ??
                    String(row[config.typeColumn] ?? "")}
                </span>
                <span>{secondaryValue(module, row)}</span>
                <span className="badge purple">
                  {config.statuses[row.status as keyof typeof config.statuses] ?? row.status}
                </span>
                <Link className="row-action" href={`/app/${module}/${row.id}`}>
                  Openen
                </Link>
              </article>
            ))}
            {rows.length === 0 && (
              <div className="empty">Geen records gevonden voor deze filters.</div>
            )}
          </div>
        )}
        <nav className="pagination" aria-label="Paginering">
          <span>
            Pagina {Math.min(page, pages)} van {pages}
          </span>
          <div>
            {page > 1 && (
              <Link href={`?${queryString({ pagina: String(page - 1) })}`}>Vorige</Link>
            )}
            {page < pages && (
              <Link href={`?${queryString({ pagina: String(page + 1) })}`}>Volgende</Link>
            )}
          </div>
        </nav>
      </div>
    </AppShell>
  );
}
