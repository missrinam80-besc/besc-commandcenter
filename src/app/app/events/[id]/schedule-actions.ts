"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth-context";
import { formatDateTimeLocal, localDateTimeToIso } from "@/lib/format";
import {loadManagedChoices} from "@/lib/dossier-choices-server";

const optionalId = z.string().uuid().optional().or(z.literal(""));
const localTime = z.string().optional().refine(value => {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return false;
  const stamp = localDateTimeToIso(value);
  return Boolean(stamp && formatDateTimeLocal(stamp) === value);
});
const schema = z.object({
  event_id: z.string().uuid(), id: optionalId, person_id: optionalId, activity_id: optionalId,
  title: z.string().trim().min(2).max(180),
  kind: z.string().regex(/^[a-z0-9_]{1,80}$/),
  status: z.enum(["draft", "confirmed", "completed", "cancelled"]),
  starts_at: localTime, ends_at: localTime,
  location: z.string().trim().max(300).optional(), notes: z.string().trim().max(4000).optional(),
}).refine(value => !value.ends_at || Boolean(value.starts_at && value.ends_at > value.starts_at));
function path(id: string) { return `/app/events/${id}`; }
function failed(id: string, code: string, selected?: string): never {
  redirect(`${path(id)}?tab=planning&fout=schema-${code}${selected ? `&schema=${selected}` : ""}`);
}
export async function saveEventSchedule(formData: FormData) {
  const eventId = z.string().uuid().safeParse(formData.get("event_id"));
  if (!eventId.success) redirect("/app/events?fout=schema-velden");
  const parsed = schema.safeParse(Object.fromEntries(formData));
  const selected = optionalId.safeParse(formData.get("id") ?? "");
  if (!parsed.success) failed(eventId.data, "velden", selected.success && selected.data ? selected.data : "nieuw");
  const { supabase, membership, user } = await requirePermission("manageEvents", `${path(eventId.data)}?tab=planning&fout=geen-toegang`);
  if(parsed.data.activity_id){const activity=await supabase.from("event_activities").select("id").eq("organization_id",membership.organization_id).eq("event_id",eventId.data).eq("id",parsed.data.activity_id).maybeSingle();if(activity.error||!activity.data)failed(eventId.data,"activiteit",parsed.data.id||"nieuw");}
  let choices;
  try{choices=await loadManagedChoices(supabase,membership.organization_id);}catch{failed(eventId.data,"soorten",parsed.data.id||"nieuw");}
  if(!choices.some(row=>row.set_key==="event_schedule_items.kind"&&row.value===parsed.data.kind))failed(eventId.data,"soort",parsed.data.id||"nieuw");
  const { id, event_id, ...data } = parsed.data;
  const values = { ...data, activity_id:data.activity_id||null, person_id: data.person_id || null, location: data.location || null, notes: data.notes || null,
    starts_at: localDateTimeToIso(data.starts_at), ends_at: localDateTimeToIso(data.ends_at) };
  const query = id
    ? supabase.from("event_schedule_items").update(values).eq("organization_id", membership.organization_id).eq("event_id", event_id).eq("id", id)
    : supabase.from("event_schedule_items").insert({ ...values, event_id, organization_id: membership.organization_id, created_by: user.id });
  const { data: saved, error } = await query.select("id").maybeSingle();
  if (error || !saved || (id && saved.id !== id)) failed(event_id, error?.message==="choice_unavailable"?"soort":"opslaan", id || "nieuw");
  revalidatePath(path(event_id));
  redirect(`${path(event_id)}?tab=planning&succes=schema-opgeslagen`);
}
export async function deleteEventSchedule(formData: FormData) {
  const parsed = z.object({ event_id: z.string().uuid(), id: z.string().uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/events?fout=schema-velden");
  const { event_id, id } = parsed.data;
  const { supabase, membership } = await requirePermission("manageEvents", `${path(event_id)}?tab=planning&fout=geen-toegang`);
  const { data: removed, error } = await supabase.from("event_schedule_items").delete().eq("organization_id", membership.organization_id).eq("event_id", event_id).eq("id", id).select("id").maybeSingle();
  if (error || removed?.id !== id) failed(event_id, "verwijderen");
  revalidatePath(path(event_id));
  redirect(`${path(event_id)}?tab=planning&succes=schema-verwijderd`);
}
