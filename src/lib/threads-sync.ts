import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchThreadsInsights, fetchThreadsProfile, usableThreadsCredentials } from "@/lib/threads-integration";

type TriggerType = "manual" | "scheduled";

function syncKey(trigger: TriggerType, intervalMinutes: number) {
  return trigger === "manual" ? `manual:${randomUUID()}` : `scheduled:${Math.floor(Date.now() / (Math.max(intervalMinutes, 15) * 60_000))}`;
}

export async function syncThreadsAccountById(accountId: string, trigger: TriggerType, createdBy: string | null = null) {
  const admin = createAdminClient();
  const { data: account, error: accountError } = await admin.from("social_accounts")
    .select("id,organization_id,platform,status,external_account_id,sync_interval_minutes,quota_daily_limit,quota_used_estimate,quota_counter_date")
    .eq("id", accountId).eq("platform", "threads").is("deleted_at", null).maybeSingle();
  if (accountError) throw accountError;
  if (!account || account.status !== "connected") throw new Error("Het Threads-account is niet verbonden.");
  const idempotencyKey = syncKey(trigger, account.sync_interval_minutes);
  const { data: existing } = await admin.from("social_sync_runs").select("id,status,records_written").eq("social_account_id", account.id).eq("idempotency_key", idempotencyKey).maybeSingle();
  if (existing) return { runId: existing.id, status: "skipped" as const, recordsWritten: existing.records_written };
  const { data: run, error: runError } = await admin.from("social_sync_runs").insert({
    organization_id: account.organization_id, social_account_id: account.id, trigger_type: trigger,
    status: "running", idempotency_key: idempotencyKey, started_at: new Date().toISOString(), created_by: createdBy,
  }).select("id").single();
  if (runError?.code === "23505") return { runId: null, status: "skipped" as const, recordsWritten: 0 };
  if (runError || !run) throw runError ?? new Error("De Threads-synchronisatie kon niet worden gestart.");

  try {
    const today = new Date().toISOString().slice(0, 10);
    const quotaUsed = account.quota_counter_date === today ? account.quota_used_estimate : 0;
    const quotaCostEstimate = 2;
    if (quotaUsed + quotaCostEstimate > account.quota_daily_limit) throw new Error("De interne dagelijkse quotalimiet is bereikt.");
    const { data: reservation, error: quotaError } = await admin.from("social_accounts").update({
      quota_used_estimate: quotaUsed + quotaCostEstimate, quota_counter_date: today, updated_at: new Date().toISOString(),
    }).eq("id", account.id).eq("quota_used_estimate", account.quota_used_estimate).select("id").maybeSingle();
    if (quotaError || !reservation) throw quotaError ?? new Error("De quota-reservering is door een gelijktijdige synchronisatie gewijzigd.");

    const credentials = await usableThreadsCredentials(account.id);
    const profile = await fetchThreadsProfile(credentials.access_token);
    const end = new Date(); end.setUTCDate(end.getUTCDate() - 1);
    const start = new Date(end); start.setUTCDate(start.getUTCDate() - 27);
    const insights = await fetchThreadsInsights(credentials.access_token, Math.floor(start.valueOf() / 1000), Math.floor(end.valueOf() / 1000));
    const rows = (insights.data ?? []).flatMap((metric) => {
      const value = typeof metric.total_value?.value === "number"
        ? metric.total_value.value
        : (metric.values ?? []).reduce((sum, item) => sum + (typeof item.value === "number" ? item.value : 0), 0);
      if (typeof value !== "number") return [];
      return [{
        organization_id: account.organization_id, social_account_id: account.id, sync_run_id: run.id,
        external_content_id: profile.id, platform_metric: metric.name, normalized_metric: `period_${metric.name}`,
        metric_value: value, period_start: start.toISOString(), period_end: end.toISOString(),
        source_url: `https://www.threads.net/@${profile.username ?? profile.id}`,
        source_metadata: { platform: "threads", analytics_period: "last_28_complete_days", fetched_via: "official_api" },
      }];
    });
    if (rows.length) {
      const { error: snapshotError } = await admin.from("social_metric_snapshots").insert(rows);
      if (snapshotError) throw snapshotError;
    }
    const finishedAt = new Date().toISOString();
    const [runUpdate, accountUpdate] = await Promise.all([
      admin.from("social_sync_runs").update({ status: "succeeded", records_read: rows.length, records_written: rows.length, finished_at: finishedAt }).eq("id", run.id),
      admin.from("social_accounts").update({ account_name: profile.username || profile.name || "BESC Threads", external_account_id: profile.id, last_sync_at: finishedAt, last_error: null, token_expires_at: credentials.expires_at, updated_at: finishedAt }).eq("id", account.id),
    ]);
    if (runUpdate.error || accountUpdate.error) throw runUpdate.error ?? accountUpdate.error;
    return { runId: run.id, status: "succeeded" as const, recordsWritten: rows.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Onbekende Threads-fout";
    const expired = /token.*verlopen|toegangstoken|oauth/i.test(message);
    await Promise.all([
      admin.from("social_sync_runs").update({ status: "failed", error_message: message.slice(0, 1000), finished_at: new Date().toISOString() }).eq("id", run.id),
      admin.from("social_accounts").update({ status: expired ? "expired" : "connected", last_error: message.slice(0, 1000), updated_at: new Date().toISOString() }).eq("id", account.id),
    ]);
    throw error;
  }
}
