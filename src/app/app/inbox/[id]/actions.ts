"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {hasPermission} from "@/lib/permissions";
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
    target: z.enum([
      "task", "project", "content", "event", "campaign", "social",
      "volunteer", "sponsor", "meeting", "knowledge", "product", "launch", "expense",
    ]),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/inbox?fout=velden");

  const { id, target } = parsed.data;
  const { supabase, user, membership } = await requirePermission(
    "manageInbox",
    detailPath(id, "?fout=geen-toegang"),
  );
  if(target==="expense"){
    if(!hasPermission(membership,"manageFinance"))redirect(detailPath(id,"?fout=geen-financiele-toegang"));
    const result=await supabase.rpc("convert_expense_intake",{p_org:membership.organization_id,p_id:id});
    if(result.error||!result.data)redirect(detailPath(id,"?fout=kost-omzetten"));
    revalidatePath("/app/inbox");revalidatePath(detailPath(id));revalidatePath("/app/financien");
    redirect(`/app/financien/kosten/${result.data}?succes=omgezet`);
  }
  const { data: item } = await supabase
    .from("inbox_items")
    .select("id,title,description,priority,status,source")
    .eq("id", id)
    .eq("organization_id", membership.organization_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!item) redirect("/app/inbox?fout=niet-gevonden");
  if(item.source==="expense_submission")redirect(detailPath(id,"?fout=kost-kies-kostenitem"));
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
  } else if (target === "campaign") {
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
  } else if (target === "content") {
    const { data, error } = await supabase.from("content_items").insert({
      organization_id: membership.organization_id,
      title: item.title,
      description: item.description,
      content_type: "idea",
      status: "idea",
      priority: item.priority,
      owner_id: user.id,
      created_by: user.id,
    }).select("id").single();
    insertError = error;
    if (data) destination = `/app/content/${data.id}`;
  } else if (target === "event") {
    const { data, error } = await supabase.from("events").insert({
      organization_id: membership.organization_id,
      title: item.title,
      description: item.description,
      event_type: "other",
      status: "idea",
      priority: item.priority,
      owner_id: user.id,
      created_by: user.id,
    }).select("id").single();
    insertError = error;
    if (data) destination = `/app/events/${data.id}`;
  } else if (target === "social") {
    const { data, error } = await supabase.from("social_posts").insert({
      organization_id: membership.organization_id,
      title: item.title,
      copy: item.description,
      platform: "Discord",
      post_type: "publication",
      status: "idea",
      owner_id: user.id,
      created_by: user.id,
    }).select("id").single();
    insertError = error;
    if (data) destination = `/app/social/${data.id}`;
  } else if (target === "volunteer") {
    const { data, error } = await supabase.from("community_people").insert({
      organization_id: membership.organization_id,
      display_name: item.title,
      person_type: "volunteer",
      status: "candidate",
      notes: item.description,
      owner_id: user.id,
      created_by: user.id,
    }).select("id").single();
    insertError = error;
    if (data) destination = `/app/community/${data.id}`;
  } else if (target === "sponsor") {
    const { data, error } = await supabase.from("partners").insert({
      organization_id: membership.organization_id,
      name: item.title,
      partner_type: "sponsor",
      status: "prospect",
      priority: item.priority,
      notes: item.description,
      owner_id: user.id,
      created_by: user.id,
    }).select("id").single();
    insertError = error;
    if (data) destination = `/app/sponsors/${data.id}`;
  } else if (target === "meeting") {
    const { data, error } = await supabase.from("meetings").insert({
      organization_id: membership.organization_id,
      title: item.title,
      meeting_type: "other",
      status: "planned",
      notes: item.description,
      created_by: user.id,
    }).select("id").single();
    insertError = error;
    if (data) destination = `/app/vergaderingen/${data.id}`;
  } else if (target === "knowledge") {
    const { data, error } = await supabase.from("knowledge_articles").insert({
      organization_id: membership.organization_id,
      title: item.title,
      summary: item.description,
      body: item.description,
      article_type: "other",
      status: "draft",
      owner_id: user.id,
      created_by: user.id,
    }).select("id").single();
    insertError = error;
    if (data) destination = `/app/kennisbank/${data.id}`;
  } else if (target === "product") {
    const { data, error } = await supabase.from("shop_products").insert({
      organization_id: membership.organization_id,
      name: item.title,
      product_type: "other",
      status: "idea",
      description: item.description,
      owner_id: user.id,
      created_by: user.id,
    }).select("id").single();
    insertError = error;
    if (data) destination = `/app/shop/producten/${data.id}`;
  } else {
    const { data, error } = await supabase.from("merch_launches").insert({
      organization_id: membership.organization_id,
      title: item.title,
      status: "idea",
      description: item.description,
      owner_id: user.id,
      created_by: user.id,
    }).select("id").single();
    insertError = error;
    if (data) destination = `/app/shop/lanceringen/${data.id}`;
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
  revalidatePath("/app/content");
  revalidatePath("/app/events");
  revalidatePath("/app/social");
  revalidatePath("/app/community");
  revalidatePath("/app/sponsors");
  revalidatePath("/app/vergaderingen");
  revalidatePath("/app/kennisbank");
  revalidatePath("/app/shop");
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
