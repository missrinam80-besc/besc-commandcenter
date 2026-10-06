"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActiveMembership, requirePermission } from "@/lib/auth-context";
import { isSupabaseConfigured } from "@/lib/supabase/configured";
import { dossierEntityTypes } from "@/lib/dossier-relations";
import { projectOutcomeShape } from "@/lib/project-outcomes";
import { localDateTimeToIso } from "@/lib/format";

const baseSchema = z.object({ title: z.string().trim().max(180).optional(), description: z.string().trim().max(5000).optional() });
const priority = z.enum(["low", "normal", "high", "urgent"]).optional().default("normal");
function unavailable(path: string): never { redirect(`${path}?fout=supabase`); }

export async function createInboxItem(formData: FormData) {
  if (!isSupabaseConfigured()) unavailable("/app/inbox");
  const parsed = baseSchema.extend({ source: z.string().trim().max(60).optional(), priority }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/inbox?nieuw=1&fout=velden");
  const { supabase, user, membership } = await requireActiveMembership();
  if (!["admin", "board", "member"].includes(membership.role)) redirect("/app/inbox?fout=geen-toegang");
  const { error } = await supabase.from("inbox_items").insert({ ...parsed.data, title: parsed.data.title || "Naamloos inboxitem", source: parsed.data.source || "Handmatig", organization_id: membership.organization_id, created_by: user.id });
  if (error) redirect("/app/inbox?nieuw=1&fout=opslaan");
  revalidatePath("/app"); revalidatePath("/app/inbox"); redirect("/app/inbox?succes=aangemaakt");
}

export async function createTask(formData: FormData) {
  if (!isSupabaseConfigured()) unavailable("/app/taken");
  const parsed = baseSchema.extend({ priority, due_at: z.string().optional(), project_id: z.string().uuid().optional().or(z.literal("")), assignee_id: z.string().uuid().optional().or(z.literal("")), checklist: z.string().max(5000).optional(), context_entity_type: z.enum(dossierEntityTypes).optional(), context_entity_id: z.string().uuid().optional().or(z.literal("")), return_to: z.string().optional() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/taken?nieuw=1&fout=velden");
  const { supabase, user, membership } = await requireActiveMembership();
  const { data: task, error } = await supabase.from("tasks").insert({ title: parsed.data.title || "Naamloze taak", description: parsed.data.description, priority: parsed.data.priority, due_at: localDateTimeToIso(parsed.data.due_at), project_id: parsed.data.project_id || null, organization_id: membership.organization_id, created_by: user.id }).select("id").single();
  if (error || !task) redirect("/app/taken?nieuw=1&fout=opslaan");
  if (parsed.data.assignee_id) {
    const { data: assignee } = await supabase.from("organization_members").select("user_id").eq("organization_id", membership.organization_id).eq("user_id", parsed.data.assignee_id).eq("status", "active").maybeSingle();
    if (assignee) await supabase.from("task_assignees").insert({ task_id: task.id, user_id: assignee.user_id });
  }
  const checklistItems = (parsed.data.checklist ?? "").split(/\r?\n/).map((item) => item.trim().replace(/^[-*]\s*/, "")).filter(Boolean);
  if (checklistItems.length) await supabase.from("task_checklist_items").insert(checklistItems.map((title, position) => ({ task_id: task.id, title, position, created_by: user.id })));
  if (parsed.data.context_entity_type && parsed.data.context_entity_id && parsed.data.context_entity_type !== "task") {
    const left = `${parsed.data.context_entity_type}:${parsed.data.context_entity_id}`;
    const right = `task:${task.id}`;
    const [sourceType, sourceId, targetType, targetId] = left.localeCompare(right) <= 0 ? [parsed.data.context_entity_type, parsed.data.context_entity_id, "task", task.id] : ["task", task.id, parsed.data.context_entity_type, parsed.data.context_entity_id];
    await supabase.from("record_relationships").insert({ organization_id: membership.organization_id, source_type: sourceType, source_id: sourceId, target_type: targetType, target_id: targetId, relationship_type: "related", created_by: user.id });
  }
  const returnTo = parsed.data.return_to && /^\/app\/(projecten|events|campagnes|content|sponsors|community)\/[0-9a-f-]{36}$/i.test(parsed.data.return_to) ? parsed.data.return_to : "/app/taken";
  revalidatePath("/app"); revalidatePath("/app/taken"); if (parsed.data.project_id) revalidatePath(`/app/projecten/${parsed.data.project_id}`); redirect(`${returnTo}?succes=taak-aangemaakt`);
}

export async function createProject(formData: FormData) {
  if (!isSupabaseConfigured()) unavailable("/app/projecten");
  const parsed = baseSchema.extend({ ...projectOutcomeShape, priority, start_date: z.string().optional(), due_date: z.string().optional(), drive_url: z.string().url().optional().or(z.literal("")) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/projecten?nieuw=1&fout=velden");
  const { supabase, user, membership } = await requirePermission("manageProjects", "/app/projecten?fout=geen-toegang");
  const { data, error } = await supabase.from("projects").insert({ ...parsed.data, title: parsed.data.title || "Naamloos project", start_date: parsed.data.start_date || null, due_date: parsed.data.due_date || null, drive_url: parsed.data.drive_url || null, organization_id: membership.organization_id, owner_id: user.id, created_by: user.id, status: "planned" }).select("id").single();
  if (error || !data) redirect("/app/projecten?nieuw=1&fout=opslaan");
  revalidatePath("/app"); revalidatePath("/app/projecten"); redirect("/app/projecten?succes=aangemaakt");
}

export async function updateTaskStatus(formData: FormData) {
  if (!isSupabaseConfigured()) unavailable("/app/taken");
  const parsed = z.object({ id: z.string().uuid(), status: z.enum(["todo","doing","waiting","review","done","cancelled"]), return_to: z.string().optional() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/taken?fout=velden");
  const { supabase, membership } = await requireActiveMembership();
  const { data, error } = await supabase.from("tasks").update({ status: parsed.data.status, completed_at: parsed.data.status === "done" ? new Date().toISOString() : null }).eq("id", parsed.data.id).eq("organization_id", membership.organization_id).is("deleted_at", null).select("id").maybeSingle();
  if (error || !data) redirect("/app/taken?fout=opslaan");
  revalidatePath("/app"); revalidatePath("/app/taken");
  if (parsed.data.return_to?.startsWith("/app/projecten/")) { revalidatePath(parsed.data.return_to); redirect(parsed.data.return_to); }
}

export async function convertInboxToTask(formData: FormData) {
  if (!isSupabaseConfigured()) unavailable("/app/inbox");
  const parsed = z.object({ id: z.string().uuid(), title: z.string().min(3) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/inbox?fout=velden");
  const { supabase, user, membership } = await requirePermission("manageInbox", "/app/inbox?fout=geen-toegang");
  const { data: task, error } = await supabase.from("tasks").insert({ title: parsed.data.title, source_inbox_id: parsed.data.id, organization_id: membership.organization_id, created_by: user.id }).select("id").single();
  if (error || !task) redirect("/app/inbox?fout=omzetten");
  await supabase.from("inbox_items").update({ status: "processed" }).eq("id", parsed.data.id).eq("organization_id", membership.organization_id);
  revalidatePath("/app"); revalidatePath("/app/inbox"); revalidatePath("/app/taken"); redirect("/app/inbox?succes=omgezet");
}
