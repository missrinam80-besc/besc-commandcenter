import type { createAdminClient } from "@/lib/supabase/admin";
import type { ExportQuery, MetricSnapshot } from "@/lib/social-metrics-export";

export async function readSocialMetricsExportPage(admin: ReturnType<typeof createAdminClient>, { organizationId, filters, asOf, offset, count }: ExportQuery): Promise<MetricSnapshot[]> {
  let query = admin.from("social_metric_snapshots")
    .select("id,social_account_id,external_content_id,normalized_metric,platform_metric,metric_value,period_start,period_end,fetched_at,source_url,social_accounts!inner(account_name,platform)")
    .eq("organization_id", organizationId)
    .eq("social_accounts.organization_id", organizationId)
    .lte("fetched_at", asOf)
    .order("fetched_at", { ascending: false })
    .order("id", { ascending: false });
  if (filters.platform) query = query.eq("social_accounts.platform", filters.platform);
  if (filters.accountId) query = query.eq("social_account_id", filters.accountId);
  if (filters.metric) query = query.eq("normalized_metric", filters.metric);
  if (filters.from) query = query.gte("fetched_at", filters.from);
  if (filters.until) query = query.lt("fetched_at", filters.until);
  const { data, error } = await query.range(offset, offset + count - 1);
  if (error) throw error;
  // Supabase's generated join type is an array; the FK makes this many-to-one.
  return (data ?? []) as unknown as MetricSnapshot[];
}
