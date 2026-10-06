import { requireActiveMembership } from "@/lib/auth-context";
import { managementPeriod, type ReportPeriod, kpiTargetLabel, targetDirectionLabels, measuredValue } from "@/lib/management-report";

const csvCell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedPeriod = url.searchParams.get("periode") ?? "";
  const period: ReportPeriod = ["month", "quarter", "year"].includes(requestedPeriod)
    ? requestedPeriod as ReportPeriod
    : "month";
  const requestedDate = url.searchParams.get("datum") ?? "";
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
    ? new Date(`${requestedDate}T12:00:00Z`)
    : new Date();
  const range = managementPeriod(period, anchor);
  const { supabase, membership } = await requireActiveMembership();
  if (!["admin", "board"].includes(membership.role)) {
    return new Response("Geen toegang", { status: 403 });
  }
  const organizationId = membership.organization_id;
  const start = range.start.toISOString();
  const end = range.end.toISOString();
  const today = new Date().toISOString();

  const [tasks, projects, content, events, campaigns, partners, deliverables, expenses, income, budgets, kpis] =
    await Promise.all([
      supabase.from("tasks").select("id,title,status,priority,due_at,project_id").eq("organization_id", organizationId).is("deleted_at", null),
      supabase.from("projects").select("id,title,status,due_date").eq("organization_id", organizationId).is("deleted_at", null),
      supabase.from("content_items").select("id,title,status,content_type,publication_at").eq("organization_id", organizationId).is("deleted_at", null).gte("publication_at", start).lt("publication_at", end),
      supabase.from("events").select("id,title,status,event_type,start_at,expected_attendees").eq("organization_id", organizationId).is("deleted_at", null).gte("start_at", start).lt("start_at", end),
      supabase.from("campaigns").select("id,title,status,partner_id,value,impressions,clicks").eq("organization_id", organizationId).is("deleted_at", null),
      supabase.from("partners").select("id,name,status,estimated_value").eq("organization_id", organizationId).is("deleted_at", null),
      supabase.from("campaign_deliverables").select("id,title,campaign_id,status,due_date").eq("organization_id", organizationId),
      supabase.from("expenses").select("title,amount,status,expense_date").eq("organization_id", organizationId).is("deleted_at", null).gte("expense_date", start.slice(0, 10)).lt("expense_date", end.slice(0, 10)),
      supabase.from("income_entries").select("title,amount,status,expected_date").eq("organization_id", organizationId).is("deleted_at", null).gte("expected_date", start.slice(0, 10)).lt("expected_date", end.slice(0, 10)),
      supabase.from("budget_envelopes").select("name,planned_amount,status").eq("organization_id", organizationId).is("deleted_at", null),
      supabase.from("kpi_records").select("domain,name,metric,value,target,measurement_status,target_direction,unit,period_start,period_end").eq("organization_id", organizationId).is("deleted_at", null).gte("period_end", start.slice(0, 10)).lt("period_end", end.slice(0, 10)),
    ]);

  const rows: unknown[][] = [["Onderdeel", "Naam", "Status/metric", "Waarde", "Doel/detail", "Datum"]];
  const taskRows = tasks.data ?? [];
  rows.push(
    ["Samenvatting", "Rapportageperiode", period, range.label, "", anchor.toISOString().slice(0, 10)],
    ["Samenvatting", "Open taken", "open", taskRows.filter((item) => !["done", "cancelled"].includes(item.status)).length, "", ""],
    ["Samenvatting", "Achterstallige taken", "achterstallig", taskRows.filter((item) => item.due_at && item.due_at < today && !["done", "cancelled"].includes(item.status)).length, "", ""],
  );
  for (const item of projects.data ?? []) rows.push(["Project", item.title, item.status, "", "", item.due_date]);
  for (const item of content.data ?? []) rows.push(["Content", item.title, item.status, item.content_type, "", item.publication_at]);
  for (const item of events.data ?? []) rows.push(["Event", item.title, item.status, item.expected_attendees ?? "", item.event_type, item.start_at]);
  for (const item of campaigns.data ?? []) rows.push(["Campagne", item.title, item.status, item.value ?? "", `${item.impressions ?? 0} impressies; ${item.clicks ?? 0} kliks`, ""]);
  for (const item of partners.data ?? []) rows.push(["Sponsor", item.name, item.status, item.estimated_value ?? "", "", ""]);
  for (const item of deliverables.data ?? []) rows.push(["Deliverable", item.title, item.status, "", `Campagne ${item.campaign_id}`, item.due_date]);
  for (const item of expenses.data ?? []) rows.push(["Kost", item.title, item.status, item.amount, "", item.expense_date]);
  for (const item of income.data ?? []) rows.push(["Inkomst", item.title, item.status, item.amount, "", item.expected_date]);
  for (const item of budgets.data ?? []) rows.push(["Budget", item.name, item.status, item.planned_amount, "", ""]);
  for (const item of kpis.data ?? []) rows.push(["KPI", item.name, `${item.domain}: ${item.metric}`, measuredValue(item) ?? "Ontbrekende meting", `${item.target ?? ""} · ${targetDirectionLabels[item.target_direction] ?? targetDirectionLabels.unknown} · ${kpiTargetLabel(item)}`, `${item.period_start} - ${item.period_end}`]);

  const body = `\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="besc-management-${period}-${anchor.toISOString().slice(0, 10)}.csv"`,
    },
  });
}
