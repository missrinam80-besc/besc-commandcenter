"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActiveMembership } from "@/lib/auth-context";

const optionalUuid = z.string().uuid().optional().or(z.literal(""));
const optionalUrl = z.string().url().optional().or(z.literal(""));
const optionalAmount = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.coerce.number().min(0).optional(),
);

async function requireFinanceManager() {
  const context = await requireActiveMembership();
  const mayManage =
    ["admin", "board"].includes(context.membership.role) ||
    ["approver", "treasurer"].includes(context.membership.finance_role);
  if (!mayManage) redirect("/app/financien/documenten?fout=geen-toegang");
  return context;
}

export async function saveFinancialDocument(formData: FormData) {
  const parsed = z
    .object({
      title: z.string().trim().min(2).max(180),
      document_type: z.enum([
        "invoice",
        "receipt",
        "credit_note",
        "bank_statement",
        "contract",
        "subsidy",
        "declaration",
        "other",
      ]),
      document_date: z.string().optional(),
      fiscal_year: z.coerce.number().int().min(2000).max(2200),
      status: z.enum(["missing", "linked", "verified", "archived"]),
      drive_url: optionalUrl,
      document_number: z.string().trim().max(180).optional(),
      counterparty: z.string().trim().max(180).optional(),
      amount: optionalAmount,
      expense_id: optionalUuid,
      income_id: optionalUuid,
      budget_id: optionalUuid,
      notes: z.string().max(10000).optional(),
    })
    .safeParse(Object.fromEntries(formData));

  if (!parsed.success || (parsed.data.status !== "missing" && !parsed.data.drive_url)) {
    redirect("/app/financien/documenten?nieuw=1&fout=velden");
  }

  const { supabase, user, membership } = await requireFinanceManager();
  const values = {
    ...parsed.data,
    document_date: parsed.data.document_date || null,
    drive_url: parsed.data.drive_url || null,
    document_number: parsed.data.document_number || null,
    counterparty: parsed.data.counterparty || null,
    amount: parsed.data.amount ?? null,
    expense_id: parsed.data.expense_id || null,
    income_id: parsed.data.income_id || null,
    budget_id: parsed.data.budget_id || null,
    notes: parsed.data.notes || null,
    organization_id: membership.organization_id,
    created_by: user.id,
  };
  const { error } = await supabase.from("financial_documents").insert(values);
  if (error) redirect("/app/financien/documenten?nieuw=1&fout=opslaan");
  revalidatePath("/app/financien/documenten");
  redirect("/app/financien/documenten?succes=aangemaakt");
}

export async function verifyFinancialDocument(formData: FormData) {
  const parsed = z
    .object({ id: z.string().uuid(), year: z.coerce.number().int().min(2000).max(2200) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/financien/documenten?fout=velden");
  const { supabase, user, membership } = await requireFinanceManager();
  const { error } = await supabase
    .from("financial_documents")
    .update({
      status: "verified",
      verified_by: user.id,
      verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", membership.organization_id)
    .eq("id", parsed.data.id)
    .neq("status", "missing");
  if (error) redirect(`/app/financien/documenten?jaar=${parsed.data.year}&fout=verificatie`);
  revalidatePath("/app/financien/documenten");
  redirect(`/app/financien/documenten?jaar=${parsed.data.year}&succes=geverifieerd`);
}
