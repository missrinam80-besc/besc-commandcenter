import Link from "next/link";
import { CalendarDays, List, Search } from "lucide-react";
import { createOperationalRecord } from "@/app/app/operations/actions";
import { operationalModules, type OperationalModule } from "@/app/app/operations/config";
import { AppShell } from "@/components/app-shell";
import { OperationalRecordForm } from "@/components/operational-record-form";
import { requireActiveMembership } from "@/lib/auth-context";

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
  return variants.length ? `${variants.length} kanalen` : String(row.platform ?? "Nog geen kanalen");
}

function secondaryValue(module: OperationalModule, row: Row) {
  if (module === "sponsors") return String(row.contact_name ?? row.email ?? "Geen contactpersoon");
  if (module === "campagnes") return row.end_date ? `Eindigt ${String(row.end_date).slice(0, 10)}` : "Geen einddatum";
  if (module === "community") return String(row.discord_handle ?? row.handle ?? "Geen Discord/handle");
  return `${channelLabel(row)} · ${row.scheduled_at ? String(row.scheduled_at).slice(0, 16).replace("T", " ") : "Niet gepland"}`;
}

export async function OperationalModulePage({ module, searchParams }: { module: OperationalModule; searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const config = operationalModules[module];
  const search = params.zoek?.trim().slice(0, 100) ?? "";
  const status = Object.hasOwn(config.statuses, params.status ?? "") ? params.status! : "";
  const { supabase, membership } = await requireActiveMembership();
  const org = membership.organization_id;
  const columns = module === "social" ? "*,social_post_variants(id,platform)" : "*";
  let query = supabase.from(config.table).select(columns).eq("organization_id", org).is("deleted_at", null).order(module === "social" ? "scheduled_at" : "created_at", { ascending: module === "social" });
  if (search) query = query.ilike(config.titleColumn, `%${search}%`);
  if (status) query = query.eq("status", status);
  const [rowsResult, allResult, projectsResult, partnersResult, contentResult, campaignsResult, eventsResult] = await Promise.all([
    query,
    supabase.from(config.table).select("status").eq("organization_id", org).is("deleted_at", null),
    supabase.from("projects").select("id,title").eq("organization_id", org).is("deleted_at", null).order("title"),
    supabase.from("partners").select("id,name").eq("organization_id", org).is("deleted_at", null).order("name"),
    supabase.from("content_items").select("id,title").eq("organization_id", org).is("deleted_at", null).order("title"),
    supabase.from("campaigns").select("id,title").eq("organization_id", org).is("deleted_at", null).order("title"),
    supabase.from("events").select("id,title").eq("organization_id", org).is("deleted_at", null).order("title"),
  ]);
  const rows = (rowsResult.data ?? []) as unknown as Row[];
  const all = allResult.data ?? [];
  const active = all.filter((row) => !["completed", "published", "inactive", "rejected", "archived", "cancelled"].includes(row.status)).length;
  const calendar = module === "social" && params.weergave === "kalender";

  return <AppShell active={config.label}>
    <header className="topbar module-top"><div><p>{config.eyebrow}</p><h1>{config.label}</h1></div><Link className="primary" href="?nieuw=1">Nieuwe {config.singular}</Link></header>
    <div className="module-body">
      <p className="lead">Centraal beheer, opvolging en historiek voor {config.label.toLowerCase()}.</p>
      <section className="history-stats"><article><span>Totaal</span><strong>{all.length}</strong></article><article><span>Actief / open</span><strong>{active}</strong></article><article><span>Afgerond / archief</span><strong>{all.length - active}</strong></article></section>
      {params.fout && <div className="error-note">Opslaan is mislukt ({params.fout}).</div>}
      {params.succes && <div className="success">Wijziging opgeslagen.</div>}
      {params.nieuw && <section className="form-card"><div className="form-heading"><h2>Nieuwe {config.singular}</h2><Link href="?">Sluiten</Link></div><OperationalRecordForm action={createOperationalRecord} module={module} projects={projectsResult.data ?? []} partners={partnersResult.data ?? []} content={contentResult.data ?? []} campaigns={campaignsResult.data ?? []} events={eventsResult.data ?? []} /></section>}
      <div className="view-toolbar">
        <form className="history-filters"><label className="search"><Search size={16} /><input name="zoek" defaultValue={search} placeholder="Zoeken..." /></label><select name="status" defaultValue={status}><option value="">Alle statussen</option>{Object.entries(config.statuses).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><button>Filteren</button></form>
        {module === "social" && <div className="view-switch"><Link className={!calendar ? "active" : ""} href="?"><List size={15} />Lijst</Link><Link className={calendar ? "active" : ""} href="?weergave=kalender"><CalendarDays size={15} />Kalender</Link></div>}
      </div>
      {calendar ? <div className="social-calendar">
        {rows.filter((row) => row.scheduled_at).map((row) => <Link href={`/app/social/${row.id}`} key={row.id}><time>{String(row.scheduled_at).slice(0, 10)}</time><strong>{String(row.title)}</strong><span>{channelLabel(row)} · {config.statuses[row.status as keyof typeof config.statuses] ?? row.status}</span></Link>)}
        {!rows.some((row) => row.scheduled_at) && <div className="empty">Nog geen posts met publicatiemoment.</div>}
      </div> : <div className="operations-table">
        <div className="operations-head"><span>Naam</span><span>Type</span><span>Contact / planning</span><span>Status</span><span></span></div>
        {rows.map((row) => <article key={row.id}><div><strong>{String(row[config.titleColumn])}</strong><p>{String(row.notes ?? row.copy ?? "").slice(0, 100) || "Geen notities"}</p></div><span>{config.types[String(row[config.typeColumn]) as keyof typeof config.types] ?? String(row[config.typeColumn] ?? "")}</span><span>{secondaryValue(module, row)}</span><span className="badge purple">{config.statuses[row.status as keyof typeof config.statuses] ?? row.status}</span><Link className="row-action" href={`/app/${module}/${row.id}`}>Openen</Link></article>)}
        {rows.length === 0 && <div className="empty">Nog geen records voor deze selectie.</div>}
      </div>}
    </div>
  </AppShell>;
}
