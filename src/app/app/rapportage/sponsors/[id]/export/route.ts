import { requireActiveMembership } from "@/lib/auth-context";
import { managementPeriod, type ReportPeriod, kpiTargetLabel, targetDirectionLabels, measuredValue } from "@/lib/management-report";
import { isActiveSponsor } from "@/lib/reporting-scope";
const cell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(request.url);
  const period: ReportPeriod = ["month", "quarter", "year"].includes(url.searchParams.get("periode") ?? "") ? url.searchParams.get("periode") as ReportPeriod : "month";
  const rawDate = url.searchParams.get("datum");
  const anchor = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? new Date(`${rawDate}T12:00:00Z`) : new Date();
  const range = managementPeriod(period, anchor);
  const start = range.start.toISOString().slice(0, 10), end = range.end.toISOString().slice(0, 10);
  const { supabase, membership } = await requireActiveMembership();
  if (!["admin", "board", "member"].includes(membership.role)) return new Response("Geen toegang", { status: 403 });
  const org = membership.organization_id;
  const [partner, campaigns, kpis] = await Promise.all([
    supabase.from("partners").select("name,partner_type,status").eq("organization_id", org).eq("id", id).is("deleted_at", null).maybeSingle(),
    supabase.from("campaigns").select("id,title,status,start_date,end_date,value,impressions,clicks").eq("organization_id", org).eq("partner_id", id).is("deleted_at", null),
    supabase.from("kpi_records").select("name,metric,value,target,measurement_status,target_direction,unit,source,collection_method,metric_definition,partner_id,campaign_id").eq("organization_id", org).is("deleted_at", null).gte("period_end", start).lt("period_end", end),
  ]);
  if (!partner.data || !isActiveSponsor(partner.data)) return new Response("Niet gevonden", { status: 404 });
  const campaignRows = (campaigns.data ?? []).filter((item) => (!item.start_date || item.start_date < end) && (!item.end_date || item.end_date >= start));
  const campaignIds = new Set(campaignRows.map((item) => item.id));
  const metricRows = (kpis.data ?? []).filter((item) => item.partner_id === id || (item.campaign_id && campaignIds.has(item.campaign_id)));
  const rows: unknown[][] = [["Sponsorrapport", partner.data.name], ["Periode", range.label], [], ["Campagnes"], ["Naam", "Status", "Start", "Einde", "Waarde", "Impressies", "Kliks"], ...campaignRows.map((item) => [item.title, item.status, item.start_date, item.end_date, item.value, item.impressions, item.clicks]), [], ["KPI's"], ["Naam", "Metric", "Waarde", "Doel", "Meetstatus", "Doelrichting", "Beoordeling", "Eenheid", "Bron", "Methode", "Definitie"], ...metricRows.map((item) => [item.name, item.metric, measuredValue(item) ?? "Ontbrekende meting", item.target, item.measurement_status, targetDirectionLabels[item.target_direction] ?? targetDirectionLabels.unknown, kpiTargetLabel(item), item.unit, item.source, item.collection_method, item.metric_definition])];
  const body = `\uFEFF${rows.map((row) => row.map(cell).join(";")).join("\r\n")}`;
  return new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="sponsorrapport-${partner.data.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${start}.csv"` } });
}
