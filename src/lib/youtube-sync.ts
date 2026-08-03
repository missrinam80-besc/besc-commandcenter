import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchYouTubeAnalytics, fetchYouTubeChannel, usableYouTubeCredentials } from "@/lib/youtube-integration";

type TriggerType = "manual" | "scheduled";

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function syncKey(trigger: TriggerType, intervalMinutes: number) {
  if (trigger === "manual") return `manual:${randomUUID()}`;
  return `scheduled:${Math.floor(Date.now() / (Math.max(intervalMinutes, 15) * 60_000))}`;
}

export async function syncYouTubeAccountById(accountId: string, trigger: TriggerType, createdBy: string | null = null) {
  const admin = createAdminClient();
  const { data: account, error: accountError } = await admin.from("social_accounts")
    .select("id,organization_id,platform,status,sync_interval_minutes")
    .eq("id", accountId)
    .eq("platform", "youtube")
    .is("deleted_at", null)
    .maybeSingle();
  if (accountError) throw accountError;
  if (!account || account.status !== "connected") throw new Error("Het YouTube-account is niet verbonden.");

  const idempotencyKey = syncKey(trigger, account.sync_interval_minutes);
  const startedAt = new Date().toISOString();
  const { data: existing } = await admin.from("social_sync_runs").select("id,status,records_written").eq("social_account_id", account.id).eq("idempotency_key", idempotencyKey).maybeSingle();
  if (existing) return { runId: existing.id, status: "skipped" as const, recordsWritten: existing.records_written };
  const { data: run, error: runError } = await admin.from("social_sync_runs").insert({
    organization_id: account.organization_id,
    social_account_id: account.id,
    trigger_type: trigger,
    status: "running",
    idempotency_key: idempotencyKey,
    started_at: startedAt,
    created_by: createdBy,
  }).select("id").single();
  if (runError?.code === "23505") return { runId: null, status: "skipped" as const, recordsWritten: 0 };
  if (runError || !run) throw runError ?? new Error("De synchronisatierun kon niet worden gestart.");

  try {
    const credentials = await usableYouTubeCredentials(account.id);
    const channel = await fetchYouTubeChannel(credentials.access_token);
    const end = new Date();
    end.setUTCDate(end.getUTCDate() - 2);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 27);
    const analytics = await fetchYouTubeAnalytics(credentials.access_token, isoDate(start), isoDate(end));
    const analyticsValues = new Map<string, number>();
    analytics.columnHeaders?.forEach((header, index) => {
      const raw = analytics.rows?.[0]?.[index];
      if (typeof raw === "number" || (typeof raw === "string" && raw.trim() !== "")) analyticsValues.set(header.name, Number(raw));
    });
    const statistics = channel.statistics ?? {};
    const snapshots = [
      ["viewCount", "lifetime_views", Number(statistics.viewCount ?? 0), null, null],
      ["subscriberCount", "subscribers", Number(statistics.subscriberCount ?? 0), null, null],
      ["videoCount", "published_videos", Number(statistics.videoCount ?? 0), null, null],
      ...Array.from(analyticsValues.entries()).map(([metric, value]) => {
        const normalizedMetric = metric.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
        return [metric, `period_${normalizedMetric}`, value, start.toISOString(), end.toISOString()];
      }),
    ].map(([platformMetric, normalizedMetric, metricValue, periodStart, periodEnd]) => ({
      organization_id: account.organization_id,
      social_account_id: account.id,
      sync_run_id: run.id,
      external_content_id: channel.id,
      platform_metric: String(platformMetric),
      normalized_metric: String(normalizedMetric),
      metric_value: Number(metricValue),
      period_start: periodStart as string | null,
      period_end: periodEnd as string | null,
      source_url: `https://www.youtube.com/channel/${channel.id}`,
      source_metadata: { platform: "youtube", analytics_period: periodStart ? "last_28_complete_days" : "lifetime", fetched_via: "official_api" },
    }));
    const { error: snapshotError } = await admin.from("social_metric_snapshots").insert(snapshots);
    if (snapshotError) throw snapshotError;
    const finishedAt = new Date().toISOString();
    const [runUpdate, accountUpdate] = await Promise.all([
      admin.from("social_sync_runs").update({ status: "succeeded", records_read: snapshots.length, records_written: snapshots.length, finished_at: finishedAt }).eq("id", run.id),
      admin.from("social_accounts").update({ account_name: channel.snippet?.title || "BESC YouTube", external_account_id: channel.id, last_sync_at: finishedAt, last_error: null, token_expires_at: credentials.expires_at, updated_at: finishedAt }).eq("id", account.id),
    ]);
    if (runUpdate.error || accountUpdate.error) throw runUpdate.error ?? accountUpdate.error;
    return { runId: run.id, status: "succeeded" as const, recordsWritten: snapshots.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Onbekende YouTube-fout";
    const finishedAt = new Date().toISOString();
    const connectionStatus = /refresh-token|toegangstoken|oauth/i.test(message) ? "expired" : "connected";
    await Promise.all([
      admin.from("social_sync_runs").update({ status: "failed", error_message: message.slice(0, 1000), finished_at: finishedAt }).eq("id", run.id),
      admin.from("social_accounts").update({ status: connectionStatus, last_error: message.slice(0, 1000), updated_at: finishedAt }).eq("id", account.id),
    ]);
    throw error;
  }
}
