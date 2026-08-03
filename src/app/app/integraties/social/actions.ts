"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActiveMembership } from "@/lib/auth-context";
import { socialAccountStatuses, socialPlatforms } from "@/lib/social-connectors";
import { syncYouTubeAccountById } from "@/lib/youtube-sync";

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
  quota_daily_limit: z.coerce.number().int().min(1).max(10_000_000).optional(),
  quota_warning_percent: z.coerce.number().int().min(1).max(100).optional(),
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
    quota_daily_limit: values.quota_daily_limit ?? 10_000,
    quota_warning_percent: values.quota_warning_percent ?? 80,
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

export async function syncYouTubeAccount(formData: FormData) {
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) redirect("/app/integraties/social?fout=account");
  const { supabase, user, membership } = await requireActiveMembership();
  if (!["admin", "board"].includes(membership.role)) redirect("/app?fout=rechten");
  const { data: account } = await supabase.from("social_accounts").select("id,platform,status").eq("id", id.data).eq("organization_id", membership.organization_id).eq("platform", "youtube").is("deleted_at", null).maybeSingle();
  if (!account || account.status !== "connected") redirect("/app/integraties/social?fout=niet-verbonden");

  try {
    await syncYouTubeAccountById(account.id, "manual", user.id);
  } catch {
    redirect("/app/integraties/social?fout=youtube-sync");
  }
  revalidatePath("/app/integraties/social");
  revalidatePath("/app/rapportage/social");
  redirect("/app/integraties/social?succes=youtube-sync");
}
