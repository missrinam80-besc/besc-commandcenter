"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth-context";
import { syncGoogleCalendarEvent } from "@/lib/google-workspace";

const schema = z.object({ event_id: z.string().uuid() });

export async function syncEventToGoogleCalendar(formData: FormData) {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/events?fout=kalender-velden");
  const path = `/app/events/${parsed.data.event_id}`;
  const context = await requirePermission("manageEvents", `${path}?fout=geen-toegang`);
  const [{ data: event }, { data: existing }] = await Promise.all([
    context.supabase
      .from("events")
      .select("*")
      .eq("organization_id", context.membership.organization_id)
      .eq("id", parsed.data.event_id)
      .is("deleted_at", null)
      .maybeSingle(),
    context.supabase
      .from("google_resource_links")
      .select("google_id")
      .eq("organization_id", context.membership.organization_id)
      .eq("entity_type", "event")
      .eq("entity_id", parsed.data.event_id)
      .eq("resource_type", "calendar_event")
      .maybeSingle(),
  ]);
  if (!event) redirect("/app/events?fout=niet-gevonden");
  if (!event.start_at || !event.end_at) redirect(`${path}?fout=kalender-tijden`);
  let operation: "created" | "updated";
  try {
    const result = await syncGoogleCalendarEvent({
      id: event.id,
      organizationId: context.membership.organization_id,
      title: event.title,
      description: event.description,
      startAt: event.start_at,
      endAt: event.end_at,
      location: event.location,
      isOnline: event.is_online,
      roleBesc: event.role_besc,
      driveUrl: event.drive_url,
      eventbriteUrl: event.eventbrite_url,
      streamUrl: event.stream_url,
    }, existing?.google_id);
    operation = result.operation;
    const { error } = await context.supabase.from("google_resource_links").upsert({
      organization_id: context.membership.organization_id,
      entity_type: "event",
      entity_id: event.id,
      resource_type: "calendar_event",
      google_id: result.id,
      name: result.name,
      mime_type: "application/vnd.google.calendar.event",
      web_url: result.webUrl,
      drive_id: null,
      parent_id: null,
      created_by: context.user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: "organization_id,entity_type,entity_id,resource_type" });
    if (error) throw error;
  } catch (error) {
    if (error instanceof Error && error.message.includes("eindtijd")) {
      redirect(`${path}?fout=kalender-tijden`);
    }
    redirect(`${path}?fout=kalender-sync`);
  }
  revalidatePath(path);
  redirect(`${path}?succes=kalender-${operation}`);
}
