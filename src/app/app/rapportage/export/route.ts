import { kpiTargetLabel, targetDirectionLabels, measuredValue } from "@/lib/management-report";
import { requireActiveMembership } from "@/lib/auth-context";

const csvCell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const year = /^20\d{2}$/.test(url.searchParams.get("jaar") ?? "")
    ? url.searchParams.get("jaar")!
    : String(new Date().getFullYear());
  const domain = url.searchParams.get("domein") ?? "";
  const { supabase, membership } = await requireActiveMembership();
  let query = supabase
    .from("kpi_records")
    .select("domain,name,metric,value,target,measurement_status,target_direction,unit,period_start,period_end,source,source_url,notes")
    .eq("organization_id", membership.organization_id)
    .is("deleted_at", null)
    .gte("period_end", `${year}-01-01`)
    .lte("period_end", `${year}-12-31`)
    .order("period_end", { ascending: false });
  if (domain) query = query.eq("domain", domain);
  const { data } = await query;
  const rows = [
    ["Domein", "Naam", "Metric", "Waarde", "Doel", "Meetstatus", "Doelrichting", "Beoordeling", "Eenheid", "Start", "Einde", "Bron", "Bronlink", "Notities"],
    ...(data ?? []).map((item) => [item.domain, item.name, item.metric, measuredValue(item) ?? "Ontbrekende meting", item.target, item.measurement_status, targetDirectionLabels[item.target_direction] ?? targetDirectionLabels.unknown, kpiTargetLabel(item), item.unit, item.period_start, item.period_end, item.source, item.source_url, item.notes]),
  ];
  const body = `\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="besc-kpis-${year}${domain ? `-${domain}` : ""}.csv"`,
    },
  });
}
