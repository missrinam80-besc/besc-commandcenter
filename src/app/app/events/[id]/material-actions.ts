"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth-context";
import { formatDateTimeLocal, localDateTimeToIso } from "@/lib/format";

const optionalId = z.string().uuid().optional().or(z.literal(""));
const localTime = z.string().optional().refine(value => {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return false;
  const stamp = localDateTimeToIso(value);
  return Boolean(stamp && formatDateTimeLocal(stamp) === value);
});
const schema = z.object({
  event_id: z.string().uuid(), id: optionalId, asset_id: optionalId,
  name: z.string().trim().max(180).default(""), quantity: z.coerce.number().int().min(1).max(100000),
  source: z.enum(["own", "borrowed", "rented", "provided"]),
  provider: z.string().trim().max(300).optional(), responsible_person_id: optionalId,
  location: z.string().trim().max(300).optional(), pickup_at: localTime, return_at: localTime,
  status: z.enum(["needed", "arranged", "ready", "in_use", "returned", "cancelled"]),
  notes: z.string().trim().max(2000).optional(),
}).refine(value => value.asset_id || value.name.length >= 2)
  .refine(value => !value.pickup_at || !value.return_at || value.return_at >= value.pickup_at);

function path(id: string) { return `/app/events/${id}`; }
function failed(id: string, code: string, selected?: string): never {
  redirect(`${path(id)}?tab=materialen&fout=materiaal-${code}${selected ? `&materiaal=${selected}` : ""}`);
}
export async function saveEventMaterial(formData: FormData) {
  const eventId = z.string().uuid().safeParse(formData.get("event_id"));
  if (!eventId.success) redirect("/app/events?fout=materiaal-velden");
  const parsed = schema.safeParse(Object.fromEntries(formData));
  const selected = optionalId.safeParse(formData.get("id") ?? "");
  if (!parsed.success) failed(eventId.data, "velden", selected.success && selected.data ? selected.data : "nieuw");
  const { supabase, membership, user } = await requirePermission("manageEvents", `${path(eventId.data)}?tab=materialen&fout=geen-toegang`);
  const { id, event_id, ...data } = parsed.data;
  const values = { ...data, asset_id: data.asset_id || null, responsible_person_id: data.responsible_person_id || null,
    provider: data.provider || null, location: data.location || null, notes: data.notes || null,
    pickup_at: localDateTimeToIso(data.pickup_at), return_at: localDateTimeToIso(data.return_at) };
  const query = id
    ? supabase.from("event_materials").update(values).eq("organization_id", membership.organization_id).eq("event_id", event_id).eq("id", id)
    : supabase.from("event_materials").insert({ ...values, event_id, organization_id: membership.organization_id, created_by: user.id });
  const { data: saved, error } = await query.select("id").maybeSingle();
  if (error || !saved || (id && saved.id !== id)) failed(event_id, "opslaan", id || "nieuw");
  revalidatePath(path(event_id));
  redirect(`${path(event_id)}?tab=materialen&succes=materiaal-opgeslagen`);
}
export async function deleteEventMaterial(formData: FormData) {
  const parsed = z.object({ event_id: z.string().uuid(), id: z.string().uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/events?fout=materiaal-velden");
  const { event_id, id } = parsed.data;
  const { supabase, membership } = await requirePermission("manageEvents", `${path(event_id)}?tab=materialen&fout=geen-toegang`);
  const { data: removed, error } = await supabase.from("event_materials").delete().eq("organization_id", membership.organization_id).eq("event_id", event_id).eq("id", id).select("id").maybeSingle();
  if (error || removed?.id !== id) failed(event_id, "verwijderen");
  revalidatePath(path(event_id));
  redirect(`${path(event_id)}?tab=materialen&succes=materiaal-verwijderd`);
}
