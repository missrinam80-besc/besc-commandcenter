import Link from "next/link";
import {
  Activity,
  Archive,
  CirclePlus,
  Pencil,
  Search,
  Trash2,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import {
  auditActions,
  auditEntityGroups,
  auditEntityHref,
  auditEntityLabels,
  auditGroupTables,
  describeChangedFields,
  type AuditAction,
} from "@/lib/audit";
import { requirePermission } from "@/lib/auth-context";
import { isoDaysAgo } from "@/lib/date-range";

type EventRow = {
  id: string;
  entity_type: string;
  entity_id: string;
  action: AuditAction;
  entity_label: string | null;
  changed_fields: string[];
  previous_status: string | null;
  new_status: string | null;
  created_at: string;
  actor_id: string | null;
  profiles: { display_name: string | null } | null;
};

const actionIcons = {
  created: CirclePlus,
  updated: Pencil,
  archived: Archive,
  deleted: Trash2,
} satisfies Record<AuditAction, typeof Activity>;

const pageSize = 40;

function safePage(value?: string) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function queryString(values: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== "") params.set(key, String(value));
  });
  return `?${params.toString()}`;
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams;
  const page = safePage(query.pagina);
  const group = query.onderdeel && query.onderdeel in auditEntityGroups
    ? query.onderdeel
    : undefined;
  const action = query.actie && query.actie in auditActions
    ? query.actie as AuditAction
    : undefined;
  const actor = query.gebruiker || undefined;
  const search = query.zoek?.trim().slice(0, 100) || undefined;
  const days = Math.min(730, Math.max(1, Number(query.periode) || 30));

  const { supabase, membership } = await requirePermission(
    "manageOrganization",
    "/app?fout=geen-toegang",
  );
  const organizationId = membership.organization_id;

  let request = supabase
    .from("audit_log")
    .select(
      "id,entity_type,entity_id,action,entity_label,changed_fields,previous_status,new_status,created_at,actor_id,profiles!audit_log_actor_id_fkey(display_name)",
      { count: "exact" },
    )
    .eq("organization_id", organizationId)
    .gte("created_at", isoDaysAgo(days))
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  const tables = auditGroupTables(group);
  if (tables) request = request.in("entity_type", [...tables]);
  if (action) request = request.eq("action", action);
  if (actor) request = request.eq("actor_id", actor);
  if (search) request = request.ilike("entity_label", `%${search}%`);

  const [{ data: rows, count }, { data: members }] = await Promise.all([
    request,
    supabase
      .from("organization_members")
      .select("user_id,profiles(display_name)")
      .eq("organization_id", organizationId)
      .eq("status", "active"),
  ]);

  const events = (rows ?? []) as unknown as EventRow[];
  const activeMembers = (members ?? []) as unknown as {
    user_id: string;
    profiles: { display_name: string | null } | null;
  }[];
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const base = {
    onderdeel: group,
    actie: action,
    gebruiker: actor,
    zoek: search,
    periode: days,
  };

  return (
    <AppShell active="Activiteit">
      <header className="topbar module-top">
        <div>
          <p>BESTUUR & AUDIT</p>
          <h1>Activiteit</h1>
        </div>
        <span className="history-total">
          <Activity size={15} />
          {total} gebeurtenissen
        </span>
      </header>
      <div className="module-body">
        <p className="lead">
          Controleer wie dossiers heeft aangemaakt, bijgewerkt, gearchiveerd of
          verwijderd. Alleen bestuur en beheerders kunnen dit overzicht openen.
        </p>

        <form className="activity-filters audit-filters">
          <label>
            Onderdeel
            <select name="onderdeel" defaultValue={group ?? ""}>
              <option value="">Alle onderdelen</option>
              {Object.entries(auditEntityGroups).map(([value, item]) => (
                <option value={value} key={value}>{item.label}</option>
              ))}
            </select>
          </label>
          <label>
            Actie
            <select name="actie" defaultValue={action ?? ""}>
              <option value="">Alle acties</option>
              {Object.entries(auditActions).map(([value, label]) => (
                <option value={value} key={value}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            Gebruiker
            <select name="gebruiker" defaultValue={actor ?? ""}>
              <option value="">Iedereen</option>
              {activeMembers.map((member) => (
                <option value={member.user_id} key={member.user_id}>
                  {member.profiles?.display_name || "Naamloos account"}
                </option>
              ))}
            </select>
          </label>
          <label>
            Periode
            <select name="periode" defaultValue={String(days)}>
              <option value="7">7 dagen</option>
              <option value="30">30 dagen</option>
              <option value="90">90 dagen</option>
              <option value="365">1 jaar</option>
              <option value="730">2 jaar</option>
            </select>
          </label>
          <label className="audit-search">
            Zoeken
            <span>
              <Search size={15} />
              <input
                name="zoek"
                defaultValue={search ?? ""}
                placeholder="Naam van dossier"
              />
            </span>
          </label>
          <button>Filter</button>
          <Link href="/app/activiteit">Wissen</Link>
        </form>

        <section className="activity-log audit-log">
          {events.map((event) => {
            const Icon = actionIcons[event.action] ?? Activity;
            const label = event.entity_label || "Dossier zonder naam";
            const entityLabel = auditEntityLabels[event.entity_type]
              ?? event.entity_type.replaceAll("_", " ");
            const href = auditEntityHref(
              event.entity_type,
              event.entity_id,
              event.action,
            );
            const changed = describeChangedFields(event.changed_fields ?? []);
            const statusChanged = event.previous_status !== event.new_status
              && (event.previous_status || event.new_status);

            return (
              <article key={event.id}>
                <div className={`activity-log-icon audit-${event.action}`}>
                  <Icon size={16} />
                </div>
                <div>
                  <p>
                    <strong>
                      {event.profiles?.display_name || "Systeem of import"}
                    </strong>{" "}
                    heeft een {entityLabel.toLowerCase()}{" "}
                    {auditActions[event.action]}
                  </p>
                  {href ? <Link href={href}>{label}</Link> : <b>{label}</b>}
                  {changed && <small>Gewijzigd: {changed}</small>}
                  {statusChanged && (
                    <small>
                      Status: {event.previous_status || "—"} →{" "}
                      {event.new_status || "—"}
                    </small>
                  )}
                  <time>
                    {new Intl.DateTimeFormat("nl-BE", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "Europe/Brussels",
                    }).format(new Date(event.created_at))}
                  </time>
                </div>
                <span className="badge">{entityLabel}</span>
              </article>
            );
          })}
          {!events.length && (
            <div className="empty">
              Geen auditgebeurtenissen gevonden voor deze selectie.
            </div>
          )}
        </section>

        {pages > 1 && (
          <nav className="pagination">
            <span>Pagina {page} van {pages}</span>
            <div>
              {page > 1 && (
                <Link href={queryString({ ...base, pagina: page - 1 })}>
                  Vorige
                </Link>
              )}
              {page < pages && (
                <Link href={queryString({ ...base, pagina: page + 1 })}>
                  Volgende
                </Link>
              )}
            </div>
          </nav>
        )}
      </div>
    </AppShell>
  );
}
