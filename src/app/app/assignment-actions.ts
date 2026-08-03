"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth-context";

const assignmentSchema = z.object({
  entity_type: z.enum(["project", "event"]),
  entity_id: z.string().uuid(),
  person_id: z.string().uuid(),
  role_name: z.string().trim().max(180).optional(),
  status: z.enum(["planned", "confirmed", "completed", "cancelled"]).default("planned"),
  starts_at: z.string().optional(),
  notes: z.string().trim().max(2000).optional(),
  return_to: z.string(),
});

function safePath(type: "project" | "event", id: string, candidate: string) {
  const expected = type === "project" ? `/app/projecten/${id}` : `/app/events/${id}`;
  return candidate === expected ? expected : expected;
}

async function manager(type: "project" | "event", path: string) {
  return requirePermission(type === "project" ? "manageProjects" : "manageEvents", `${path}?fout=geen-toegang`);
}

export async function createPersonAssignment(formData: FormData) {
  const parsed = assignmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app?fout=betrokkene-velden");
  const path = safePath(parsed.data.entity_type, parsed.data.entity_id, parsed.data.return_to);
  const { supabase, user, membership } = await manager(parsed.data.entity_type, path);
  const values = {
    organization_id: membership.organization_id,
    person_id: parsed.data.person_id,
    project_id: parsed.data.entity_type === "project" ? parsed.data.entity_id : null,
    event_id: parsed.data.entity_type === "event" ? parsed.data.entity_id : null,
    role_name: parsed.data.role_name || "Betrokkene",
    status: parsed.data.status,
    starts_at: parsed.data.starts_at ? new Date(parsed.data.starts_at).toISOString() : null,
    notes: parsed.data.notes || null,
    created_by: user.id,
  };
  const { error } = await supabase.from("community_assignments").insert(values);
  if (error) redirect(`${path}?fout=betrokkene-opslaan`);
  revalidatePath(path);
  redirect(`${path}?succes=betrokkene`);
}

export async function updatePersonAssignment(formData: FormData) {
  const parsed = assignmentSchema.extend({ id: z.string().uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app?fout=betrokkene-velden");
  const path = safePath(parsed.data.entity_type, parsed.data.entity_id, parsed.data.return_to);
  const { supabase, membership } = await manager(parsed.data.entity_type, path);
  const { error } = await supabase.from("community_assignments").update({
    person_id: parsed.data.person_id,
    role_name: parsed.data.role_name || "Betrokkene",
    status: parsed.data.status,
    starts_at: parsed.data.starts_at ? new Date(parsed.data.starts_at).toISOString() : null,
    notes: parsed.data.notes || null,
  }).eq("organization_id", membership.organization_id).eq("id", parsed.data.id)
    .eq(parsed.data.entity_type === "project" ? "project_id" : "event_id", parsed.data.entity_id);
  if (error) redirect(`${path}?fout=betrokkene-bijwerken`);
  revalidatePath(path);
  redirect(`${path}?succes=betrokkene`);
}

export async function deletePersonAssignment(formData: FormData) {
  const parsed = z.object({ id: z.string().uuid(), entity_type: z.enum(["project", "event"]), entity_id: z.string().uuid(), return_to: z.string() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app?fout=betrokkene-verwijderen");
  const path = safePath(parsed.data.entity_type, parsed.data.entity_id, parsed.data.return_to);
  const { supabase, membership } = await manager(parsed.data.entity_type, path);
  const { error } = await supabase.from("community_assignments").delete().eq("organization_id", membership.organization_id).eq("id", parsed.data.id)
    .eq(parsed.data.entity_type === "project" ? "project_id" : "event_id", parsed.data.entity_id);
  if (error) redirect(`${path}?fout=betrokkene-verwijderen`);
  revalidatePath(path);
  redirect(`${path}?succes=betrokkene-verwijderd`);
}
