"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActiveMembership } from "@/lib/auth-context";

const optionalNumber = z.preprocess((value) => {
  if (value == null || (typeof value === "string" && value.trim() === "")) return null;
  return typeof value === "string" ? Number(value) : value;
}, z.number().finite().nullable());
const optionalDate = z.string().date().optional().or(z.literal(""));
const kpiSchema = z.object({
  name: z.string().trim().min(2).max(180),
  domain: z.enum([
    "community",
    "content",
    "social",
    "events",
    "campaigns",
    "sponsors",
    "website",
    "finance",
    "other",
  ]),
  metric: z.string().trim().min(2).max(100),
  value: optionalNumber,
  target: optionalNumber,
  measurement_status: z.enum(["measured", "missing"]).default("measured"),
  target_direction: z.enum(["unknown", "higher", "lower"]).default("unknown"),
  unit: z.enum(["number", "percent", "currency", "minutes", "hours", "days"]),
  period_start: optionalDate,
  period_end: optionalDate,
  source: z.string().trim().min(2).max(100),
  collection_method: z.enum(["manual", "imported", "api"]),
  source_url: z.string().url().optional().or(z.literal("")),
  metric_definition: z.string().trim().max(1000).optional(),
  notes: z.string().trim().max(2000).optional(),
  project_id: z.string().uuid().optional().or(z.literal("")),
  campaign_id: z.string().uuid().optional().or(z.literal("")),
  event_id: z.string().uuid().optional().or(z.literal("")),
  content_id: z.string().uuid().optional().or(z.literal("")),
  partner_id: z.string().uuid().optional().or(z.literal("")),
  task_id: z.string().uuid().optional().or(z.literal("")),
  community_person_id: z.string().uuid().optional().or(z.literal("")),
  social_post_id: z.string().uuid().optional().or(z.literal("")),
}).superRefine((values, context) => {
  if ((values.measurement_status === "measured") !== (values.value !== null)) {
    context.addIssue({ code: "custom", path: ["value"], message: "Vul een meetwaarde in of kies Ontbrekende meting." });
  }
});

const optionalValues = (values: z.infer<typeof kpiSchema>) => ({
  ...values,
  target: values.target,
  period_start: values.period_start || null,
  period_end: values.period_end || null,
  source_url: values.source_url || null,
  metric_definition: values.metric_definition || null,
  notes: values.notes || null,
  project_id: values.project_id || null,
  campaign_id: values.campaign_id || null,
  event_id: values.event_id || null,
  content_id: values.content_id || null,
  partner_id: values.partner_id || null,
  task_id: values.task_id || null,
  community_person_id: values.community_person_id || null,
  social_post_id: values.social_post_id || null,
});

export async function saveKpi(formData: FormData) {
  const parsed = kpiSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/rapportage?fout=velden");
  const { supabase, user, membership } = await requireActiveMembership();
  if (!["admin", "board"].includes(membership.role)) {
    redirect("/app/rapportage?fout=rechten");
  }
  const { error } = await supabase.from("kpi_records").insert({
    organization_id: membership.organization_id,
    ...optionalValues(parsed.data),
    created_by: user.id,
  });
  if (error) redirect("/app/rapportage?fout=opslaan");
  revalidatePath("/app/rapportage");
  redirect("/app/rapportage?succes=1");
}

export async function updateKpi(formData: FormData) {
  const parsed = kpiSchema
    .safeExtend({ id: z.string().uuid() })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/rapportage?fout=velden");
  const { supabase, membership } = await requireActiveMembership();
  if (!["admin", "board"].includes(membership.role)) {
    redirect("/app/rapportage?fout=rechten");
  }
  const { id, ...values } = parsed.data;
  const { error } = await supabase
    .from("kpi_records")
    .update(optionalValues(values))
    .eq("organization_id", membership.organization_id)
    .eq("id", id)
    .is("deleted_at", null);
  if (error) redirect(`/app/rapportage/${id}?fout=opslaan`);
  revalidatePath("/app/rapportage");
  revalidatePath(`/app/rapportage/${id}`);
  redirect(`/app/rapportage/${id}?succes=1`);
}

export async function deleteKpi(formData: FormData) {
  const parsed = z
    .object({ id: z.string().uuid(), confirmation: z.literal("VERWIJDER") })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/rapportage?fout=bevestiging");
  const { supabase, membership } = await requireActiveMembership();
  if (!["admin", "board"].includes(membership.role)) {
    redirect("/app/rapportage?fout=rechten");
  }
  const { error } = await supabase
    .from("kpi_records")
    .update({ deleted_at: new Date().toISOString() })
    .eq("organization_id", membership.organization_id)
    .eq("id", parsed.data.id)
    .is("deleted_at", null);
  if (error) redirect(`/app/rapportage/${parsed.data.id}?fout=verwijderen`);
  revalidatePath("/app/rapportage");
  redirect("/app/rapportage?succes=verwijderd");
}
