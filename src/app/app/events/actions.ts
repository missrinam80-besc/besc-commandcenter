"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActiveMembership } from "@/lib/auth-context";
import { syncLinkedEvent } from "@/lib/linked-calendar-sync";

const schema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(3).max(180),
  description: z.string().trim().max(10000).optional(),
  event_type: z.enum(["community", "workshop", "livestream", "podcast", "lan", "meetup", "tournament", "partner", "charity", "other"]),
  status: z.enum(["idea", "planning", "confirmed", "production", "live", "aftercare", "completed", "cancelled", "archived"]),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  project_id: z.string().uuid().optional().or(z.literal("")),
  start_at: z.string().optional(),
  end_at: z.string().optional(),
  location: z.string().trim().max(250).optional(),
  is_online: z.string().optional(),
  role_besc: z.enum(["organizer", "partner", "promoter", "participant"]),
  drive_url: z.string().url().optional().or(z.literal("")),
  eventbrite_url: z.string().url().optional().or(z.literal("")),
  stream_url: z.string().url().optional().or(z.literal("")),
  expected_attendees: z.coerce.number().int().min(0).optional(),
});

async function manager() {
  const context = await requireActiveMembership();
  if (!["admin", "board"].includes(context.membership.role)) {
    redirect("/app/events?fout=geen-toegang");
  }
  return context;
}

function values(input: z.infer<typeof schema>) {
  return {
    title: input.title,
    description: input.description || null,
    event_type: input.event_type,
    status: input.status,
    priority: input.priority,
    project_id: input.project_id || null,
    start_at: input.start_at ? new Date(input.start_at).toISOString() : null,
    end_at: input.end_at ? new Date(input.end_at).toISOString() : null,
    location: input.location || null,
    is_online: input.is_online === "on",
    role_besc: input.role_besc,
    drive_url: input.drive_url || null,
    eventbrite_url: input.eventbrite_url || null,
    stream_url: input.stream_url || null,
    expected_attendees: input.expected_attendees ?? null,
    updated_at: new Date().toISOString(),
  };
}

export async function saveEvent(formData: FormData) {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/app/events${formData.get("id") ? `/${formData.get("id")}` : ""}?fout=velden`);
  }
  const { supabase, user, membership } = await manager();
  if (parsed.data.id) {
    const { error } = await supabase
      .from("events")
      .update(values(parsed.data))
      .eq("organization_id", membership.organization_id)
      .eq("id", parsed.data.id);
    if (error) redirect(`/app/events/${parsed.data.id}?fout=opslaan`);
    let calendarWarning = false;
    try {
      await syncLinkedEvent({
        supabase,
        organizationId: membership.organization_id,
      }, parsed.data.id);
    } catch {
      calendarWarning = true;
    }
    revalidatePath("/app/events");
    revalidatePath(`/app/events/${parsed.data.id}`);
    redirect(`/app/events/${parsed.data.id}?succes=1${calendarWarning ? "&waarschuwing=kalender-sync" : ""}`);
  }
  const { data, error } = await supabase
    .from("events")
    .insert({
      ...values(parsed.data),
      organization_id: membership.organization_id,
      owner_id: user.id,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !data) redirect("/app/events?nieuw=1&fout=opslaan");
  revalidatePath("/app/events");
  redirect(`/app/events/${data.id}?succes=1`);
}
