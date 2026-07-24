"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActiveMembership } from "@/lib/auth-context";

const optionalUrl = z.string().url().optional().or(z.literal(""));
const optionalUuid = z.string().uuid().optional().or(z.literal(""));

async function requireBoardManager() {
  const context = await requireActiveMembership();
  if (!["admin", "board"].includes(context.membership.role)) {
    redirect("/app/administratie?fout=geen-toegang");
  }
  return context;
}

const clean = <T extends Record<string, unknown>>(values: T) =>
  Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, value === "" ? null : value]),
  );

export async function saveAssociationMember(formData: FormData) {
  const parsed = z
    .object({
      member_number: z.string().trim().max(80).optional(),
      full_name: z.string().trim().min(2).max(180),
      email: z.string().email().optional().or(z.literal("")),
      membership_type: z.enum(["effective", "adherent", "honorary", "volunteer"]),
      status: z.enum(["candidate", "active", "suspended", "former", "deceased"]),
      joined_on: z.string().optional(),
      left_on: z.string().optional(),
      voting_right: z.string().optional(),
      address: z.string().trim().max(1000).optional(),
      notes: z.string().max(10000).optional(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/administratie?nieuw=lid&fout=velden");

  const { supabase, user, membership } = await requireBoardManager();
  const { voting_right, ...raw } = parsed.data;
  const { error } = await supabase.from("association_members").insert({
    ...clean(raw),
    voting_right: voting_right === "on",
    organization_id: membership.organization_id,
    created_by: user.id,
  });
  if (error) redirect("/app/administratie?nieuw=lid&fout=opslaan");
  revalidatePath("/app/administratie");
  redirect("/app/administratie?succes=lid");
}

export async function saveAdministrativeDocument(formData: FormData) {
  const parsed = z
    .object({
      title: z.string().trim().min(2).max(180),
      document_type: z.enum([
        "articles",
        "incorporation",
        "official_gazette",
        "kbo",
        "ubo",
        "vat",
        "minutes",
        "annual_accounts",
        "budget",
        "insurance",
        "contract",
        "subsidy",
        "policy",
        "register",
        "other",
      ]),
      status: z.enum(["draft", "active", "expiring", "expired", "archived"]),
      document_date: z.string().optional(),
      valid_from: z.string().optional(),
      valid_until: z.string().optional(),
      reference_number: z.string().trim().max(180).optional(),
      drive_url: optionalUrl,
      confidential: z.string().optional(),
      notes: z.string().max(10000).optional(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/administratie?nieuw=document&fout=velden");

  const { supabase, user, membership } = await requireBoardManager();
  const { confidential, ...raw } = parsed.data;
  const { error } = await supabase.from("administrative_documents").insert({
    ...clean(raw),
    confidential: confidential === "on",
    organization_id: membership.organization_id,
    created_by: user.id,
  });
  if (error) redirect("/app/administratie?nieuw=document&fout=opslaan");
  revalidatePath("/app/administratie");
  redirect("/app/administratie?succes=document");
}

export async function saveGovernanceMandate(formData: FormData) {
  const parsed = z
    .object({
      member_id: z.string().uuid(),
      role: z.enum([
        "chair",
        "vice_chair",
        "secretary",
        "treasurer",
        "director",
        "daily_management",
        "other",
      ]),
      role_label: z.string().trim().max(180).optional(),
      status: z.enum(["planned", "active", "ended"]),
      start_date: z.string().min(10),
      end_date: z.string().optional(),
      appointment_document_url: optionalUrl,
      notes: z.string().max(10000).optional(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/administratie?nieuw=mandaat&fout=velden");

  const { supabase, user, membership } = await requireBoardManager();
  const { error } = await supabase.from("governance_mandates").insert({
    ...clean(parsed.data),
    organization_id: membership.organization_id,
    created_by: user.id,
  });
  if (error) redirect("/app/administratie?nieuw=mandaat&fout=opslaan");
  revalidatePath("/app/administratie");
  redirect("/app/administratie?succes=mandaat");
}

export async function saveComplianceDeadline(formData: FormData) {
  const parsed = z
    .object({
      title: z.string().trim().min(2).max(180),
      category: z.enum([
        "general_assembly",
        "board",
        "finance",
        "kbo",
        "ubo",
        "tax",
        "insurance",
        "subsidy",
        "publication",
        "contract",
        "other",
      ]),
      due_date: z.string().min(10),
      recurrence: z.enum(["once", "monthly", "quarterly", "yearly"]),
      status: z.enum(["open", "planned", "completed", "cancelled", "not_applicable"]),
      responsible_id: optionalUuid,
      document_id: optionalUuid,
      notes: z.string().max(10000).optional(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/administratie?nieuw=deadline&fout=velden");

  const { supabase, user, membership } = await requireBoardManager();
  const { error } = await supabase.from("compliance_deadlines").insert({
    ...clean(parsed.data),
    organization_id: membership.organization_id,
    created_by: user.id,
  });
  if (error) redirect("/app/administratie?nieuw=deadline&fout=opslaan");
  revalidatePath("/app/administratie");
  redirect("/app/administratie?succes=deadline");
}

export async function completeComplianceDeadline(formData: FormData) {
  const parsed = z
    .object({ id: z.string().uuid() })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/administratie?fout=velden");
  const { supabase, membership } = await requireBoardManager();
  const { error } = await supabase
    .from("compliance_deadlines")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", membership.organization_id)
    .eq("id", parsed.data.id);
  if (error) redirect("/app/administratie?fout=afronden");
  revalidatePath("/app/administratie");
  redirect("/app/administratie?succes=afgerond");
}
