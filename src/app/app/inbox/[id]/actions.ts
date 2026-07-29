"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth-context";

const idSchema = z.string().uuid();
const statusSchema = z.enum(["new", "reviewing", "waiting", "processed", "rejected", "archived"]);
const prioritySchema = z.enum(["low", "normal", "high", "urgent"]);

function detailPath(id: string, suffix = "") {
  return `/app/inbox/${id}${suffix}`;
}

export async function updateInboxItem(formData: FormData) {
  const parsed = z.object({
    id: idSchema,
    title: z.string().trim().min(3).max(180),
    description: z.string().trim().max(5000),
    source: z.string().trim().min(2).max(60),
    status: statusSchema,
    priority: prioritySchema,
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/inbox?fout=velden");

  const { id, ...changes } = parsed.data;
  const { supabase, membership } = await requirePermission(
    "manageInbox",
    detailPath(id, "?fout=geen-toegang"),
  );
  const { error } = await supabase
    .from("inbox_items")
    .update({ ...changes, description: changes.description || null })
    .eq("id", id)
    .eq("organization_id", membership.organization_id)
    .is("deleted_at", null);
  if (error) redirect(detailPath(id, "?bewerken=1&fout=opslaan"));

  revalidatePath("/app");
  revalidatePath("/app/inbox");
  revalidatePath(detailPath(id));
  redirect(detailPath(id, "?succes=bijgewerkt"));
}

export async function convertInboxItem(formData: FormData) {
  const parsed = z.object({
    id: idSchema,
    target: z.enum(["task", "project", "campaign"]),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/inbox?fout=velden");

  const { id, target } = parsed.data;
  const { supabase, user, membership } = await requirePermission(
    "manageInbox",
    detailPath(id, "?fout=geen-toegang"),
  );
  const { data: item } = await supabase
    .from("inbox_items")
    .select("id,title,description,priority,status")
    .eq("id", id)
    .eq("organization_id", membership.organization_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!item) redirect("/app/inbox?fout=niet-gevonden");
  if (item.status === "processed") redirect(detailPath(id, "?fout=al-verwerkt"));

  let destination = "/app/inbox";
  let insertError: { message: string } | null = null;

  if (target === "task") {
    const { data, error } = await supabase.from("tasks").insert({
      organization_id: membership.organization_id,
      source_inbox_id: id,
      title: item.title,
      description: item.description,
      priority: item.priority,
      created_by: user.id,
    }).select("id").single();
    insertError = error;
    if (data) destination = `/app/taken/${data.id}`;
  } else if (target === "project") {
    const { data, error } = await supabase.from("projects").insert({
      organization_id: membership.organization_id,
      title: item.title,
      description: item.description,
      priority: item.priority,
      status: "idea",
      owner_id: user.id,
      created_by: user.id,
    }).select("id").single();
    insertError = error;
    if (data) destination = `/app/projecten/${data.id}`;
  } else {
    const { data, error } = await supabase.from("campaigns").insert({
      organization_id: membership.organization_id,
      title: item.title,
      notes: item.description,
      priority: item.priority,
      status: "idea",
      owner_id: user.id,
      created_by: user.id,
    }).select("id").single();
    insertError = error;
    if (data) destination = `/app/campagnes/${data.id}`;
  }

  if (insertError) redirect(detailPath(id, "?fout=omzetten"));
  const { error: updateError } = await supabase
    .from("inbox_items")
    .update({ status: "processed" })
    .eq("id", id)
    .eq("organization_id", membership.organization_id);
  if (updateError) redirect(detailPath(id, "?fout=status-bijwerken"));

  revalidatePath("/app");
  revalidatePath("/app/inbox");
  revalidatePath("/app/taken");
  revalidatePath("/app/projecten");
  revalidatePath("/app/campagnes");
  redirect(`${destination}?succes=vanuit-inbox`);
}

export async function deleteInboxItem(formData: FormData) {
  const parsed = z.object({
    id: idSchema,
    confirmation: z.literal("VERWIJDER"),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/inbox?fout=bevestiging");

  const { supabase, membership } = await requirePermission(
    "manageInbox",
    detailPath(parsed.data.id, "?fout=geen-toegang"),
  );
  const { error } = await supabase
    .from("inbox_items")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", parsed.data.id)
    .eq("organization_id", membership.organization_id)
    .is("deleted_at", null);
  if (error) redirect(detailPath(parsed.data.id, "?fout=verwijderen"));

  revalidatePath("/app");
  revalidatePath("/app/inbox");
  redirect("/app/inbox?succes=verwijderd");
}

export async function archiveInboxItem(formData: FormData) {
  const parsed = z.object({ id: idSchema }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/inbox?fout=velden");

  const { supabase, membership } = await requirePermission(
    "manageInbox",
    detailPath(parsed.data.id, "?fout=geen-toegang"),
  );
  const { error } = await supabase
    .from("inbox_items")
    .update({ status: "archived" })
    .eq("id", parsed.data.id)
    .eq("organization_id", membership.organization_id)
    .eq("status", "processed")
    .is("deleted_at", null);
  if (error) redirect(detailPath(parsed.data.id, "?fout=archiveren"));

  revalidatePath("/app");
  revalidatePath("/app/inbox");
  revalidatePath(detailPath(parsed.data.id));
  redirect("/app/inbox?succes=gearchiveerd");
}
