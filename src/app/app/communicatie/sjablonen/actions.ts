"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActiveMembership } from "@/lib/auth-context";
import { isManager } from "@/lib/permissions";
import { newsletterVariants, safeNewsletterImageUrl } from "@/lib/newsletter-html";

const category = z.enum(["sponsor_follow_up", "event_communication", "invitation", "newsletter", "general"]);

export async function saveEmailTemplate(formData: FormData) {
  const parsed = z.object({
    id: z.string().uuid().optional().or(z.literal("")),
    name: z.string().trim().min(2).max(180),
    category,
    entity_type: z.enum(["partner", "event", "meeting"]).optional().or(z.literal("")),
    subject_template: z.string().trim().min(2).max(300),
    body_template: z.string().trim().min(2).max(20000),
    newsletter_variant: z.enum(newsletterVariants).default("besc"),
    default_hero_image_url: z.string().trim().max(2000).optional(),
    default_hero_image_alt: z.string().trim().max(300).optional(),
    is_active: z.string().optional(),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/communicatie/sjablonen?fout=velden");
  if (parsed.data.default_hero_image_url && !safeNewsletterImageUrl(parsed.data.default_hero_image_url)) {
    redirect("/app/communicatie/sjablonen?fout=afbeelding-url");
  }
  const context = await requireActiveMembership();
  if (!isManager(context.membership)) redirect("/app/communicatie/sjablonen?fout=geen-toegang");
  const values = {
    name: parsed.data.name,
    category: parsed.data.category,
    entity_type: parsed.data.category === "newsletter" || parsed.data.category === "general" ? null : parsed.data.entity_type || null,
    subject_template: parsed.data.subject_template,
    body_template: parsed.data.body_template,
    newsletter_variant: parsed.data.newsletter_variant,
    default_hero_image_url: parsed.data.default_hero_image_url || null,
    default_hero_image_alt: parsed.data.default_hero_image_alt || null,
    is_active: Boolean(parsed.data.is_active),
    updated_by: context.user.id,
    updated_at: new Date().toISOString(),
  };
  const query = parsed.data.id
    ? context.supabase.from("email_templates").update(values)
      .eq("organization_id", context.membership.organization_id).eq("id", parsed.data.id)
    : context.supabase.from("email_templates").insert({
      ...values,
      organization_id: context.membership.organization_id,
      created_by: context.user.id,
    });
  const { error } = await query;
  if (error) redirect("/app/communicatie/sjablonen?fout=opslaan");
  revalidatePath("/app/communicatie");
  revalidatePath("/app/communicatie/sjablonen");
  redirect("/app/communicatie/sjablonen?succes=opgeslagen");
}

export async function toggleEmailTemplate(formData: FormData) {
  const parsed = z.object({ id: z.string().uuid(), active: z.enum(["true", "false"]) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/communicatie/sjablonen?fout=status");
  const context = await requireActiveMembership();
  if (!isManager(context.membership)) redirect("/app/communicatie/sjablonen?fout=geen-toegang");
  const { error } = await context.supabase.from("email_templates").update({
    is_active: parsed.data.active !== "true",
    updated_by: context.user.id,
    updated_at: new Date().toISOString(),
  }).eq("organization_id", context.membership.organization_id).eq("id", parsed.data.id);
  if (error) redirect("/app/communicatie/sjablonen?fout=status-opslaan");
  revalidatePath("/app/communicatie/sjablonen");
  redirect("/app/communicatie/sjablonen?succes=status");
}
