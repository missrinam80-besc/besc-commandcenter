import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApprovalEntityType } from "./approvals";

type ApprovalIdentity = {
  id: string;
  entity_type: ApprovalEntityType;
  entity_id: string;
  requested_at: string;
};

/** Previous review rounds stay in the database, but are no longer current work. */
export function latestApprovalRequests<T extends ApprovalIdentity>(rows: T[]): T[] {
  const seen = new Set<string>();
  return [...rows]
    .sort((a, b) => Date.parse(b.requested_at) - Date.parse(a.requested_at) || b.id.localeCompare(a.id))
    .filter((row) => {
      const key = `${row.entity_type}:${row.entity_id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

const sourceTables = {
  content: { table: "content_items", softDelete: true },
  expense: { table: "expenses", softDelete: true },
  partner: { table: "partners", softDelete: true },
  document: { table: "google_resource_links", softDelete: false },
  email: { table: "email_communications", softDelete: true },
  newsletter: { table: "newsletters", softDelete: false },
} as const;

/** Use the signed-in client's existing organization and RLS boundaries. */
export async function currentApprovalRequests<T extends ApprovalIdentity>(
  supabase: SupabaseClient,
  organizationId: string,
  rows: T[],
): Promise<T[]> {
  const latest = latestApprovalRequests(rows);
  const available = new Set<string>();
  await Promise.all(Object.entries(sourceTables).map(async ([type, source]) => {
    const ids = latest.filter((row) => row.entity_type === type).map((row) => row.entity_id);
    if (!ids.length) return;
    let query = supabase.from(source.table).select("id").eq("organization_id", organizationId).in("id", ids);
    if (source.softDelete) query = query.is("deleted_at", null);
    if (type === "document") query = query.eq("resource_type", "document");
    const { data, error } = await query;
    if (error) throw new Error("De actuele goedkeuringswerkvoorraad kon niet worden geladen.");
    for (const row of data ?? []) available.add(`${type}:${row.id}`);
  }));
  return latest.filter((row) => available.has(`${row.entity_type}:${row.entity_id}`));
}
