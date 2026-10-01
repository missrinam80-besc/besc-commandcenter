"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth-context";
import {
  createProjectDriveFolder,
  getGoogleDriveFolder,
  googleDriveFileId,
  GoogleApiError,
  moveGoogleDriveFolderToModule,
} from "@/lib/google-workspace";

const path = (id: string) => `/app/projecten/${id}`;

async function saveProjectDriveLink(input: {
  projectId: string;
  folder: Awaited<ReturnType<typeof getGoogleDriveFolder>>;
  supabase: Awaited<ReturnType<typeof requirePermission>>["supabase"];
  organizationId: string;
  userId: string;
}) {
  const { projectId, folder, supabase, organizationId, userId } = input;
  const webUrl = folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}`;
  const link = {
    organization_id: organizationId,
    entity_type: "project",
    entity_id: projectId,
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
    .eq("entity_type", "project")
    .eq("entity_id", projectId)
    .eq("resource_type", "folder")
    .maybeSingle();
  if (lookupError) throw lookupError;
  const { error: linkError } = existingLink
    ? await supabase.from("google_resource_links").update(link).eq("organization_id", organizationId).eq("id", existingLink.id)
    : await supabase.from("google_resource_links").insert(link);
  if (linkError) throw linkError;
  const { error: projectError } = await supabase
    .from("projects")
    .update({ drive_url: webUrl })
    .eq("organization_id", organizationId)
    .eq("id", projectId);
  if (projectError) throw projectError;
}

export async function createProjectFolder(formData: FormData) {
  const parsed = z.object({
    project_id: z.string().uuid(),
    mode: z.enum(["new", "existing"]).default("new"),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/projecten?fout=drive-velden");
  const context = await requirePermission("manageProjects", `${path(parsed.data.project_id)}?fout=rechten`);
  const { data: project } = await context.supabase
    .from("projects")
    .select("id,title,drive_url")
    .eq("organization_id", context.membership.organization_id)
    .eq("id", parsed.data.project_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!project) redirect(`${path(parsed.data.project_id)}?fout=project`);
  try {
    const existingFolderId = parsed.data.mode === "existing" && project.drive_url
      ? googleDriveFileId(project.drive_url)
      : null;
    if (parsed.data.mode === "existing" && !existingFolderId) {
      redirect(`${path(project.id)}?fout=drive-link`);
    }
    const folder = existingFolderId
      ? await getGoogleDriveFolder(existingFolderId)
      : await createProjectDriveFolder(project.title);
    await saveProjectDriveLink({
      projectId: project.id,
      folder,
      supabase: context.supabase,
      organizationId: context.membership.organization_id,
      userId: context.user.id,
    });
  } catch (error) {
    const errorObject = typeof error === "object" && error !== null
      ? error as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown }
      : null;
    console.error("Project Drive folder creation failed", {
      status: error instanceof GoogleApiError ? error.status : undefined,
      message: error instanceof Error
        ? error.message
        : errorObject?.message ? String(errorObject.message) : JSON.stringify(error),
      code: errorObject?.code ? String(errorObject.code) : undefined,
      details: errorObject?.details ? String(errorObject.details) : undefined,
      hint: errorObject?.hint ? String(errorObject.hint) : undefined,
    });
    redirect(`${path(project.id)}?fout=${parsed.data.mode === "existing" ? "drive-bestaande-link" : "drive-aanmaken"}`);
  }
  revalidatePath(path(project.id));
  redirect(`${path(project.id)}?succes=${parsed.data.mode === "existing" ? "drive-geregistreerd" : "drive-aangemaakt"}`);
}

export async function linkProjectFolder(formData: FormData) {
  const parsed = z.object({
    project_id: z.string().uuid(),
    drive_folder: z.string().trim().min(10),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/projecten?fout=drive-velden");
  const fileId = googleDriveFileId(parsed.data.drive_folder);
  if (!fileId) redirect(`${path(parsed.data.project_id)}?fout=drive-link`);
  const context = await requirePermission("manageProjects", `${path(parsed.data.project_id)}?fout=rechten`);
  const { data: project } = await context.supabase
    .from("projects")
    .select("id")
    .eq("organization_id", context.membership.organization_id)
    .eq("id", parsed.data.project_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!project) redirect(`${path(parsed.data.project_id)}?fout=project`);
  try {
    const folder = await getGoogleDriveFolder(fileId);
    await saveProjectDriveLink({
      projectId: project.id,
      folder,
      supabase: context.supabase,
      organizationId: context.membership.organization_id,
      userId: context.user.id,
    });
  } catch {
    redirect(`${path(project.id)}?fout=drive-koppelen`);
  }
  revalidatePath(path(project.id));
  redirect(`${path(project.id)}?succes=drive-gekoppeld`);
}

export async function organizeProjectFolder(formData: FormData) {
  const parsed = z.object({ project_id: z.string().uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/projecten?fout=drive-velden");
  const context = await requirePermission("manageProjects", `${path(parsed.data.project_id)}?fout=rechten`);
  const { data: link } = await context.supabase
    .from("google_resource_links")
    .select("google_id")
    .eq("organization_id", context.membership.organization_id)
    .eq("entity_type", "project")
    .eq("entity_id", parsed.data.project_id)
    .eq("resource_type", "folder")
    .maybeSingle();
  if (!link?.google_id) redirect(`${path(parsed.data.project_id)}?fout=drive-ontbreekt`);
  try {
    const folder = await moveGoogleDriveFolderToModule(link.google_id, "projects");
    await saveProjectDriveLink({
      projectId: parsed.data.project_id,
      folder,
      supabase: context.supabase,
      organizationId: context.membership.organization_id,
      userId: context.user.id,
    });
  } catch {
    redirect(`${path(parsed.data.project_id)}?fout=drive-verplaatsen`);
  }
  revalidatePath(path(parsed.data.project_id));
  redirect(`${path(parsed.data.project_id)}?succes=drive-geordend`);
}

export async function updateProject(formData: FormData) {
  const parsed = z.object({
    id: z.string().uuid(),
    title: z.string().trim().min(3).max(180),
    description: z.string().trim().max(5000).optional(),
    status: z.enum(["idea", "planned", "active", "blocked", "done", "archived"]),
    priority: z.enum(["low", "normal", "high", "urgent"]),
    owner_id: z.string().uuid().optional().or(z.literal("")),
    start_date: z.string().optional(),
    due_date: z.string().optional(),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/projecten?fout=velden");

  const { supabase, user, membership } = await requirePermission(
    "manageProjects",
    `${path(parsed.data.id)}?fout=rechten`,
  );
  const { error } = await supabase
    .from("projects")
    .update({
      ...parsed.data,
      description: parsed.data.description || null,
      owner_id: parsed.data.owner_id || null,
      start_date: parsed.data.start_date || null,
      due_date: parsed.data.due_date || null,
    })
    .eq("organization_id", membership.organization_id)
    .eq("id", parsed.data.id);
  if (error) redirect(`${path(parsed.data.id)}?fout=opslaan`);
  await supabase.from("activity_events").insert({
    organization_id: membership.organization_id,
    entity_type: "project",
    entity_id: parsed.data.id,
    action: "project_updated",
    actor_id: user.id,
  });
  revalidatePath(path(parsed.data.id));
  redirect(`${path(parsed.data.id)}?succes=project`);
}

export async function addMilestone(formData: FormData) {
  const parsed = z.object({
    project_id: z.string().uuid(),
    title: z.string().trim().min(1).max(180),
    due_date: z.string().optional(),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/projecten?fout=mijlpaal");
  const { supabase, user } = await requirePermission(
    "manageProjects",
    `${path(parsed.data.project_id)}?fout=rechten`,
  );
  const { error } = await supabase.from("project_milestones").insert({
    project_id: parsed.data.project_id,
    title: parsed.data.title,
    due_date: parsed.data.due_date || null,
    created_by: user.id,
  });
  if (error) redirect(`${path(parsed.data.project_id)}?fout=mijlpaal`);
  revalidatePath(path(parsed.data.project_id));
}

export async function toggleMilestone(formData: FormData) {
  const parsed = z.object({
    project_id: z.string().uuid(),
    id: z.string().uuid(),
    is_done: z.enum(["true", "false"]),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/projecten?fout=mijlpaal");
  const { supabase } = await requirePermission(
    "manageProjects",
    `${path(parsed.data.project_id)}?fout=rechten`,
  );
  await supabase
    .from("project_milestones")
    .update({ is_done: parsed.data.is_done === "true" })
    .eq("project_id", parsed.data.project_id)
    .eq("id", parsed.data.id);
  revalidatePath(path(parsed.data.project_id));
}

export async function updateMilestone(formData: FormData) {
  const parsed = z.object({
    project_id: z.string().uuid(),
    id: z.string().uuid(),
    title: z.string().trim().min(1).max(180),
    due_date: z.string().optional(),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/projecten?fout=mijlpaal");
  const { supabase } = await requirePermission(
    "manageProjects",
    `${path(parsed.data.project_id)}?fout=rechten`,
  );
  const { error } = await supabase
    .from("project_milestones")
    .update({ title: parsed.data.title, due_date: parsed.data.due_date || null })
    .eq("project_id", parsed.data.project_id)
    .eq("id", parsed.data.id);
  if (error) redirect(`${path(parsed.data.project_id)}?fout=mijlpaal-opslaan`);
  revalidatePath(path(parsed.data.project_id));
  redirect(`${path(parsed.data.project_id)}?succes=mijlpaal`);
}

export async function deleteMilestone(formData: FormData) {
  const parsed = z.object({
    project_id: z.string().uuid(),
    id: z.string().uuid(),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/projecten?fout=mijlpaal");
  const { supabase } = await requirePermission(
    "manageProjects",
    `${path(parsed.data.project_id)}?fout=rechten`,
  );
  const { error } = await supabase
    .from("project_milestones")
    .delete()
    .eq("project_id", parsed.data.project_id)
    .eq("id", parsed.data.id);
  if (error) redirect(`${path(parsed.data.project_id)}?fout=mijlpaal-verwijderen`);
  revalidatePath(path(parsed.data.project_id));
  redirect(`${path(parsed.data.project_id)}?succes=mijlpaal-verwijderd`);
}

export async function setProjectMember(formData: FormData) {
  const parsed = z.object({
    project_id: z.string().uuid(),
    user_id: z.string().uuid(),
    enabled: z.enum(["true", "false"]),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/projecten?fout=team");
  const { supabase } = await requirePermission(
    "manageProjects",
    `${path(parsed.data.project_id)}?fout=rechten`,
  );
  if (parsed.data.enabled === "true") {
    await supabase.from("project_members").upsert({
      project_id: parsed.data.project_id,
      user_id: parsed.data.user_id,
    });
  } else {
    await supabase
      .from("project_members")
      .delete()
      .eq("project_id", parsed.data.project_id)
      .eq("user_id", parsed.data.user_id);
  }
  revalidatePath(path(parsed.data.project_id));
}
