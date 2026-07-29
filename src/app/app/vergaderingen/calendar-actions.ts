"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth-context";
import { syncGoogleCalendarMeeting } from "@/lib/google-workspace";

export async function syncMeetingToGoogleCalendar(formData: FormData) {
  const parsed = z.object({ meeting_id: z.string().uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/vergaderingen?fout=kalender-velden");
  const path = `/app/vergaderingen/${parsed.data.meeting_id}`;
  const context = await requirePermission("manageOrganization", `${path}?fout=geen-toegang`);
  const [{ data: meeting }, { data: existing }] = await Promise.all([
    context.supabase
      .from("meetings")
      .select("*")
      .eq("organization_id", context.membership.organization_id)
      .eq("id", parsed.data.meeting_id)
      .is("deleted_at", null)
      .maybeSingle(),
    context.supabase
      .from("google_resource_links")
      .select("google_id")
      .eq("organization_id", context.membership.organization_id)
      .eq("entity_type", "meeting")
      .eq("entity_id", parsed.data.meeting_id)
      .eq("resource_type", "calendar_event")
      .maybeSingle(),
  ]);
  if (!meeting) redirect("/app/vergaderingen?fout=niet-gevonden");
  if (!meeting.meeting_at || !meeting.ends_at) redirect(`${path}?fout=kalender-tijden`);
  let operation: "created" | "updated";
  try {
    const result = await syncGoogleCalendarMeeting({
      id: meeting.id,
      organizationId: context.membership.organization_id,
      title: meeting.title,
      meetingType: meeting.meeting_type,
      startAt: meeting.meeting_at,
      endAt: meeting.ends_at,
      attendees: meeting.attendees ?? [],
      minutesUrl: meeting.minutes_url,
    }, existing?.google_id);
    operation = result.operation;
    const { error } = await context.supabase.from("google_resource_links").upsert({
      organization_id: context.membership.organization_id,
      entity_type: "meeting",
      entity_id: meeting.id,
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
