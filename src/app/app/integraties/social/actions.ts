"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActiveMembership } from "@/lib/auth-context";
import { socialAccountStatuses, socialPlatforms } from "@/lib/social-connectors";
import { fetchYouTubeAnalytics, fetchYouTubeChannel, usableYouTubeCredentials } from "@/lib/youtube-integration";

const accountSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  platform: z.enum(socialPlatforms),
  account_name: z.string().trim().max(180).optional(),
  external_account_id: z.string().trim().max(240).optional(),
  account_type: z.string().trim().max(120).optional(),
  status: z.enum(socialAccountStatuses),
  granted_scopes: z.string().trim().max(2000).optional(),
  sync_enabled: z.string().optional(),
  sync_interval_minutes: z.coerce.number().int().min(15).max(43200).optional(),
  retention_days: z.coerce.number().int().min(30).max(3650).optional(),
  token_expires_at: z.string().optional(),
});

function parseOptionalDate(value?: string) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
}

export async function saveSocialAccount(formData: FormData) {
  const parsed = accountSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/integraties/social?fout=velden");

  const { supabase, user, membership } = await requireActiveMembership();
  if (!["admin", "board"].includes(membership.role)) redirect("/app?fout=rechten");

  const values = parsed.data;
  const accountName = values.account_name || `${values.platform} account`;
  const record = {
    organization_id: membership.organization_id,
    platform: values.platform,
    account_name: accountName,
    external_account_id: values.external_account_id || null,
    account_type: values.account_type || null,
    status: values.status,
    granted_scopes: values.granted_scopes?.split(/[\s,]+/).map((scope) => scope.trim()).filter(Boolean) ?? [],
    sync_enabled: values.sync_enabled === "on",
    sync_interval_minutes: values.sync_interval_minutes ?? 1440,
    retention_days: values.retention_days ?? 730,
    token_expires_at: parseOptionalDate(values.token_expires_at),
    updated_at: new Date().toISOString(),
  };

  const result = values.id
    ? await supabase.from("social_accounts").update(record).eq("id", values.id).eq("organization_id", membership.organization_id)
    : await supabase.from("social_accounts").insert({ ...record, created_by: user.id });

  if (result.error) redirect(`/app/integraties/social?fout=${encodeURIComponent(result.error.code || "opslaan")}`);
  revalidatePath("/app/integraties/social");
  redirect("/app/integraties/social?succes=opgeslagen");
}

export async function changeSocialAccountState(formData: FormData) {
  const id = z.string().uuid().safeParse(formData.get("id"));
  const status = z.enum(["disabled", "disconnected"]).safeParse(formData.get("status"));
  if (!id.success || !status.success) redirect("/app/integraties/social?fout=velden");

  const { supabase, membership } = await requireActiveMembership();
  if (!["admin", "board"].includes(membership.role)) redirect("/app?fout=rechten");
  const { error } = await supabase.from("social_accounts").update({
    status: status.data,
    sync_enabled: false,
    updated_at: new Date().toISOString(),
  }).eq("id", id.data).eq("organization_id", membership.organization_id);

  if (error) redirect("/app/integraties/social?fout=status");
  revalidatePath("/app/integraties/social");
  redirect(`/app/integraties/social?succes=${status.data}`);
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function syncYouTubeAccount(formData: FormData) {
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) redirect("/app/integraties/social?fout=account");
  const { supabase, user, membership } = await requireActiveMembership();
  if (!["admin", "board"].includes(membership.role)) redirect("/app?fout=rechten");
  const { data: account } = await supabase.from("social_accounts").select("id,platform,status").eq("id", id.data).eq("organization_id", membership.organization_id).eq("platform", "youtube").is("deleted_at", null).maybeSingle();
  if (!account || account.status !== "connected") redirect("/app/integraties/social?fout=niet-verbonden");

  const idempotencyKey = `manual:${randomUUID()}`;
  const startedAt = new Date().toISOString();
  const { data: run, error: runError } = await supabase.from("social_sync_runs").insert({
    organization_id: membership.organization_id,
    social_account_id: account.id,
    trigger_type: "manual",
    status: "running",
    idempotency_key: idempotencyKey,
    started_at: startedAt,
    created_by: user.id,
  }).select("id").single();
  if (runError || !run) redirect("/app/integraties/social?fout=sync-start");

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
      ...Array.from(analyticsValues.entries()).map(([metric, value]) => [metric, `period_${metric.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)}`, value, start.toISOString(), end.toISOString()]),
    ].map(([platformMetric, normalizedMetric, metricValue, periodStart, periodEnd]) => ({
      organization_id: membership.organization_id,
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
    const { error: snapshotError } = await supabase.from("social_metric_snapshots").insert(snapshots);
    if (snapshotError) throw snapshotError;
    const finishedAt = new Date().toISOString();
    await Promise.all([
      supabase.from("social_sync_runs").update({ status: "succeeded", records_read: snapshots.length, records_written: snapshots.length, finished_at: finishedAt }).eq("id", run.id).eq("organization_id", membership.organization_id),
      supabase.from("social_accounts").update({ account_name: channel.snippet?.title || "BESC YouTube", external_account_id: channel.id, last_sync_at: finishedAt, last_error: null, token_expires_at: credentials.expires_at, updated_at: finishedAt }).eq("id", account.id).eq("organization_id", membership.organization_id),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Onbekende YouTube-fout";
    const finishedAt = new Date().toISOString();
    await Promise.all([
      supabase.from("social_sync_runs").update({ status: "failed", error_message: message.slice(0, 1000), finished_at: finishedAt }).eq("id", run.id).eq("organization_id", membership.organization_id),
      supabase.from("social_accounts").update({ status: "error", last_error: message.slice(0, 1000), updated_at: finishedAt }).eq("id", account.id).eq("organization_id", membership.organization_id),
    ]);
    redirect("/app/integraties/social?fout=youtube-sync");
  }
  revalidatePath("/app/integraties/social");
  revalidatePath("/app/rapportage/social");
  redirect("/app/integraties/social?succes=youtube-sync");
}
