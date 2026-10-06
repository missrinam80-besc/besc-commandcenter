import { kpiValueLabel, kpiTargetLabel, targetDirectionLabels } from "@/lib/management-report";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ManagementReportActions } from "@/components/management-report-actions";
import { requireActiveMembership } from "@/lib/auth-context";
import { socialMetricLabel } from "@/lib/meta-insights";

const number = (value: number) => new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 2 }).format(value);
const date = (value: string | null) => value ? new Date(value).toLocaleDateString("nl-BE") : "—";
const metricLabel = socialMetricLabel;

type AccountRelation = { account_name?: string; platform?: string } | null;
type PostRelation = { title?: string; platform?: string } | null;

export default async function SocialInsights({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const query = await searchParams;
  const year = Number(query.jaar) || new Date().getFullYear();
  const { supabase, membership } = await requireActiveMembership();
  const organizationId = membership.organization_id;
  if (!["admin", "board", "member"].includes(membership.role)) {
    return <AppShell active="Social inzichten"><div className="module-body"><div className="permission-note">Social inzichten zijn alleen beschikbaar voor bestuur en medewerkers.</div></div></AppShell>;
  }
  const start = `${year}-01-01T00:00:00Z`;
  const end = `${year}-12-31T23:59:59Z`;
  const [posts, kpis, periodMetrics, lifetimeMetrics] = await Promise.all([
    supabase.from("social_posts").select("id,title,platform,status,published_at,scheduled_at,publication_url").eq("organization_id", organizationId).is("deleted_at", null).gte("published_at", start).lte("published_at", end).order("published_at", { ascending: false }),
    supabase.from("kpi_records").select("id,name,metric,value,target,measurement_status,target_direction,unit,source,collection_method,metric_definition,period_start,period_end,social_post_id,social_posts(title,platform)").eq("organization_id", organizationId).eq("domain", "social").is("deleted_at", null).gte("period_end", `${year}-01-01`).lte("period_end", `${year}-12-31`).order("period_end", { ascending: false }),
    supabase.from("social_metric_snapshots").select("id,normalized_metric,platform_metric,metric_value,period_start,period_end,fetched_at,source_url,social_accounts(account_name,platform)").eq("organization_id", organizationId).gte("period_end", start).lte("period_end", end).order("fetched_at", { ascending: false }),
    supabase.from("social_metric_snapshots").select("id,normalized_metric,platform_metric,metric_value,period_start,period_end,fetched_at,source_url,social_accounts(account_name,platform)").eq("organization_id", organizationId).is("period_end", null).gte("fetched_at", start).lte("fetched_at", end).order("fetched_at", { ascending: false }),
  ]);
  const postRows = posts.data ?? [];
  const kpiRows = kpis.data ?? [];
  const automaticRows = [...(periodMetrics.data ?? []), ...(lifetimeMetrics.data ?? [])];
  const platforms = Array.from(new Set([
    ...postRows.map((item) => item.platform),
    ...kpiRows.map((item) => (item.social_posts as unknown as PostRelation)?.platform).filter(Boolean),
    ...automaticRows.map((item) => (item.social_accounts as unknown as AccountRelation)?.platform).filter(Boolean),
  ])) as string[];
  const platformRows = platforms.map((platform) => ({
    platform,
    posts: postRows.filter((item) => item.platform === platform).length,
    manualMeasurements: kpiRows.filter((item) => (item.social_posts as unknown as PostRelation)?.platform === platform).length,
    automaticMeasurements: automaticRows.filter((item) => (item.social_accounts as unknown as AccountRelation)?.platform === platform).length,
  })).sort((a, b) => b.posts - a.posts || b.automaticMeasurements - a.automaticMeasurements);
  const apiMeasurements = kpiRows.filter((item) => item.collection_method === "api").length + automaticRows.length;

  return <AppShell active="Social inzichten">
    <header className="project-detail-head">
      <div><Link href="/app/rapportage">← Terug naar rapportage</Link><span className="eyebrow">SOCIAL INZICHTEN</span><h1>Social media</h1><p>{year} · handmatige, geïmporteerde en officiële API-metingen duidelijk onderscheiden</p></div>
      <div className="project-actions"><ManagementReportActions exportHref={`/app/rapportage/social/export?jaar=${year}`}/></div>
    </header>
    <div className="project-detail-body management-report">
      <section className="management-report-intro">
        <div><span className="eyebrow">RAPPORTPERIODE</span><h2>{year}</h2><p>Publicaties komen uit de social planner. Resultaten combineren gekoppelde KPI-records met rechtstreeks gesynchroniseerde platformmetingen en behouden altijd hun bron.</p></div>
        <form><label>Jaar<input type="number" name="jaar" defaultValue={year}/></label><button>Bijwerken</button></form>
      </section>
      <section className="management-hero-metrics">
        <article><div><span>Gepubliceerd</span><strong>{postRows.length}</strong></div></article>
        <article><div><span>Platformen</span><strong>{platformRows.length}</strong></div></article>
        <article><div><span>Alle metingen</span><strong>{kpiRows.length + automaticRows.length}</strong></div></article>
        <article><div><span>Automatisch via API</span><strong>{apiMeasurements}</strong></div></article>
      </section>
      <section className="panel">
        <div className="panel-head"><div><span className="eyebrow">PLATFORMOVERZICHT</span><h3>Publicaties en meetdekking</h3></div></div>
        <div className="management-table-wrap"><table className="management-table"><thead><tr><th>Platform</th><th>Publicaties</th><th>Gekoppelde KPI&apos;s</th><th>API-meetpunten</th><th>Totaal</th></tr></thead><tbody>{platformRows.map((item) => <tr key={item.platform}><td>{item.platform}</td><td>{item.posts}</td><td>{item.manualMeasurements}</td><td>{item.automaticMeasurements}</td><td>{item.manualMeasurements + item.automaticMeasurements}</td></tr>)}</tbody></table>{!platformRows.length ? <div className="empty">Nog geen gepubliceerde posts of platformmetingen.</div> : null}</div>
      </section>
      <section className="panel management-sponsors">
        <div className="panel-head"><div><span className="eyebrow">OFFICIËLE API</span><h3>Automatische accountmetingen</h3></div></div>
        <div className="management-table-wrap"><table className="management-table"><thead><tr><th>Account</th><th>Platform</th><th>Metric</th><th>Waarde</th><th>Periode</th><th>Opgehaald</th><th>Bron</th></tr></thead><tbody>{automaticRows.map((item) => { const account = item.social_accounts as unknown as AccountRelation; return <tr key={item.id}><td>{account?.account_name || "Onbekend account"}</td><td>{account?.platform || "—"}</td><td title={item.platform_metric}>{metricLabel(item.normalized_metric)}</td><td>{number(Number(item.metric_value))}</td><td>{item.period_start || item.period_end ? `${date(item.period_start)} – ${date(item.period_end)}` : "Actuele totaalstand"}</td><td>{date(item.fetched_at)}</td><td>{item.source_url ? <a href={item.source_url} target="_blank" rel="noreferrer">Open kanaal</a> : "Officiële API"}</td></tr>; })}</tbody></table>{!automaticRows.length ? <div className="empty">Nog geen automatische platformmetingen voor dit jaar.</div> : null}</div>
      </section>
      <section className="panel management-sponsors">
        <div className="panel-head"><div><span className="eyebrow">KPI-REGISTER</span><h3>Handmatige en geïmporteerde resultaten</h3></div></div>
        <div className="management-table-wrap"><table className="management-table"><thead><tr><th>Post</th><th>Platform</th><th>Metric</th><th>Waarde</th><th>Doel</th><th>Bron</th><th>Methode</th><th>Definitie</th></tr></thead><tbody>{kpiRows.map((item) => { const post = item.social_posts as unknown as PostRelation; return <tr key={item.id}><td>{post?.title ? <Link href={`/app/social/${item.social_post_id}`}>{post.title}</Link> : "Algemeen"}</td><td>{post?.platform || "Alle"}</td><td><Link href={`/app/rapportage/${item.id}`}>{item.metric}</Link></td><td>{kpiValueLabel(item)} {item.unit}</td><td>{item.target == null ? "—" : number(Number(item.target))}<small> · {targetDirectionLabels[item.target_direction] ?? targetDirectionLabels.unknown} · {kpiTargetLabel(item)}</small></td><td>{item.source}</td><td>{item.collection_method === "api" ? "API" : item.collection_method === "imported" ? "Import" : "Handmatig"}</td><td>{item.metric_definition || "Nog niet vastgelegd"}</td></tr>; })}</tbody></table>{!kpiRows.length ? <div className="empty">Nog geen gekoppelde social KPI-metingen voor dit jaar.</div> : null}</div>
      </section>
    </div>
  </AppShell>;
}
