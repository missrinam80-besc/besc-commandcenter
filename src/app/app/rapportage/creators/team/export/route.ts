import { kpiTargetLabel, targetDirectionLabels, measuredValue } from "@/lib/management-report";
import { requireActiveMembership } from "@/lib/auth-context";
import { isActiveStreamTeamMember } from "@/lib/reporting-scope";

const cell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const year = /^20\d{2}$/.test(url.searchParams.get("jaar") ?? "") ? url.searchParams.get("jaar")! : String(new Date().getFullYear());
  const { supabase, membership } = await requireActiveMembership();
  if (!["admin", "board", "member"].includes(membership.role)) return new Response("Geen toegang", { status: 403 });
  const organizationId = membership.organization_id;
  const { data: peopleData } = await supabase.from("community_people").select("id,display_name,handle,status,roles:community_person_roles(role)").eq("organization_id", organizationId).is("deleted_at", null).order("display_name");
  const people = (peopleData ?? []).filter(isActiveStreamTeamMember);
  const personIds = people.map((person) => person.id);
  const { data: kpis } = personIds.length
    ? await supabase.from("kpi_records").select("community_person_id,name,metric,value,target,measurement_status,target_direction,unit,source,collection_method,period_start,period_end").eq("organization_id", organizationId).in("community_person_id", personIds).is("deleted_at", null).gte("period_end", `${year}-01-01`).lte("period_end", `${year}-12-31`).order("period_end", { ascending: false })
    : { data: [] };
  const names = new Map(people.map((person) => [person.id, person.display_name]));
  const rows: unknown[][] = [["Totaalrapport streamteam"], ["Jaar", year], [], ["Streamteamlid", "Naam", "Metric", "Waarde", "Doel", "Meetstatus", "Doelrichting", "Beoordeling", "Eenheid", "Bron", "Methode", "Start", "Einde"], ...(kpis ?? []).map((item) => [names.get(item.community_person_id) ?? "Onbekend", item.name, item.metric, measuredValue(item) ?? "Ontbrekende meting", item.target, item.measurement_status, targetDirectionLabels[item.target_direction] ?? targetDirectionLabels.unknown, kpiTargetLabel(item), item.unit, item.source, item.collection_method, item.period_start, item.period_end])];
  const body = `\uFEFF${rows.map((row) => row.map(cell).join(";")).join("\r\n")}`;
  return new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="streamteamrapport-${year}.csv"` } });
}
