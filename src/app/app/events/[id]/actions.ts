"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth-context";
import {
  ensureEventDriveStructure,
  getGoogleDriveFolder,
  googleDriveFileId,
  completeEventDriveStructure,
} from "@/lib/google-workspace";

const path = (id: string) => `/app/events/${id}`;

async function saveEventDriveLink(input: {
  eventId: string;
  folder: Awaited<ReturnType<typeof getGoogleDriveFolder>>;
  supabase: Awaited<ReturnType<typeof requirePermission>>["supabase"];
  organizationId: string;
  userId: string;
}) {
  const { eventId, folder, supabase, organizationId, userId } = input;
  const webUrl = folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}`;
  const link = {
    organization_id: organizationId,
    entity_type: "event",
    entity_id: eventId,
    resource_type: "folder",
    google_id: folder.id,
    name: folder.name,
    mime_type: folder.mimeType,
    web_url: webUrl,
    drive_id: folder.driveId,
    parent_id: folder.parents[0] ?? null,
    created_by: userId,
    updated_at: new Date().toISOString(),
  };
  const { data: existingLink, error: lookupError } = await supabase
    .from("google_resource_links")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("entity_type", "event")
    .eq("entity_id", eventId)
    .eq("resource_type", "folder")
    .maybeSingle();
  if (lookupError) throw lookupError;
  const { error: linkError } = existingLink
    ? await supabase.from("google_resource_links").update(link).eq("organization_id", organizationId).eq("id", existingLink.id)
    : await supabase.from("google_resource_links").insert(link);
  if (linkError) throw linkError;
  const { error: eventError } = await supabase
    .from("events")
    .update({ drive_url: webUrl })
    .eq("organization_id", organizationId)
    .eq("id", eventId);
  if (eventError) throw eventError;
}

async function eventContext(eventId: string) {
  const context = await requirePermission("manageEvents", `${path(eventId)}?fout=rechten`);
  const { data: event } = await context.supabase
    .from("events")
    .select("id,title,drive_url")
    .eq("organization_id", context.membership.organization_id)
    .eq("id", eventId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!event) redirect(`${path(eventId)}?fout=event`);
  return { ...context, event };
}

export async function createEventFolder(formData: FormData) {
  const parsed = z.object({
    event_id: z.string().uuid(),
    mode: z.enum(["new", "existing"]).default("new"),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/events?fout=drive-velden");
  const context = await eventContext(parsed.data.event_id);
  try {
    const existingId = parsed.data.mode === "existing" && context.event.drive_url
      ? googleDriveFileId(context.event.drive_url)
      : null;
    if (parsed.data.mode === "existing" && !existingId) throw new Error("Ongeldige Drive-maplink.");
    const eventFolder = existingId ? await getGoogleDriveFolder(existingId) : (await ensureEventDriveStructure(context.event.title)).eventFolder;
    await saveEventDriveLink({
      eventId: context.event.id,
      folder: eventFolder,
      supabase: context.supabase,
      organizationId: context.membership.organization_id,
      userId: context.user.id,
    });
  } catch {
    redirect(`${path(context.event.id)}?fout=${parsed.data.mode === "existing" ? "drive-bestaande-link" : "drive-aanmaken"}`);
  }
  revalidatePath(path(context.event.id));
  redirect(`${path(context.event.id)}?succes=drive`);
}

export async function linkEventFolder(formData: FormData) {
  const parsed = z.object({
    event_id: z.string().uuid(),
    drive_folder: z.string().trim().min(10),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/events?fout=drive-velden");
  const fileId = googleDriveFileId(parsed.data.drive_folder);
  if (!fileId) redirect(`${path(parsed.data.event_id)}?fout=drive-link`);
  const context = await eventContext(parsed.data.event_id);
  try {
    const eventFolder = await getGoogleDriveFolder(fileId);
    await saveEventDriveLink({
      eventId: context.event.id,
      folder: eventFolder,
      supabase: context.supabase,
      organizationId: context.membership.organization_id,
      userId: context.user.id,
    });
  } catch {
    redirect(`${path(context.event.id)}?fout=drive-koppelen`);
  }
  revalidatePath(path(context.event.id));
  redirect(`${path(context.event.id)}?succes=drive`);
}

export async function organizeEventFolder(formData: FormData) {
  const parsed = z.object({ event_id: z.string().uuid(), confirm_structure: z.literal("yes"), expected_folder_id: z.string().min(1), expected_missing: z.string().transform((value, ctx) => {
    try { const names: unknown = JSON.parse(value); if (Array.isArray(names) && names.every(name => typeof name === "string")) return names as string[]; } catch {}
    ctx.addIssue({ code: "custom", message: "Controleer eerst het overzicht." }); return z.NEVER;
  }) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/events?fout=drive-velden");
  const context = await eventContext(parsed.data.event_id);
  const { data: link } = await context.supabase
    .from("google_resource_links")
    .select("google_id")
    .eq("organization_id", context.membership.organization_id)
    .eq("entity_type", "event")
    .eq("entity_id", context.event.id)
    .eq("resource_type", "folder")
    .maybeSingle();
  if (!link?.google_id) redirect(`${path(context.event.id)}?fout=drive-ontbreekt`);
  if (link.google_id !== parsed.data.expected_folder_id) redirect(`${path(context.event.id)}?fout=drive-gewijzigd`);
  try {
    const eventFolder = await completeEventDriveStructure(link.google_id, parsed.data.expected_missing);
    await saveEventDriveLink({
      eventId: context.event.id,
      folder: eventFolder,
      supabase: context.supabase,
      organizationId: context.membership.organization_id,
      userId: context.user.id,
    });
  } catch {
    redirect(`${path(context.event.id)}?fout=drive-aanvullen`);
  }
  revalidatePath(path(context.event.id));
  redirect(`${path(context.event.id)}?succes=drive-aangevuld`);
}
