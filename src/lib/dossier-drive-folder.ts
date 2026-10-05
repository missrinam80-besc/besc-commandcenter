import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureGoogleDriveEntityFolder, getGoogleDriveFolder, googleDriveFileId, type GoogleDriveModule } from "@/lib/google-workspace";

export async function resolveDossierDriveFolder(input: {
  supabase: SupabaseClient;
  organizationId: string;
  userId: string;
  entityType: "meeting" | "partner" | "event";
  entityId: string;
  module: GoogleDriveModule;
  title: string;
  legacyDriveUrl?: string | null;
}) {
  const { data: link, error } = await input.supabase.from("google_resource_links").select("id,google_id")
    .eq("organization_id", input.organizationId).eq("entity_type", input.entityType)
    .eq("entity_id", input.entityId).eq("resource_type", "folder").maybeSingle();
  if (error) throw error;
  const legacyId = input.legacyDriveUrl ? googleDriveFileId(input.legacyDriveUrl) : null;
  if (input.legacyDriveUrl && !legacyId) throw new Error("Controleer de bestaande dossiermaplink.");
  if (link && (!link.google_id || (legacyId && legacyId !== link.google_id))) {
    throw new Error("De dossiermapverwijzingen komen niet overeen.");
  }
  if (link) return getGoogleDriveFolder(link.google_id);
  const folder = legacyId
    ? await getGoogleDriveFolder(legacyId)
    : await ensureGoogleDriveEntityFolder(input.module, input.title);
  const { error: saveError } = await input.supabase.from("google_resource_links").insert({
    organization_id: input.organizationId, entity_type: input.entityType, entity_id: input.entityId,
    resource_type: "folder", google_id: folder.id, name: folder.name, mime_type: folder.mimeType,
    web_url: folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}`,
    drive_id: folder.driveId, parent_id: folder.parents[0] ?? null, created_by: input.userId,
  });
  if (saveError) throw saveError;
  return folder;
}
