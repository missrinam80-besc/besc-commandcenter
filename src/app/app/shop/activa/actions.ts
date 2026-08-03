"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth-context";

const optionalUuid = z.string().uuid().optional().or(z.literal(""));
const optionalMoney = z.preprocess((value) => value === "" ? undefined : value, z.coerce.number().min(0).optional());
const schema = z.object({
  id: z.string().uuid().optional().or(z.literal("")), name: z.string().trim().max(180).optional(),
  asset_type: z.enum(["equipment","computer","streaming","furniture","software","vehicle","other"]),
  status: z.enum(["planned","active","maintenance","loaned","retired","lost","archived"]),
  serial_number: z.string().trim().max(180).optional(), owner_person_id: optionalUuid, location: z.string().trim().max(300).optional(),
  acquired_date: z.string().optional(), purchase_value: optionalMoney, current_value: optionalMoney,
  supplier_id: optionalUuid, project_id: optionalUuid, event_id: optionalUuid, campaign_id: optionalUuid,
  document_url: z.string().url().optional().or(z.literal("")), notes: z.string().trim().max(10000).optional(),
});

export async function saveAsset(formData: FormData) {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/shop/activa?fout=velden");
  const { supabase, user, membership } = await requirePermission("manageOrganization", "/app/shop/activa?fout=geen-toegang");
  const { id, ...data } = parsed.data;
  const values = { ...data, name: data.name || "Naamloos actief", serial_number: data.serial_number || null, owner_person_id: data.owner_person_id || null, location: data.location || null, acquired_date: data.acquired_date || null, purchase_value: data.purchase_value ?? null, current_value: data.current_value ?? null, supplier_id: data.supplier_id || null, project_id: data.project_id || null, event_id: data.event_id || null, campaign_id: data.campaign_id || null, document_url: data.document_url || null, notes: data.notes || null, updated_at: new Date().toISOString() };
  const result = id ? await supabase.from("assets").update(values).eq("organization_id", membership.organization_id).eq("id", id).is("deleted_at", null) : await supabase.from("assets").insert({ ...values, organization_id: membership.organization_id, created_by: user.id });
  if (result.error) redirect("/app/shop/activa?fout=opslaan");
  revalidatePath("/app/shop/activa"); redirect("/app/shop/activa?succes=opgeslagen");
}

export async function removeAsset(formData: FormData) {
  const parsed = z.object({ id: z.string().uuid(), mode: z.enum(["archive","delete"]) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/shop/activa?fout=verwijderen");
  const { supabase, membership } = await requirePermission("manageOrganization", "/app/shop/activa?fout=geen-toegang");
  const values = parsed.data.mode === "archive" ? { status: "archived", updated_at: new Date().toISOString() } : { deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  const { error } = await supabase.from("assets").update(values).eq("organization_id", membership.organization_id).eq("id", parsed.data.id).is("deleted_at", null);
  if (error) redirect("/app/shop/activa?fout=verwijderen");
  revalidatePath("/app/shop/activa"); redirect("/app/shop/activa?succes=verwijderd");
}
