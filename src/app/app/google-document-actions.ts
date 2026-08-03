"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth-context";
import {
  createDocumentFromGoogleTemplate,
  ensureEventDriveStructure,
  ensureGoogleDriveEntityFolder,
  googleDriveFileId,
} from "@/lib/google-workspace";

type Context = Awaited<ReturnType<typeof requirePermission>>;
type GeneratedDocument = Awaited<ReturnType<typeof createDocumentFromGoogleTemplate>>;

function displayDate(value: string | null | undefined, withTime = false) {
  if (!value) return "Niet ingevuld";
  return new Intl.DateTimeFormat("nl-BE", withTime
    ? { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Brussels" }
    : { dateStyle: "long", timeZone: "Europe/Brussels" }).format(new Date(value));
}

async function saveDocumentMetadata(input: {
  context: Context;
  entityType: "meeting" | "partner" | "event";
  entityId: string;
  document: GeneratedDocument;
}) {
  const { context, entityType, entityId, document } = input;
  const { error } = await context.supabase.from("google_resource_links").insert({
    organization_id: context.membership.organization_id,
    entity_type: entityType,
    entity_id: entityId,
    resource_type: "document",
    google_id: document.id,
    name: document.name,
    mime_type: document.mimeType,
    web_url: document.webViewLink,
    drive_id: document.driveId,
    parent_id: document.parents[0] ?? null,
    created_by: context.user.id,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function generateMeetingMinutes(formData: FormData) {
  const parsed = z.object({ meeting_id: z.string().uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/vergaderingen?fout=document");
  const path = `/app/vergaderingen/${parsed.data.meeting_id}`;
  const context = await requirePermission("manageOrganization", `${path}?fout=rechten`);
  const [{ data: meeting }, { data: actions }] = await Promise.all([
    context.supabase.from("meetings").select("*").eq("organization_id", context.membership.organization_id).eq("id", parsed.data.meeting_id).is("deleted_at", null).maybeSingle(),
    context.supabase.from("meeting_action_items").select("title,assignee_text,status").eq("organization_id", context.membership.organization_id).eq("meeting_id", parsed.data.meeting_id).order("created_at"),
  ]);
  if (!meeting) redirect(`${path}?fout=document`);
  try {
    const folder = await ensureGoogleDriveEntityFolder("meetings", meeting.title);
    const document = await createDocumentFromGoogleTemplate({
      template: "minutes",
      name: `Notulen - ${meeting.title}`,
      parentId: folder.id,
      replacements: {
        TITEL: meeting.title,
        DATUM: displayDate(meeting.meeting_at, true),
        TYPE: meeting.meeting_type,
        DEELNEMERS: (meeting.attendees ?? []).join(", "),
        NOTITIES: meeting.notes,
        BESLUITEN: meeting.decisions,
        ACTIEPUNTEN: (actions ?? []).map((item, index) => `${index + 1}. ${item.title}${item.assignee_text ? ` — ${item.assignee_text}` : ""} (${item.status})`).join("\n"),
      },
    });
    await saveDocumentMetadata({ context, entityType: "meeting", entityId: meeting.id, document });
    await context.supabase.from("meetings").update({ minutes_url: document.webViewLink, updated_at: new Date().toISOString() }).eq("organization_id", context.membership.organization_id).eq("id", meeting.id);
  } catch {
    redirect(`${path}?fout=document-genereren`);
  }
  revalidatePath(path);
  redirect(`${path}?succes=document`);
}

export async function generateSponsorReport(formData: FormData) {
  const parsed = z.object({ partner_id: z.string().uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/sponsors?fout=document");
  const path = `/app/sponsors/${parsed.data.partner_id}`;
  const context = await requirePermission("manageOrganization", `${path}?fout=rechten`);
  const [{ data: partner }, { data: campaigns }] = await Promise.all([
    context.supabase.from("partners").select("*").eq("organization_id", context.membership.organization_id).eq("id", parsed.data.partner_id).is("deleted_at", null).maybeSingle(),
    context.supabase.from("campaigns").select("title,status,start_date,end_date,value,deliverables").eq("organization_id", context.membership.organization_id).eq("partner_id", parsed.data.partner_id).is("deleted_at", null).order("start_date"),
  ]);
  if (!partner) redirect(`${path}?fout=document`);
  try {
    const folder = await ensureGoogleDriveEntityFolder("sponsors", partner.name);
    const document = await createDocumentFromGoogleTemplate({
      template: "sponsorReport",
      name: `Sponsorrapport - ${partner.name}`,
      parentId: folder.id,
      replacements: {
        SPONSOR: partner.name,
        DATUM: displayDate(new Date().toISOString()),
        TYPE: partner.partner_type,
        STATUS: partner.status,
        CONTACTPERSOON: partner.contact_name,
        EMAIL: partner.email,
        WEBSITE: partner.website,
        SAMENWERKING: partner.collaboration_type,
        GESCHATTE_WAARDE: partner.estimated_value == null ? null : `€ ${Number(partner.estimated_value).toFixed(2)}`,
        NOTITIES: partner.notes,
        CAMPAGNES: (campaigns ?? []).map((item) => `${item.title} — ${item.status}${item.value == null ? "" : ` — € ${Number(item.value).toFixed(2)}`}`).join("\n"),
      },
    });
    await saveDocumentMetadata({ context, entityType: "partner", entityId: partner.id, document });
  } catch {
    redirect(`${path}?fout=document-genereren`);
  }
  revalidatePath(path);
  redirect(`${path}?succes=document`);
}

export async function generateEventDossier(formData: FormData) {
  const parsed = z.object({ event_id: z.string().uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/events?fout=document");
  const path = `/app/events/${parsed.data.event_id}`;
  const context = await requirePermission("manageEvents", `${path}?fout=rechten`);
  const { data: event } = await context.supabase.from("events").select("*").eq("organization_id", context.membership.organization_id).eq("id", parsed.data.event_id).is("deleted_at", null).maybeSingle();
  if (!event) redirect(`${path}?fout=document`);
  try {
    const existingId = event.drive_url ? googleDriveFileId(event.drive_url) : null;
    const { eventFolder } = await ensureEventDriveStructure(event.title, existingId ?? undefined);
    const document = await createDocumentFromGoogleTemplate({
      template: "event",
      name: `Eventdossier - ${event.title}`,
      parentId: eventFolder.id,
      replacements: {
        EVENT: event.title,
        DATUM: displayDate(new Date().toISOString()),
        TYPE: event.event_type,
        STATUS: event.status,
        START: displayDate(event.start_at, true),
        EINDE: displayDate(event.end_at, true),
        LOCATIE: event.is_online ? "Online" : event.location,
        ROL_BESC: event.role_besc,
        BESCHRIJVING: event.description,
        VERWACHTE_DEELNEMERS: event.expected_attendees,
      },
    });
    await saveDocumentMetadata({ context, entityType: "event", entityId: event.id, document });
  } catch {
    redirect(`${path}?fout=document-genereren`);
  }
  revalidatePath(path);
  redirect(`${path}?succes=document`);
}
