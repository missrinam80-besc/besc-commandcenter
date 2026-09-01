import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchTwitchOperationalData, usableTwitchCredentials } from "@/lib/twitch-integration";

type TriggerType = "manual" | "scheduled";
function syncKey(trigger: TriggerType, intervalMinutes: number) { return trigger === "manual" ? `manual:${randomUUID()}` : `scheduled:${Math.floor(Date.now() / (Math.max(intervalMinutes, 15) * 60_000))}`; }

export async function syncTwitchAccountById(accountId: string, trigger: TriggerType, createdBy: string | null = null) {
  const admin = createAdminClient();
  const { data: account, error: accountError } = await admin.from("social_accounts").select("id,organization_id,status,sync_interval_minutes,quota_daily_limit,quota_used_estimate,quota_counter_date").eq("id", accountId).eq("platform", "twitch").is("deleted_at", null).maybeSingle();
  if (accountError) throw accountError;
  if (!account || account.status !== "connected") throw new Error("Het Twitch-account is niet verbonden.");
  const idempotencyKey = syncKey(trigger, account.sync_interval_minutes);
  const { data: existing } = await admin.from("social_sync_runs").select("id,status,records_written").eq("social_account_id", account.id).eq("idempotency_key", idempotencyKey).maybeSingle();
  if (existing) return { runId: existing.id, status: "skipped" as const, recordsWritten: existing.records_written };
  const { data: run, error: runError } = await admin.from("social_sync_runs").insert({ organization_id: account.organization_id, social_account_id: account.id, trigger_type: trigger, status: "running", idempotency_key: idempotencyKey, started_at: new Date().toISOString(), created_by: createdBy }).select("id").single();
  if (runError?.code === "23505") return { runId: null, status: "skipped" as const, recordsWritten: 0 };
  if (runError || !run) throw runError ?? new Error("De Twitch-synchronisatie kon niet worden gestart.");
  try {
    const today = new Date().toISOString().slice(0, 10);
    const quotaUsed = account.quota_counter_date === today ? account.quota_used_estimate : 0;
    const quotaCostEstimate = 5;
    if (quotaUsed + quotaCostEstimate > account.quota_daily_limit) throw new Error("De interne dagelijkse quotalimiet is bereikt.");
    const { data: reservation, error: quotaError } = await admin.from("social_accounts").update({ quota_used_estimate: quotaUsed + quotaCostEstimate, quota_counter_date: today, updated_at: new Date().toISOString() }).eq("id", account.id).eq("quota_used_estimate", account.quota_used_estimate).select("id").maybeSingle();
    if (quotaError || !reservation) throw quotaError ?? new Error("De quota-reservering is door een gelijktijdige synchronisatie gewijzigd.");
    const credentials = await usableTwitchCredentials(account.id);
    const data = await fetchTwitchOperationalData(credentials.access_token, credentials.user_id);
    const now = new Date().toISOString();
    const metrics = [
      ["is_live", "is_live", data.stream ? 1 : 0],
      ["viewer_count", "current_viewers", Number(data.stream?.viewer_count ?? 0)],
      ["schedule_segments", "scheduled_streams", data.scheduleSegments.length],
    ];
    const rows = metrics.map(([platformMetric, normalizedMetric, value]) => ({ organization_id: account.organization_id, social_account_id: account.id, sync_run_id: run.id, external_content_id: data.user.id, platform_metric: String(platformMetric), normalized_metric: String(normalizedMetric), metric_value: Number(value), period_start: null, period_end: now, source_url: `https://www.twitch.tv/${data.user.login}`, source_metadata: { platform: "twitch", analytics_period: "current_operational_state", fetched_via: "official_api" } }));
    const { error: snapshotError } = await admin.from("social_metric_snapshots").insert(rows);
    if (snapshotError) throw snapshotError;
    const [runUpdate, accountUpdate] = await Promise.all([
      admin.from("social_sync_runs").update({ status: "succeeded", records_read: rows.length, records_written: rows.length, finished_at: now }).eq("id", run.id),
      admin.from("social_accounts").update({ account_name: data.user.display_name, external_account_id: data.user.id, account_type: "channel", granted_scopes: credentials.scopes, last_sync_at: now, last_error: null, token_expires_at: credentials.expires_at, updated_at: now }).eq("id", account.id),
    ]);
    if (runUpdate.error || accountUpdate.error) throw runUpdate.error ?? accountUpdate.error;
    return { runId: run.id, status: "succeeded" as const, recordsWritten: rows.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Onbekende Twitch-fout";
    const expired = /token.*verlopen|toegangstoken|oauth|refresh-token/i.test(message);
    await Promise.all([
      admin.from("social_sync_runs").update({ status: "failed", error_message: message.slice(0, 1000), finished_at: new Date().toISOString() }).eq("id", run.id),
      admin.from("social_accounts").update({ status: expired ? "expired" : "connected", last_error: message.slice(0, 1000), updated_at: new Date().toISOString() }).eq("id", account.id),
    ]);
    throw error;
  }
}
