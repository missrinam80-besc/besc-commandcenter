"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth-context";

const uuid = z.string().uuid();
const optionalId = uuid.optional().or(z.literal(""));
const settingsSchema = z.object({ event_id: uuid, mode: z.enum(["none", "external", "internal"]),
  capacity: z.preprocess(v => v == null || v === "" ? null : v, z.coerce.number().int().min(1).max(100000).nullable()),
  external_url: z.string().trim().max(2000).optional().or(z.literal("")), notes: z.string().trim().max(4000).optional(),
}).superRefine((v, ctx) => {
  if (v.mode === "external" && !/^https?:\/\//i.test(v.external_url || "")) ctx.addIssue({ code: "custom", path: ["external_url"], message: "Vul een inschrijflink in." });
  if (v.external_url && !z.string().url().safeParse(v.external_url).success) ctx.addIssue({ code: "custom", path: ["external_url"], message: "Ongeldige link." });
});
const entrySchema = z.object({ event_id: uuid, id: optionalId, name: z.string().trim().min(2).max(180),
  quantity: z.coerce.number().int().min(1).max(1000), status: z.enum(["registered", "waitlist", "attended", "cancelled"]), notes: z.string().trim().max(4000).optional(),
});
function path(id: string) { return `/app/events/${id}`; }
function fail(id: string, selected?: string): never { redirect(`${path(id)}?tab=inschrijvingen&fout=inschrijving-opslaan${selected ? `&inschrijving=${selected}` : ""}`); }
async function context(id: string) { return requirePermission("manageEvents", `${path(id)}?tab=inschrijvingen&fout=geen-toegang`); }
function eventId(fd: FormData) { const p = uuid.safeParse(fd.get("event_id")); if (!p.success) redirect("/app/events?fout=velden"); return p.data; }
function done(id: string) { revalidatePath(path(id)); redirect(`${path(id)}?tab=inschrijvingen&succes=inschrijving-opgeslagen`); }
export async function saveRegistrationSettings(fd: FormData) {
  const id = eventId(fd), p = settingsSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) fail(id, "instellingen");
  const { supabase, membership, user } = await context(id);
  const { event_id, ...values } = p.data;
  const { data, error } = await supabase.from("event_registration_settings").upsert({ ...values, external_url: values.external_url || null, notes: values.notes || null, event_id, organization_id: membership.organization_id, updated_by: user.id }, { onConflict: "organization_id,event_id" }).select("event_id").maybeSingle();
  if (error || data?.event_id !== id) fail(id, "instellingen");
  done(id);
}
export async function saveEventRegistration(fd: FormData) {
  const event = eventId(fd), p = entrySchema.safeParse(Object.fromEntries(fd));
  const selected = optionalId.safeParse(fd.get("id") || "");
  if (!p.success) fail(event, selected.success && selected.data ? selected.data : "nieuw");
  const { supabase, membership, user } = await context(event);
  const { id, event_id, ...raw } = p.data, values = { ...raw, notes: raw.notes || null };
  const query = id ? supabase.from("event_registrations").update(values).eq("organization_id", membership.organization_id).eq("event_id", event_id).eq("id", id)
    : supabase.from("event_registrations").insert({ ...values, event_id, organization_id: membership.organization_id, created_by: user.id });
  const { data, error } = await query.select("id").maybeSingle();
  if (error || !data || (id && data.id !== id)) fail(event, id || "nieuw");
  done(event);
}
export async function deleteEventRegistration(fd: FormData) {
  const event = eventId(fd), id = uuid.safeParse(fd.get("id")); if (!id.success) fail(event);
  const { supabase, membership } = await context(event);
  const { data, error } = await supabase.from("event_registrations").delete().eq("organization_id", membership.organization_id).eq("event_id", event).eq("id", id.data).select("id").maybeSingle();
  if (error || data?.id !== id.data) fail(event);
  done(event);
}
