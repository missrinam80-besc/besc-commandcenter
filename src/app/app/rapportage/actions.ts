"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActiveMembership } from "@/lib/auth-context";

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
  value: z.coerce.number(),
  target: z.string().optional(),
  unit: z.enum(["number", "percent", "currency", "minutes", "hours", "days"]),
  period_start: optionalDate,
  period_end: optionalDate,
  source: z.string().trim().min(2).max(100),
  source_url: z.string().url().optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional(),
});

const optionalValues = (values: z.infer<typeof kpiSchema>) => ({
  ...values,
  target: values.target ? Number(values.target) : null,
  period_start: values.period_start || null,
  period_end: values.period_end || null,
  source_url: values.source_url || null,
  notes: values.notes || null,
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
    .extend({ id: z.string().uuid() })
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
