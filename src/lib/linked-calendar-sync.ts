import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deleteGoogleCalendarEvent,
  syncGoogleCalendarEvent,
  syncGoogleCalendarMeeting,
} from "@/lib/google-workspace";

type SyncContext = {
  supabase: SupabaseClient;
  organizationId: string;
};

export type CancelledCalendarAction = "keep" | "remove";

async function updateLink(
  context: SyncContext,
  entityType: "event" | "meeting",
  entityId: string,
  result: { id: string; name: string; webUrl: string },
) {
  const { error } = await context.supabase
    .from("google_resource_links")
    .update({
      google_id: result.id,
      name: result.name,
      web_url: result.webUrl,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", context.organizationId)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .eq("resource_type", "calendar_event");
  if (error) throw error;
}

export async function syncLinkedEvent(
  context: SyncContext,
  eventId: string,
  cancelledAction: CancelledCalendarAction = "keep",
) {
  const [{ data: event }, { data: link }] = await Promise.all([
    context.supabase
      .from("events")
      .select("*")
      .eq("organization_id", context.organizationId)
      .eq("id", eventId)
      .is("deleted_at", null)
      .maybeSingle(),
    context.supabase
      .from("google_resource_links")
      .select("google_id,name")
      .eq("organization_id", context.organizationId)
      .eq("entity_type", "event")
      .eq("entity_id", eventId)
      .eq("resource_type", "calendar_event")
      .maybeSingle(),
  ]);
  if (!event || !link) return false;
  if (event.status === "cancelled" && cancelledAction === "remove") {
    await deleteGoogleCalendarEvent(link.google_id);
    const { error } = await context.supabase
      .from("google_resource_links")
      .update({
        name: `[VERWIJDERD] ${event.title}`,
        web_url: "https://calendar.google.com/calendar/u/0/r",
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", context.organizationId)
      .eq("entity_type", "event")
      .eq("entity_id", eventId)
      .eq("resource_type", "calendar_event");
    if (error) throw error;
    return true;
  }
  const result = await syncGoogleCalendarEvent({
    id: event.id,
    organizationId: context.organizationId,
    title: event.title,
    status: event.status,
    description: event.description,
    startAt: event.start_at,
    endAt: event.end_at,
    location: event.location,
    isOnline: event.is_online,
    roleBesc: event.role_besc,
    driveUrl: event.drive_url,
    eventbriteUrl: event.eventbrite_url,
    streamUrl: event.stream_url,
  }, link.google_id);
  await updateLink(context, "event", eventId, result);
  return true;
}

export async function syncLinkedMeeting(
  context: SyncContext,
  meetingId: string,
  cancelledAction: CancelledCalendarAction = "keep",
) {
  const [{ data: meeting }, { data: link }] = await Promise.all([
    context.supabase
      .from("meetings")
      .select("*")
      .eq("organization_id", context.organizationId)
      .eq("id", meetingId)
      .is("deleted_at", null)
      .maybeSingle(),
    context.supabase
      .from("google_resource_links")
      .select("google_id,name")
      .eq("organization_id", context.organizationId)
      .eq("entity_type", "meeting")
      .eq("entity_id", meetingId)
      .eq("resource_type", "calendar_event")
      .maybeSingle(),
  ]);
  if (!meeting || !link) return false;
  if (meeting.status === "cancelled" && cancelledAction === "remove") {
    await deleteGoogleCalendarEvent(link.google_id);
    const { error } = await context.supabase
      .from("google_resource_links")
      .update({
        name: `[VERWIJDERD] ${meeting.title}`,
        web_url: "https://calendar.google.com/calendar/u/0/r",
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", context.organizationId)
      .eq("entity_type", "meeting")
      .eq("entity_id", meetingId)
      .eq("resource_type", "calendar_event");
    if (error) throw error;
    return true;
  }
  const result = await syncGoogleCalendarMeeting({
    id: meeting.id,
    organizationId: context.organizationId,
    title: meeting.title,
    status: meeting.status,
    meetingType: meeting.meeting_type,
    startAt: meeting.meeting_at,
    endAt: meeting.ends_at,
    attendees: meeting.attendees ?? [],
    minutesUrl: meeting.minutes_url,
  }, link.google_id);
  await updateLink(context, "meeting", meetingId, result);
  return true;
}
