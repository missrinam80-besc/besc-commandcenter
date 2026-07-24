"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActiveMembership } from "@/lib/auth-context";
import { historicalModules } from "./constants";

const assignmentSchema = z.object({
  id: z.string().uuid(),
  suggested_module: z.enum(historicalModules),
  lifecycle: z.enum(["active_or_unknown", "completed", "archived"]),
});
const bulkSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(175) });

async function requireManager() {
  const context = await requireActiveMembership();
  if (!(["admin", "board"] as string[]).includes(context.membership.role)) redirect("/app/historiek?fout=geen-toegang");
  return context;
}

export async function assignHistoricalRecord(formData: FormData) {
  const parsed = assignmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/historiek?fout=velden");

  const { supabase, membership } = await requireManager();
  const { error } = await supabase.from("legacy_records").update({
    suggested_module: parsed.data.suggested_module,
    lifecycle: parsed.data.lifecycle,
    updated_at: new Date().toISOString(),
  }).eq("organization_id", membership.organization_id).eq("id", parsed.data.id).is("deleted_at", null);
  if (error) redirect(`/app/historiek/${parsed.data.id}?fout=opslaan`);
  revalidatePath("/app/historiek");
  revalidatePath(`/app/historiek/${parsed.data.id}`);
  redirect(`/app/historiek/${parsed.data.id}?succes=toegewezen`);
}

export async function bulkAssignHistoricalRecords(formData: FormData) {
  const ids = bulkSchema.safeParse({ ids: formData.getAll("ids") });
  const targetModule = z.enum(historicalModules).safeParse(formData.get("bulk_module"));
  if (!ids.success || !targetModule.success) redirect("/app/historiek?fout=selectie");
  const { supabase, membership } = await requireManager();
  const { error } = await supabase.from("legacy_records").update({ suggested_module: targetModule.data, updated_at: new Date().toISOString() }).eq("organization_id", membership.organization_id).in("id", ids.data.ids).is("converted_at", null).is("deleted_at", null);
  if (error) redirect("/app/historiek?fout=bulk-opslaan");
  revalidatePath("/app/historiek");
  redirect(`/app/historiek?succes=bulk-toegewezen&aantal=${ids.data.ids.length}`);
}

export async function bulkArchiveHistoricalRecords(formData: FormData) {
  const ids = bulkSchema.safeParse({ ids: formData.getAll("ids") });
  if (!ids.success) redirect("/app/historiek?fout=selectie");
  const { supabase, membership } = await requireManager();
  const { error } = await supabase.from("legacy_records").update({ lifecycle: "archived", updated_at: new Date().toISOString() }).eq("organization_id", membership.organization_id).in("id", ids.data.ids).is("converted_at", null).is("deleted_at", null);
  if (error) redirect("/app/historiek?fout=bulk-archiveren");
  revalidatePath("/app/historiek");
  redirect(`/app/historiek?succes=bulk-gearchiveerd&aantal=${ids.data.ids.length}`);
}

export async function convertHistoricalRecord(formData: FormData) {
  const parsed = z.object({
    id: z.string().uuid(), target_table: z.enum(["inbox_items", "tasks", "projects", "content_items", "events", "partners", "campaigns", "community_people", "social_posts"]),
    title: z.string().trim().min(3).max(180), description: z.string().trim().max(5000).optional(),
    priority: z.enum(["low", "normal", "high", "urgent"]), project_id: z.string().uuid().optional().or(z.literal("")),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/app/historiek/${String(formData.get("id"))}?omzetten=1&fout=velden`);
  const { supabase } = await requireManager();
  const operationalTargets=["partners","campaigns","community_people","social_posts"];
  const { data, error } = operationalTargets.includes(parsed.data.target_table) ? await supabase.rpc("convert_legacy_operational",{p_record_id:parsed.data.id,p_target_table:parsed.data.target_table,p_title:parsed.data.title,p_description:parsed.data.description||null,p_priority:parsed.data.priority,p_project_id:parsed.data.target_table==="campaigns"?parsed.data.project_id||null:null}) : parsed.data.target_table === "events" ? await supabase.rpc("convert_legacy_event", {p_record_id:parsed.data.id,p_title:parsed.data.title,p_description:parsed.data.description||null,p_priority:parsed.data.priority,p_project_id:parsed.data.project_id||null}) : await supabase.rpc("convert_legacy_record", {
    p_record_id: parsed.data.id, p_target_table: parsed.data.target_table,
    p_title: parsed.data.title, p_description: parsed.data.description || null,
    p_priority: parsed.data.priority, p_project_id: ["tasks","content_items"].includes(parsed.data.target_table) ? parsed.data.project_id || null : null,
  });
  if (error || !data) redirect(`/app/historiek/${parsed.data.id}?omzetten=1&fout=omzetten`);
  revalidatePath("/app/historiek"); revalidatePath("/app/inbox"); revalidatePath("/app/taken"); revalidatePath("/app/projecten"); revalidatePath("/app/sponsors"); revalidatePath("/app/campagnes"); revalidatePath("/app/community"); revalidatePath("/app/social");
  const destination = parsed.data.target_table === "inbox_items" ? "/app/inbox" : parsed.data.target_table === "tasks" ? `/app/taken/${data}` : parsed.data.target_table === "content_items" ? `/app/content/${data}` : parsed.data.target_table === "events" ? `/app/events/${data}` : parsed.data.target_table === "partners" ? "/app/sponsors" : parsed.data.target_table === "campaigns" ? "/app/campagnes" : parsed.data.target_table === "community_people" ? "/app/community" : parsed.data.target_table === "social_posts" ? "/app/social" : `/app/projecten/${data}`;
  redirect(destination);
}
