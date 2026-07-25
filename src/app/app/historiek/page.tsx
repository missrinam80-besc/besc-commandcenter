import Link from "next/link";
import { Archive, Search } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SavedViews } from "@/components/saved-views";
import { requireActiveMembership } from "@/lib/auth-context";
import { historicalModules, lifecycleLabels } from "./constants";
import { bulkArchiveHistoricalRecords, bulkAssignHistoricalRecords } from "./actions";

const PAGE_SIZE = 25;
type HistoricalRecord = { id: string; title: string; suggested_module: string | null; lifecycle: string; source_status: string | null; converted_target_table: string | null; payload: { board_name?: string; workspace?: string } | null };

export default async function HistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const search = params.zoek?.trim().slice(0, 100) ?? "";
  const moduleFilter = historicalModules.includes(params.module as never) ? params.module! : "";
  const lifecycle = ["active_or_unknown", "completed", "archived"].includes(params.status ?? "") ? params.status! : "";
  const sort = ["newest", "oldest", "title"].includes(params.sorteren ?? "") ? params.sorteren! : "newest";
  const page = Math.max(1, Number.parseInt(params.pagina ?? "1", 10) || 1);
  const { supabase, membership } = await requireActiveMembership();
  const { data: summaryRows } = await supabase.from("legacy_records").select("suggested_module,lifecycle,converted_target_table").eq("organization_id", membership.organization_id).is("deleted_at", null);
  const summary = { total: summaryRows?.length ?? 0, review: 0, assigned: 0, converted: 0, archived: 0 };
  for (const row of summaryRows ?? []) { if (row.converted_target_table) summary.converted++; else if (row.lifecycle === "archived") summary.archived++; else if (!row.suggested_module || row.suggested_module === "Nog te bepalen") summary.review++; else summary.assigned++; }
  const orderColumn = sort === "title" ? "title" : "created_at";
  const ascending = sort === "oldest" || sort === "title";
  let query = supabase.from("legacy_records").select("id,title,suggested_module,lifecycle,source_status,converted_target_table,payload", { count: "exact" }).eq("organization_id", membership.organization_id).is("deleted_at", null).order(orderColumn, { ascending });
  if (search) query = query.ilike("title", `%${search}%`);
  if (moduleFilter) query = query.eq("suggested_module", moduleFilter);
  if (lifecycle) query = query.eq("lifecycle", lifecycle);
  const from = (page - 1) * PAGE_SIZE;
  const { data, count, error } = await query.range(from, from + PAGE_SIZE - 1);
  const records = (data ?? []) as HistoricalRecord[];
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const queryString = (nextPage: number) => { const next = new URLSearchParams(); if (search) next.set("zoek", search); if (moduleFilter) next.set("module", moduleFilter); if (lifecycle) next.set("status", lifecycle); if (sort) next.set("sorteren",sort); next.set("pagina", String(nextPage)); return next.toString(); };

  return <AppShell active="Historiek"><header className="topbar module-top"><div><p>MONDAY-ARCHIEF</p><h1>Overige / Historiek</h1></div><span className="history-total"><Archive size={17}/>{total} records</span></header><div className="module-body">
    <p className="lead">Bekijk de volledige geïmporteerde historiek en wijs records gecontroleerd toe aan hun toekomstige BESC-module.</p>
    <section className="history-stats"><article><span>Totaal</span><strong>{summary.total}</strong></article><article><span>Te beoordelen</span><strong>{summary.review}</strong></article><article><span>Toegewezen</span><strong>{summary.assigned}</strong></article><article><span>Omgezet</span><strong>{summary.converted}</strong></article><article><span>Gearchiveerd</span><strong>{summary.archived}</strong></article></section>
    {params.fout&&<div className="error-note">De actie kon niet worden uitgevoerd ({params.fout}). Selecteer minstens één niet-verwerkt record.</div>}{params.succes&&<div className="success">Bulkactie uitgevoerd voor {params.aantal ?? "de geselecteerde"} records.</div>}
    <form className="history-filters extended-filters" method="get"><label className="search"><Search size={16}/><span className="sr-only">Zoeken</span><input name="zoek" defaultValue={search} placeholder="Zoeken in historiek..."/></label><label><span className="sr-only">Module</span><select name="module" defaultValue={moduleFilter}><option value="">Alle modules</option>{historicalModules.map(item=><option key={item}>{item}</option>)}</select></label><label><span className="sr-only">Status</span><select name="status" defaultValue={lifecycle}><option value="">Alle statussen</option>{Object.entries(lifecycleLabels).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label><label><span className="sr-only">Sortering</span><select name="sorteren" defaultValue={sort}><option value="newest">Nieuwste eerst</option><option value="oldest">Oudste eerst</option><option value="title">Titel A–Z</option></select></label><button>Filteren</button>{(search||moduleFilter||lifecycle||params.sorteren)&&<Link href="/app/historiek">Wissen</Link>}<span className="filter-count">{total} {total===1?"resultaat":"resultaten"}</span></form>
    <SavedViews module="historiek" path="/app/historiek" currentQuery={queryString(1)}/>
    {error&&<div className="error-note">De historische records konden niet worden geladen.</div>}
    <form><div className="bulk-toolbar"><span>Selecteer records op deze pagina</span><select name="bulk_module" defaultValue=""><option value="" disabled>Toewijzen aan…</option>{historicalModules.map(item=><option key={item}>{item}</option>)}</select><button formAction={bulkAssignHistoricalRecords}>Toewijzen</button><button className="archive-button" formAction={bulkArchiveHistoricalRecords}>Archiveren</button></div><div className="history-list selectable">{records.map(record=><article key={record.id}><label className="record-select"><input type="checkbox" name="ids" value={record.id} disabled={Boolean(record.converted_target_table)}/><span className="sr-only">Selecteer {record.title}</span></label><div className="history-record-icon"><Archive size={16}/></div><div><strong>{record.title}</strong><p>{record.payload?.workspace ?? "monday"} · {record.payload?.board_name ?? "Onbekend bord"}{record.source_status ? ` · ${record.source_status}` : ""}</p></div><span className="badge">{record.converted_target_table ? "Omgezet" : record.suggested_module ?? "Nog te bepalen"}</span><span className="history-lifecycle">{record.converted_target_table ? "Verwerkt" : lifecycleLabels[record.lifecycle] ?? record.lifecycle}</span><Link className="row-action" href={`/app/historiek/${record.id}`}>Bekijken</Link></article>)}{!error&&records.length===0&&<div className="empty">Geen historische records gevonden voor deze filters.</div>}</div></form>
    <nav className="pagination" aria-label="Paginering"><span>Pagina {Math.min(page,pages)} van {pages}</span><div>{page>1&&<Link href={`?${queryString(page-1)}`}>Vorige</Link>}{page<pages&&<Link href={`?${queryString(page+1)}`}>Volgende</Link>}</div></nav>
  </div></AppShell>;
}
