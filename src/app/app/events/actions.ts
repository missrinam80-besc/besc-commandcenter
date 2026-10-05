"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActiveMembership } from "@/lib/auth-context";
import { eventTimingValues } from "@/lib/format";
import { syncLinkedEvent } from "@/lib/linked-calendar-sync";

const schema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().max(180).optional(),
  description: z.string().trim().max(10000).optional(),
  event_type: z.enum(["community", "workshop", "livestream", "podcast", "lan", "meetup", "tournament", "partner", "charity", "other"]),
  status: z.enum(["idea", "planning", "confirmed", "production", "live", "aftercare", "completed", "cancelled", "archived"]),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  project_id: z.string().uuid().optional().or(z.literal("")),
  start_at: z.string().optional(),
  end_at: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  original_start_at: z.string().optional(),
  original_end_at: z.string().optional(),
  location: z.string().trim().max(250).optional(),
  is_online: z.string().optional(),
  role_besc: z.enum(["organizer", "partner", "promoter", "participant"]),
  drive_url: z.string().url().optional().or(z.literal("")),
  eventbrite_url: z.string().url().optional().or(z.literal("")),
  stream_url: z.string().url().optional().or(z.literal("")),
  expected_attendees: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.coerce.number().int().min(0).optional(),
  ),
  cancelled_calendar_action: z.enum(["keep", "remove"]).default("keep"),
}).superRefine((input, context) => {
  try { eventTimingValues(input); } catch {
    context.addIssue({ code: "custom", message: "Controleer de datums en tijden.", path: ["start_date"] });
  }
});

async function manager() {
  const context = await requireActiveMembership();
  if (!["admin", "board"].includes(context.membership.role)) {
    redirect("/app/events?fout=geen-toegang");
  }
  return context;
}

function values(input: z.infer<typeof schema>) {
  const { cancelled_calendar_action: _cancelledCalendarAction, start_time: _startTime, end_time: _endTime, original_start_at: _originalStart, original_end_at: _originalEnd, ...eventInput } = input;
  void _cancelledCalendarAction;
  void _startTime; void _endTime; void _originalStart; void _originalEnd;
  return {
    ...eventInput,
    title: input.title || "Naamloos event",
    description: input.description || null,
    project_id: input.project_id || null,
    ...eventTimingValues(input),
    location: input.location || null,
    is_online: input.is_online === "on",
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
        createdBy: user.id,
      }, parsed.data.id, parsed.data.cancelled_calendar_action);
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

export async function cancelEvent(formData: FormData) {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/events?fout=velden");
  const { supabase, user, membership } = await manager();
  const { error } = await supabase
    .from("events")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("organization_id", membership.organization_id)
    .eq("id", parsed.data.id);
  if (error) redirect(`/app/events/${parsed.data.id}?fout=opslaan`);
  let calendarWarning = false;
  try {
    await syncLinkedEvent({ supabase, organizationId: membership.organization_id, createdBy: user.id }, parsed.data.id, "keep");
  } catch {
    calendarWarning = true;
  }
  revalidatePath("/app/events");
  revalidatePath(`/app/events/${parsed.data.id}`);
  redirect(`/app/events/${parsed.data.id}?succes=geannuleerd${calendarWarning ? "&waarschuwing=kalender-sync" : ""}`);
}
