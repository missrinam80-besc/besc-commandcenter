import { requireActiveMembership } from "@/lib/auth-context";

const cell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const year = /^20\d{2}$/.test(url.searchParams.get("jaar") ?? "") ? url.searchParams.get("jaar")! : String(new Date().getFullYear());
  const { supabase, membership } = await requireActiveMembership();
  if (!["admin", "board", "member"].includes(membership.role)) return new Response("Geen toegang", { status: 403 });
  const start = `${year}-01-01T00:00:00Z`;
  const end = `${year}-12-31T23:59:59Z`;
  const [kpis, periodMetrics, lifetimeMetrics] = await Promise.all([
    supabase.from("kpi_records").select("name,metric,value,target,unit,source,collection_method,metric_definition,period_start,period_end,social_posts(title,platform)").eq("organization_id", membership.organization_id).eq("domain", "social").is("deleted_at", null).gte("period_end", `${year}-01-01`).lte("period_end", `${year}-12-31`),
    supabase.from("social_metric_snapshots").select("normalized_metric,platform_metric,metric_value,period_start,period_end,fetched_at,source_url,social_accounts(account_name,platform)").eq("organization_id", membership.organization_id).gte("period_end", start).lte("period_end", end),
    supabase.from("social_metric_snapshots").select("normalized_metric,platform_metric,metric_value,period_start,period_end,fetched_at,source_url,social_accounts(account_name,platform)").eq("organization_id", membership.organization_id).is("period_end", null).gte("fetched_at", start).lte("fetched_at", end),
  ]);
  const rows: unknown[][] = [
    ["Social inzichten", year],
    [],
    ["Soort", "Account of post", "Platform", "Naam", "Metric", "Waarde", "Doel", "Eenheid", "Bron", "Methode", "Definitie", "Start", "Einde", "Opgehaald"],
    ...(kpis.data ?? []).map((item) => {
      const post = item.social_posts as unknown as { title?: string; platform?: string } | null;
      return ["KPI-register", post?.title, post?.platform, item.name, item.metric, item.value, item.target, item.unit, item.source, item.collection_method, item.metric_definition, item.period_start, item.period_end, null];
    }),
    ...[...(periodMetrics.data ?? []), ...(lifetimeMetrics.data ?? [])].map((item) => {
      const account = item.social_accounts as unknown as { account_name?: string; platform?: string } | null;
      return ["Officiële API", account?.account_name, account?.platform, item.normalized_metric, item.platform_metric, item.metric_value, null, null, item.source_url, "api", "Rechtstreeks opgehaald via de officiële platform-API", item.period_start, item.period_end, item.fetched_at];
    }),
  ];
  return new Response(`\uFEFF${rows.map((row) => row.map(cell).join(";")).join("\r\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="social-inzichten-${year}.csv"`,
    },
  });
}
