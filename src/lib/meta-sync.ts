import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchFacebookMetrics, fetchInstagramMetrics, type MetaPlatform, usableMetaCredentials, verifyMetaToken } from "@/lib/meta-integration";
import { metaPermissionSummary } from "@/lib/meta-token-diagnostics";

type TriggerType = "manual" | "scheduled";

function syncKey(trigger: TriggerType, intervalMinutes: number) {
  if (trigger === "manual") return `manual:${randomUUID()}`;
  return `scheduled:${Math.floor(Date.now() / (Math.max(intervalMinutes, 15) * 60_000))}`;
}

function numericInsights(items: Array<{ name: string; period?: string; values?: Array<{ value?: number; end_time?: string }> }>) {
  return items.flatMap((item) => {
    const values = item.values ?? [];
    const total = values.reduce((sum, value) => sum + (typeof value.value === "number" ? value.value : 0), 0);
    if (!values.length) return [];
    return [{ metric: item.name, value: total, periodEnd: values.at(-1)?.end_time ?? null, period: item.period ?? "unknown" }];
  });
}

export async function syncMetaAccountById(accountId: string, trigger: TriggerType, createdBy: string | null = null) {
  const admin = createAdminClient();
  const { data: account, error: accountError } = await admin.from("social_accounts")
    .select("id,organization_id,platform,status,external_account_id,account_name,sync_interval_minutes,quota_daily_limit,quota_used_estimate,quota_counter_date")
    .eq("id", accountId).in("platform", ["facebook", "instagram"]).is("deleted_at", null).maybeSingle();
  if (accountError) throw accountError;
  if (!account || account.status !== "connected" || !account.external_account_id) throw new Error("Het Meta-account is niet volledig verbonden.");
  const platform = account.platform as MetaPlatform;
  const idempotencyKey = syncKey(trigger, account.sync_interval_minutes);
  const { data: existing } = await admin.from("social_sync_runs").select("id,status,records_written").eq("social_account_id", account.id).eq("idempotency_key", idempotencyKey).maybeSingle();
  if (existing) return { runId: existing.id, status: "skipped" as const, recordsWritten: existing.records_written };
  const { data: run, error: runError } = await admin.from("social_sync_runs").insert({
    organization_id: account.organization_id, social_account_id: account.id, trigger_type: trigger,
    status: "running", idempotency_key: idempotencyKey, started_at: new Date().toISOString(), created_by: createdBy,
  }).select("id").single();
  if (runError?.code === "23505") return { runId: null, status: "skipped" as const, recordsWritten: 0 };
  if (runError || !run) throw runError ?? new Error("De Meta-synchronisatie kon niet worden gestart.");

  try {
    const today = new Date().toISOString().slice(0, 10);
    const quotaUsed = account.quota_counter_date === today ? account.quota_used_estimate : 0;
    const quotaCostEstimate = 3; // Profile + Insights + possible token diagnostic.
    if (quotaUsed + quotaCostEstimate > account.quota_daily_limit) throw new Error("De interne dagelijkse quotalimiet is bereikt.");
    const { data: reservation, error: quotaError } = await admin.from("social_accounts").update({
      quota_used_estimate: quotaUsed + quotaCostEstimate, quota_counter_date: today, updated_at: new Date().toISOString(),
    }).eq("id", account.id).eq("quota_used_estimate", account.quota_used_estimate).select("id").maybeSingle();
    if (quotaError || !reservation) throw quotaError ?? new Error("De quota-reservering is door een gelijktijdige synchronisatie gewijzigd.");

    const credentials = await usableMetaCredentials(account.id);
    const end = new Date();
    end.setUTCDate(end.getUTCDate() - 1);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 27);
    const periodStart = start.toISOString();
    const periodEnd = end.toISOString();
    const sourceUrl = platform === "facebook" ? `https://www.facebook.com/${account.external_account_id}` : `https://www.instagram.com/${account.account_name.replace(/^@/, "")}/`;
    const snapshots: Array<Record<string, unknown>> = [];
    let partialError: string | null = null;
    let resolvedName = account.account_name;

    if (platform === "facebook") {
      const result = await fetchFacebookMetrics(credentials.access_token, account.external_account_id);
      resolvedName = result.profile.name || resolvedName;
      for (const [platformMetric, normalizedMetric, value] of [
        ["fan_count", "followers", result.profile.fan_count],
        ["followers_count", "followers_total", result.profile.followers_count],
      ] as const) {
        if (typeof value === "number") snapshots.push({ platformMetric, normalizedMetric, value, periodStart: null, periodEnd: null });
      }
      for (const metric of numericInsights(result.insights)) snapshots.push({ platformMetric: metric.metric, normalizedMetric: `period_${metric.metric}`, value: metric.value, periodStart, periodEnd });
      partialError = result.insightError;
    } else {
      const result = await fetchInstagramMetrics(credentials.access_token, account.external_account_id, Math.floor(start.valueOf() / 1000), Math.floor(end.valueOf() / 1000));
      resolvedName = result.profile.username || resolvedName;
      for (const [platformMetric, normalizedMetric, value] of [
        ["followers_count", "followers", result.profile.followers_count],
        ["follows_count", "following", result.profile.follows_count],
        ["media_count", "published_media", result.profile.media_count],
      ] as const) {
        if (typeof value === "number") snapshots.push({ platformMetric, normalizedMetric, value, periodStart: null, periodEnd: null });
      }
      for (const metric of numericInsights(result.insights)) snapshots.push({ platformMetric: metric.metric, normalizedMetric: `period_${metric.metric}`, value: metric.value, periodStart, periodEnd });
      partialError = result.insightError;
    }

    let verifiedScopes: string[] | undefined;
    if (partialError) {
      try {
        const diagnostics = await verifyMetaToken(credentials.access_token, platform);
        verifiedScopes = diagnostics.scopes;
        partialError = `${partialError} ${metaPermissionSummary(diagnostics)}`;
      } catch (error) {
        partialError = `${partialError} ${error instanceof Error ? error.message : "Tokenrechten konden niet worden gecontroleerd."}`;
      }
    }

    const rows = snapshots.map((item) => ({
      organization_id: account.organization_id, social_account_id: account.id, sync_run_id: run.id,
      external_content_id: account.external_account_id, platform_metric: item.platformMetric,
      normalized_metric: item.normalizedMetric, metric_value: item.value, period_start: item.periodStart,
      period_end: item.periodEnd, source_url: sourceUrl,
      source_metadata: { platform, analytics_period: item.periodStart ? "last_28_complete_days" : "lifetime", fetched_via: "official_api" },
    }));
    if (rows.length) {
      const { error: snapshotError } = await admin.from("social_metric_snapshots").insert(rows);
      if (snapshotError) throw snapshotError;
    }
    const finishedAt = new Date().toISOString();
    const runStatus = partialError ? "partial" : "succeeded";
    const accountLastError = partialError?.slice(0, 1000) ?? null;
    const [runUpdate, accountUpdate] = await Promise.all([
      admin.from("social_sync_runs").update({ status: runStatus, records_read: rows.length, records_written: rows.length, error_message: partialError?.slice(0, 1000) ?? null, finished_at: finishedAt }).eq("id", run.id),
      admin.from("social_accounts").update({ account_name: resolvedName, last_sync_at: finishedAt, last_error: accountLastError, ...(verifiedScopes ? { granted_scopes: verifiedScopes } : {}), token_expires_at: credentials.expires_at, updated_at: finishedAt }).eq("id", account.id),
    ]);
    if (runUpdate.error || accountUpdate.error) throw runUpdate.error ?? accountUpdate.error;
    return { runId: run.id, status: runStatus as "partial" | "succeeded", recordsWritten: rows.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Onbekende Meta-fout";
    const expired = /token.*verlopen|toegangstoken is verlopen|oauth/i.test(message);
    await Promise.all([
      admin.from("social_sync_runs").update({ status: "failed", error_message: message.slice(0, 1000), finished_at: new Date().toISOString() }).eq("id", run.id),
      admin.from("social_accounts").update({ status: expired ? "expired" : "connected", last_error: message.slice(0, 1000), updated_at: new Date().toISOString() }).eq("id", account.id),
    ]);
    throw error;
  }
}
