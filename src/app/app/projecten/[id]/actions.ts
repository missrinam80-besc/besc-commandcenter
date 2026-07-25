"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth-context";

const path = (id: string) => `/app/projecten/${id}`;

export async function updateProject(formData: FormData) {
  const parsed = z.object({
    id: z.string().uuid(),
    title: z.string().trim().min(3).max(180),
    description: z.string().trim().max(5000).optional(),
    status: z.enum(["idea", "planned", "active", "blocked", "done", "archived"]),
    priority: z.enum(["low", "normal", "high", "urgent"]),
    start_date: z.string().optional(),
    due_date: z.string().optional(),
    drive_url: z.string().url().optional().or(z.literal("")),
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
      start_date: parsed.data.start_date || null,
      due_date: parsed.data.due_date || null,
      drive_url: parsed.data.drive_url || null,
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
