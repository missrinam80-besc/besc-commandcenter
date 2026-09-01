import { requireActiveMembership } from "@/lib/auth-context";
import { acceptanceStatusLabel } from "@/lib/acceptance";

const csvCell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;

function safeFileName(value: string) {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "acceptatie";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const runId = url.searchParams.get("run") ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(runId)) {
    return new Response("Ongeldige acceptatieronde", { status: 400 });
  }

  const { supabase, membership } = await requireActiveMembership();
  if (!["admin", "board"].includes(membership.role)) {
    return new Response("Geen toegang", { status: 403 });
  }

  const [{ data: run }, { data: checks }] = await Promise.all([
    supabase.from("acceptance_runs")
      .select("id,title,status,environment,commit_sha,notes,started_at,completed_at,starter:profiles!acceptance_runs_started_by_fkey(display_name),completer:profiles!acceptance_runs_completed_by_fkey(display_name)")
      .eq("organization_id", membership.organization_id)
      .eq("id", runId)
      .maybeSingle(),
    supabase.from("acceptance_check_results")
      .select("category,title,status,evidence,updated_at,updater:profiles!acceptance_check_results_updated_by_fkey(display_name)")
      .eq("organization_id", membership.organization_id)
      .eq("run_id", runId)
      .order("category", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  if (!run) return new Response("Niet gevonden", { status: 404 });

  const starter = Array.isArray(run.starter) ? run.starter[0] : run.starter;
  const completer = Array.isArray(run.completer) ? run.completer[0] : run.completer;
  const rows: unknown[][] = [
    ["BESC Command Center acceptatierapport"],
    ["Titel", run.title],
    ["Status", run.status],
    ["Omgeving", run.environment],
    ["Commit", run.commit_sha],
    ["Gestart op", run.started_at],
    ["Gestart door", starter?.display_name],
    ["Afgerond op", run.completed_at],
    ["Afgerond door", completer?.display_name],
    ["Notities", run.notes],
    [],
    ["Categorie", "Check", "Status", "Bewijs / opmerking", "Laatst bijgewerkt", "Bijgewerkt door"],
  ];

  for (const check of checks ?? []) {
    const updater = Array.isArray(check.updater) ? check.updater[0] : check.updater;
    rows.push([
      check.category,
      check.title,
      acceptanceStatusLabel(check.status),
      check.evidence,
      check.updated_at,
      updater?.display_name,
    ]);
  }

  return new Response(`\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="acceptatierapport-${safeFileName(run.title)}.csv"`,
    },
  });
}
