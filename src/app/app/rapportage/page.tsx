import Link from "next/link";
import { BarChart3, ExternalLink, Handshake, Target, TrendingUp, UserRoundSearch } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { FormModal } from "@/components/form-modal";
import { KpiForm, type KpiOptions } from "@/components/kpi-form";
import { requireActiveMembership } from "@/lib/auth-context";

const domains: Record<string, string> = { community: "Community", content: "Content", social: "Social media", events: "Events", campaigns: "Campagnes", sponsors: "Sponsors", website: "Website", finance: "Financiën", other: "Overige" };
const units: Record<string, string> = { number: "", percent: "%", currency: "€", minutes: "min", hours: "uur", days: "dagen" };
const methods: Record<string, string> = { manual: "Handmatig", imported: "Import", api: "API" };
function format(value: number, unit: string) { return unit === "currency" ? new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" }).format(value) : `${value.toLocaleString("nl-BE", { maximumFractionDigits: 2 })}${units[unit] ? ` ${units[unit]}` : ""}`; }

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const { supabase, membership } = await requireActiveMembership();
  const org = membership.organization_id;
  const manager = ["admin", "board"].includes(membership.role);
  const year = Number(q.jaar) || new Date().getFullYear();
  let request = supabase.from("kpi_records").select("*").eq("organization_id", org).is("deleted_at", null).gte("period_end", `${year}-01-01`).lte("period_end", `${year}-12-31`).order("period_end", { ascending: false });
  if (q.domein) request = request.eq("domain", q.domein);
  const [records, projects, campaigns, events, content, partners, tasks, people, social] = await Promise.all([
    request,
    supabase.from("projects").select("id,title").eq("organization_id", org).is("deleted_at", null).order("title"),
    supabase.from("campaigns").select("id,title").eq("organization_id", org).is("deleted_at", null).order("title"),
    supabase.from("events").select("id,title").eq("organization_id", org).is("deleted_at", null).order("title"),
    supabase.from("content_items").select("id,title").eq("organization_id", org).is("deleted_at", null).order("title"),
    supabase.from("partners").select("id,name").eq("organization_id", org).is("deleted_at", null).order("name"),
    supabase.from("tasks").select("id,title").eq("organization_id", org).is("deleted_at", null).order("title"),
    supabase.from("community_people").select("id,name:display_name").eq("organization_id", org).is("deleted_at", null).order("display_name"),
    supabase.from("social_posts").select("id,title").eq("organization_id", org).is("deleted_at", null).order("title"),
  ]);
  const options: KpiOptions = { projects: projects.data ?? [], campaigns: campaigns.data ?? [], events: events.data ?? [], content: content.data ?? [], partners: partners.data ?? [], tasks: tasks.data ?? [], people: people.data ?? [], social: social.data ?? [] };
  const rows = records.data ?? [];
  const targets = rows.filter((item) => item.target !== null && Number(item.target) !== 0);
  const reached = targets.filter((item) => Number(item.value) >= Number(item.target)).length;
  const exportQuery = new URLSearchParams({ jaar: String(year) });
  if (q.domein) exportQuery.set("domein", q.domein);
  return <AppShell active="Rapportage & KPI">
    <header className="topbar module-top"><div><p>RESULTATEN & INZICHT</p><h1>Rapportage & KPI</h1></div><div className="module-head-actions"><Link className="row-action" href={`/app/rapportage/export?${exportQuery}`}>CSV exporteren</Link><Link className="row-action" href="/app/rapportage/social">Social inzichten</Link>{manager && <Link className="row-action" href="/app/rapportage/management">Managementoverzicht</Link>}<Link className="row-action" href="/app/rapportage/sponsors">Sponsorrapportage</Link><Link className="row-action" href="/app/rapportage/creators">Streamerrapportage</Link>{manager && <Link className="primary" href="?nieuw=1">Nieuwe KPI</Link>}</div></header>
    <div className="module-body">
      <p className="lead">Volg resultaten over alle BESC-domeinen. Elke registratie vermeldt bron, periode, definitie en gekoppelde dossiers.</p>
      {q.fout && <div className="error-note">Opslaan is mislukt ({q.fout}).</div>}{q.succes && <div className="success">KPI geregistreerd.</div>}
      {q.nieuw && manager && <FormModal title="Nieuwe KPI"><KpiForm options={options}/></FormModal>}
      <section className="report-kpi-summary">
        <Link href="/app/rapportage/social"><BarChart3/><div><span>Social inzichten</span><strong>Openen</strong></div></Link>
        {manager && <Link href="/app/rapportage/management"><TrendingUp/><div><span>Management overzicht</span><strong>Openen</strong></div></Link>}
        <Link href="/app/rapportage/sponsors"><Handshake/><div><span>Sponsorrapportage</span><strong>Kies sponsor</strong></div></Link>
        <Link href="/app/rapportage/creators"><UserRoundSearch/><div><span>Streamerrapportage</span><strong>Kies streamer</strong></div></Link>
      </section>
      <section className="report-kpi-summary"><article><BarChart3/><div><span>Registraties</span><strong>{rows.length}</strong></div></article><article><Target/><div><span>Doelen behaald</span><strong>{reached} / {targets.length}</strong></div></article><article><TrendingUp/><div><span>Domeinen</span><strong>{new Set(rows.map((item) => item.domain)).size}</strong></div></article></section>
      <form className="report-filter"><label>Jaar<input type="number" name="jaar" defaultValue={year}/></label><label>Domein<select name="domein" defaultValue={q.domein ?? ""}><option value="">Alle domeinen</option>{Object.entries(domains).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><button>Filter</button><Link href="/app/rapportage">Wissen</Link></form>
      <section className="report-kpi-grid">{rows.map((item) => { const goal = item.target === null ? null : Number(item.target); const progress = goal ? Math.min(100, Math.max(0, Number(item.value) / goal * 100)) : null; return <article key={item.id}><div><span>{domains[item.domain]}</span><b>{item.metric}</b></div><h2>{format(Number(item.value), item.unit)}</h2>{goal !== null && <><div className="report-progress"><i style={{ width: `${progress}%` }}/></div><small>Doel: {format(goal, item.unit)} · {progress?.toFixed(0)}%</small></>}<p>{item.name}</p><small>{methods[item.collection_method] ?? "Handmatig"} · {item.source}</small><footer><time>{item.period_start || "Geen start"} — {item.period_end || "Geen einde"}</time><div>{item.source_url && <a href={item.source_url} target="_blank" rel="noreferrer"><ExternalLink size={13}/>Bron</a>}<Link href={`/app/rapportage/${item.id}`}>Openen</Link></div></footer></article>; })}{!rows.length && <div className="empty">Nog geen KPI-registraties voor deze selectie.</div>}</section>
    </div>
  </AppShell>;
}
