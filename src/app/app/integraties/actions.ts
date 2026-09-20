"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActiveMembership } from "@/lib/auth-context";
import { testGoogleWorkspace } from "@/lib/google-workspace";

const schema = z.object({
  provider: z.enum(["google_workspace", "discord", "vercel_ai_gateway", "openai", "anthropic", "facebook", "instagram", "linkedin", "youtube", "twitch", "tiktok", "other"]),
  display_name: z.string().trim().min(2).max(100),
  status: z.enum(["not_configured", "configured", "connected", "error", "disabled"]),
  account_label: z.string().trim().max(180).optional(),
});

export async function saveIntegration(formData: FormData) {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/integraties?fout=velden");
  const { supabase, user, membership } = await requireActiveMembership();
  if (!["admin", "board"].includes(membership.role)) redirect("/app?fout=rechten");
  const { error } = await supabase.from("integration_connections").upsert({
    organization_id: membership.organization_id,
    ...parsed.data,
    account_label: parsed.data.account_label || null,
    created_by: user.id,
  }, { onConflict: "organization_id,provider,display_name" });
  if (error) redirect("/app/integraties?fout=opslaan");
  revalidatePath("/app/integraties");
  redirect("/app/integraties?succes=1");
}

export async function testGoogleWorkspaceConnection() {
  const { supabase, user, membership } = await requireActiveMembership();
  if (!["admin", "board"].includes(membership.role)) redirect("/app?fout=rechten");
  let succeeded = false;
  try {
    const resources = await testGoogleWorkspace();
    const { error } = await supabase.from("integration_connections").upsert({
      organization_id: membership.organization_id,
      provider: "google_workspace",
      display_name: "BESC Google Workspace",
      account_label: process.env.GOOGLE_OAUTH_USER_EMAIL ?? process.env.GOOGLE_GMAIL_SENDER ?? null,
      status: "connected",
      configuration: { resources },
      last_sync_at: new Date().toISOString(),
      last_error: null,
      created_by: user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: "organization_id,provider,display_name" });
    if (error) throw error;
    succeeded = true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Onbekende Google-fout";
    await supabase.from("integration_connections").upsert({
      organization_id: membership.organization_id,
      provider: "google_workspace",
      display_name: "BESC Google Workspace",
      account_label: process.env.GOOGLE_OAUTH_USER_EMAIL ?? process.env.GOOGLE_GMAIL_SENDER ?? null,
      status: "error",
      last_error: message.slice(0, 1000),
      created_by: user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: "organization_id,provider,display_name" });
  }
  revalidatePath("/app/integraties");
  redirect(succeeded
    ? "/app/integraties?succes=google-verbonden"
    : "/app/integraties?fout=google-verbinding");
}
