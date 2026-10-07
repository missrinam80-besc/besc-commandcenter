"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requirePermission } from "@/lib/auth-context";
import {
  dossierEntityConfig,
  dossierEntityTypes,
  dossierPath,
  type DossierEntityType,
} from "@/lib/dossier-relations";
import { getGoogleDriveDocumentMetadata, googleDriveFileId } from "@/lib/google-workspace";

import { sourceObservation } from "@/lib/source-observation";

const entityTypeSchema = z.enum(dossierEntityTypes);
const baseSchema = z.object({
  entity_type: entityTypeSchema,
  entity_id: z.string().uuid(),
});
const linkSchema = baseSchema.extend({
  label: z.string().trim().min(1).max(120),
  url: z.string().trim().url().refine((value) => value.startsWith("https://") || value.startsWith("http://")),
  link_type: z.enum(["reference", "publication", "briefing", "document", "website", "other"]),
});
const relationSchema = baseSchema.extend({
  target: z.string().regex(/^(project|event|campaign|content|partner|community_person|task):[0-9a-f-]{36}$/i),
  relationship_type: z.enum(["related", "part_of", "supports", "sponsor", "participant", "supplier"]),
});

async function context(entityType: DossierEntityType, entityId: string) {
  const config = dossierEntityConfig[entityType];
  const fallback = `${dossierPath(entityType, entityId)}?fout=rechten`;
  return requirePermission(config.capability, fallback);
}

function finish(entityType: DossierEntityType, entityId: string, result: "succes" | "fout", code: string): never {
  revalidatePath(dossierPath(entityType, entityId));
  redirect(`${dossierPath(entityType, entityId)}?${result}=${code}`);
}

async function requireActiveLinkDossier(supabase: SupabaseClient, organizationId: string, entityType: DossierEntityType, entityId: string) {
  const config = dossierEntityConfig[entityType];
  const { data, error } = await supabase.from(config.table).select("id")
    .eq("organization_id", organizationId).eq("id", entityId).is("deleted_at", null).maybeSingle();
  if (error || !data || data.id !== entityId) {
    revalidatePath(config.route);
    redirect(`${config.route}?fout=${error ? "dossier-controleren" : "dossier-niet-beschikbaar"}`);
  }
}

export async function addRecordLink(formData: FormData) {
  const parsed = linkSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app?fout=ongeldige-link");
  const { supabase, user, membership } = await context(parsed.data.entity_type, parsed.data.entity_id);
  await requireActiveLinkDossier(supabase, membership.organization_id, parsed.data.entity_type, parsed.data.entity_id);
  const { error } = await supabase.from("record_links").insert({
    organization_id: membership.organization_id,
    entity_type: parsed.data.entity_type,
    entity_id: parsed.data.entity_id,
    label: parsed.data.label,
    url: parsed.data.url,
    link_type: parsed.data.link_type,
    created_by: user.id,
  });
  finish(parsed.data.entity_type, parsed.data.entity_id, error ? "fout" : "succes", error ? "link-opslaan" : "link-opgeslagen");
}

export async function updateRecordLink(formData: FormData) {
  const parsed = linkSchema.extend({ id: z.string().uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app?fout=ongeldige-link");
  const { supabase, membership } = await context(parsed.data.entity_type, parsed.data.entity_id);
  await requireActiveLinkDossier(supabase, membership.organization_id, parsed.data.entity_type, parsed.data.entity_id);
  const { data: changed, error } = await supabase.from("record_links").update({
    label: parsed.data.label,
    url: parsed.data.url,
    link_type: parsed.data.link_type,
    updated_at: new Date().toISOString(),
  }).eq("organization_id", membership.organization_id)
    .eq("entity_type", parsed.data.entity_type)
    .eq("entity_id", parsed.data.entity_id)
    .eq("id", parsed.data.id).select("id").maybeSingle();
  finish(parsed.data.entity_type, parsed.data.entity_id, error || !changed || changed.id !== parsed.data.id ? "fout" : "succes", error || !changed || changed.id !== parsed.data.id ? "link-opslaan" : "link-opgeslagen");
}

export async function deleteRecordLink(formData: FormData) {
  const parsed = baseSchema.extend({ id: z.string().uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app?fout=ongeldige-link");
  const { supabase, membership } = await context(parsed.data.entity_type, parsed.data.entity_id);
  await requireActiveLinkDossier(supabase, membership.organization_id, parsed.data.entity_type, parsed.data.entity_id);
  const { data: changed, error } = await supabase.from("record_links").delete()
    .eq("organization_id", membership.organization_id)
    .eq("entity_type", parsed.data.entity_type)
    .eq("entity_id", parsed.data.entity_id)
    .eq("id", parsed.data.id).select("id").maybeSingle();
  finish(parsed.data.entity_type, parsed.data.entity_id, error || !changed || changed.id !== parsed.data.id ? "fout" : "succes", error || !changed || changed.id !== parsed.data.id ? "link-verwijderen" : "link-verwijderd");
}

export async function addRecordRelationship(formData: FormData) {
  const parsed = relationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app?fout=ongeldige-relatie");
  const [targetTypeValue, targetId] = parsed.data.target.split(":");
  const targetType = entityTypeSchema.parse(targetTypeValue);
  const { supabase, user, membership } = await context(parsed.data.entity_type, parsed.data.entity_id);
  const sourceConfig = dossierEntityConfig[parsed.data.entity_type];
  const { data: source, error: sourceError } = await supabase.from(sourceConfig.table).select("id")
    .eq("organization_id", membership.organization_id).eq("id", parsed.data.entity_id).is("deleted_at", null).maybeSingle();
  if (sourceError || !source) finish(parsed.data.entity_type, parsed.data.entity_id, "fout", "relatie-bron");
  const targetConfig = dossierEntityConfig[targetType];
  const { data: target, error: targetError } = await supabase.from(targetConfig.table).select("id")
    .eq("organization_id", membership.organization_id).eq("id", targetId).is("deleted_at", null).maybeSingle();
  if (targetError || !target) finish(parsed.data.entity_type, parsed.data.entity_id, "fout", "relatie-doel");

  const left = `${parsed.data.entity_type}:${parsed.data.entity_id}`;
  const right = `${targetType}:${targetId}`;
  const [sourceType, sourceId, finalTargetType, finalTargetId] = left.localeCompare(right) <= 0
    ? [parsed.data.entity_type, parsed.data.entity_id, targetType, targetId]
    : [targetType, targetId, parsed.data.entity_type, parsed.data.entity_id];
  const { error } = await supabase.from("record_relationships").insert({
    organization_id: membership.organization_id,
    source_type: sourceType,
    source_id: sourceId,
    target_type: finalTargetType,
    target_id: finalTargetId,
    relationship_type: parsed.data.relationship_type,
    created_by: user.id,
  });
  finish(parsed.data.entity_type, parsed.data.entity_id, error ? "fout" : "succes", error ? "relatie-opslaan" : "relatie-opgeslagen");
}

export async function deleteRecordRelationship(formData: FormData) {
  const parsed = baseSchema.extend({ id: z.string().uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app?fout=ongeldige-relatie");
  const { supabase, membership } = await context(parsed.data.entity_type, parsed.data.entity_id);
  const { data: changed, error } = await supabase.from("record_relationships").delete()
    .eq("organization_id", membership.organization_id)
    .eq("id", parsed.data.id)
    .or(`and(source_type.eq.${parsed.data.entity_type},source_id.eq.${parsed.data.entity_id}),and(target_type.eq.${parsed.data.entity_type},target_id.eq.${parsed.data.entity_id})`).select("id").maybeSingle();
  finish(parsed.data.entity_type, parsed.data.entity_id, error || !changed || changed.id !== parsed.data.id ? "fout" : "succes", error || !changed || changed.id !== parsed.data.id ? "relatie-verwijderen" : "relatie-verwijderd");
}

export async function addRecordDocument(formData: FormData) {
  const parsed = baseSchema.extend({
    name: z.string().trim().min(1).max(180),
    url: z.string().trim().url(),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app?fout=ongeldig-document");
  if (!["project", "event", "campaign", "partner"].includes(parsed.data.entity_type)) {
    finish(parsed.data.entity_type, parsed.data.entity_id, "fout", "document-module");
  }
  const url = new URL(parsed.data.url);
  if (url.protocol !== "https:" || !["drive.google.com", "docs.google.com"].includes(url.hostname) || url.username || url.password) {
    finish(parsed.data.entity_type, parsed.data.entity_id, "fout", "document-link");
  }
  const googleId = googleDriveFileId(parsed.data.url);
  if (!googleId) finish(parsed.data.entity_type, parsed.data.entity_id, "fout", "document-link");
  const { supabase, user, membership } = await context(parsed.data.entity_type, parsed.data.entity_id);
  const config = dossierEntityConfig[parsed.data.entity_type];
  const { data: dossier, error: dossierError } = await supabase.from(config.table).select("id")
    .eq("organization_id", membership.organization_id).eq("id", parsed.data.entity_id)
    .is("deleted_at", null).maybeSingle();
  if (dossierError || !dossier) finish(parsed.data.entity_type, parsed.data.entity_id, "fout", "document-koppelen");
  let file: Awaited<ReturnType<typeof getGoogleDriveDocumentMetadata>>;
  try {
    file = await getGoogleDriveDocumentMetadata(googleId);
  } catch {
    finish(parsed.data.entity_type, parsed.data.entity_id, "fout", "document-controleren");
  }
  const { error } = await supabase.from("google_resource_links").insert({
    organization_id: membership.organization_id,
    entity_type: parsed.data.entity_type,
    entity_id: parsed.data.entity_id,
    resource_type: "document",
    google_id: file.id,
    name: parsed.data.name,
    mime_type: file.mimeType,
    web_url: file.webViewLink,
    drive_id: file.driveId,
    parent_id: file.parents[0] ?? null,
    ...sourceObservation(file),
    created_by: user.id,
  });
  finish(parsed.data.entity_type, parsed.data.entity_id, error ? "fout" : "succes", error ? "document-koppelen" : "document-gekoppeld");
}

export async function deleteRecordDocument(formData: FormData) {
  const parsed = baseSchema.extend({ id: z.string().uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app?fout=ongeldig-document");
  const { supabase, membership } = await context(parsed.data.entity_type, parsed.data.entity_id);
  const { data: changed, error } = await supabase.from("google_resource_links").delete()
    .eq("organization_id", membership.organization_id)
    .eq("entity_type", parsed.data.entity_type)
    .eq("entity_id", parsed.data.entity_id)
    .eq("resource_type", "document")
    .eq("id", parsed.data.id).select("id").maybeSingle();
  finish(parsed.data.entity_type, parsed.data.entity_id, error || !changed || changed.id !== parsed.data.id ? "fout" : "succes", error || !changed || changed.id !== parsed.data.id ? "document-verwijderen" : "document-verwijderd");
}
