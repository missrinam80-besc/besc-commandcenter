"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth-context";

const optionalId = z.string().uuid().optional().or(z.literal(""));
const optionalCount = z.preprocess(value => value == null || (typeof value === "string" && !value.trim()) ? null : value,
  z.coerce.number().int().min(0).max(100000).nullable());
const schema = z.object({
  event_id: z.string().uuid(), id: optionalId,
  name: z.string().trim().min(2).max(180), quantity_planned: z.coerce.number().int().min(1).max(100000),
  quantity_received: optionalCount, quantity_distributed: optionalCount,
  source: z.enum(["own", "supplied", "purchased"]),
  provider: z.string().trim().max(300).optional(), person_id: optionalId,
  status: z.enum(["needed", "arranged", "received", "distributing", "completed", "cancelled"]),
  notes: z.string().trim().max(4000).optional(),
}).refine(value => value.quantity_distributed === null || value.quantity_distributed === 0 ||
  (value.quantity_received !== null && value.quantity_distributed <= value.quantity_received));

function path(id: string) { return `/app/events/${id}`; }
function failed(id: string, code: string, selected?: string): never {
  redirect(`${path(id)}?tab=giveaways&fout=giveaway-${code}${selected ? `&giveaway=${selected}` : ""}`);
}
export async function saveEventGiveaway(formData: FormData) {
  const eventId = z.string().uuid().safeParse(formData.get("event_id"));
  if (!eventId.success) redirect("/app/events?fout=giveaway-velden");
  const parsed = schema.safeParse(Object.fromEntries(formData));
  const selected = optionalId.safeParse(formData.get("id") ?? "");
  if (!parsed.success) failed(eventId.data, "velden", selected.success && selected.data ? selected.data : "nieuw");
  const { supabase, membership, user } = await requirePermission("manageEvents", `${path(eventId.data)}?tab=giveaways&fout=geen-toegang`);
  const { id, event_id, person_id, ...data } = parsed.data;
  const values = { ...data, responsible_person_id: person_id || null, provider: data.provider || null, notes: data.notes || null };
  const query = id
    ? supabase.from("event_giveaways").update(values).eq("organization_id", membership.organization_id).eq("event_id", event_id).eq("id", id)
    : supabase.from("event_giveaways").insert({ ...values, event_id, organization_id: membership.organization_id, created_by: user.id });
  const { data: saved, error } = await query.select("id").maybeSingle();
  if (error || !saved || (id && saved.id !== id)) failed(event_id, "opslaan", id || "nieuw");
  revalidatePath(path(event_id));
  redirect(`${path(event_id)}?tab=giveaways&succes=giveaway-opgeslagen`);
}
export async function deleteEventGiveaway(formData: FormData) {
  const parsed = z.object({ event_id: z.string().uuid(), id: z.string().uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/events?fout=giveaway-velden");
  const { event_id, id } = parsed.data;
  const { supabase, membership } = await requirePermission("manageEvents", `${path(event_id)}?tab=giveaways&fout=geen-toegang`);
  const { data: removed, error } = await supabase.from("event_giveaways").delete().eq("organization_id", membership.organization_id).eq("event_id", event_id).eq("id", id).select("id").maybeSingle();
  if (error || removed?.id !== id) failed(event_id, "verwijderen");
  revalidatePath(path(event_id));
  redirect(`${path(event_id)}?tab=giveaways&succes=giveaway-verwijderd`);
}
