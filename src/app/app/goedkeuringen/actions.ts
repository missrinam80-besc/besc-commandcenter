"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActiveMembership } from "@/lib/auth-context";
import { canReviewApproval } from "@/lib/approvals";

const entityType = z.enum(["content", "expense", "partner", "document", "email"]);
const safeHref = z.string().startsWith("/app/").max(500);

async function sourceRecord(
  context: Awaited<ReturnType<typeof requireActiveMembership>>,
  type: z.infer<typeof entityType>,
  id: string,
) {
  const org = context.membership.organization_id;
  if (type === "content") {
    const { data } = await context.supabase.from("content_items").select("id,title").eq("organization_id", org).eq("id", id).is("deleted_at", null).maybeSingle();
    return data ? { title: data.title, module: "content" as const } : null;
  }
  if (type === "expense") {
    const { data } = await context.supabase.from("expenses").select("id,title").eq("organization_id", org).eq("id", id).is("deleted_at", null).maybeSingle();
    return data ? { title: data.title, module: "finance" as const } : null;
  }
  if (type === "partner") {
    const { data } = await context.supabase.from("partners").select("id,name").eq("organization_id", org).eq("id", id).is("deleted_at", null).maybeSingle();
    return data ? { title: `Sponsorafspraak - ${data.name}`, module: "sponsors" as const } : null;
  }
  if (type === "email") {
    const { data } = await context.supabase
      .from("email_communications")
      .select("id,title,created_by,status")
      .eq("organization_id", org)
      .eq("id", id)
      .maybeSingle();
    if (!data || data.created_by !== context.user.id || !["draft", "changes_requested", "failed"].includes(data.status)) return null;
    return { title: data.title, module: "communication" as const };
  }
  const { data } = await context.supabase
    .from("google_resource_links")
    .select("id,name")
    .eq("organization_id", org)
    .eq("id", id)
    .eq("resource_type", "document")
    .maybeSingle();
  return data ? { title: data.name, module: "documents" as const } : null;
}

export async function submitForApproval(formData: FormData) {
  const parsed = z.object({
    entity_type: entityType,
    entity_id: z.string().uuid(),
    source_href: safeHref,
    request_note: z.string().trim().max(4000).optional(),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/goedkeuringen?fout=aanvraag-velden");
  const context = await requireActiveMembership();
  const source = await sourceRecord(context, parsed.data.entity_type, parsed.data.entity_id);
  if (!source) redirect(`${parsed.data.source_href}?fout=goedkeuring-bron`);
  const { data: existing } = await context.supabase
    .from("approval_requests")
    .select("id")
    .eq("organization_id", context.membership.organization_id)
    .eq("entity_type", parsed.data.entity_type)
    .eq("entity_id", parsed.data.entity_id)
    .eq("status", "pending")
    .maybeSingle();
  if (existing) redirect(`${parsed.data.source_href}?fout=goedkeuring-loopt`);
  const { error } = await context.supabase.from("approval_requests").insert({
    organization_id: context.membership.organization_id,
    entity_type: parsed.data.entity_type,
    entity_id: parsed.data.entity_id,
    title: source.title,
    module: source.module,
    source_href: parsed.data.source_href,
    requested_by: context.user.id,
    request_note: parsed.data.request_note || null,
  });
  if (error) redirect(`${parsed.data.source_href}?fout=goedkeuring-opslaan`);

  if (parsed.data.entity_type === "content") {
    await context.supabase.from("content_items").update({ approval_status: "pending", updated_at: new Date().toISOString() }).eq("organization_id", context.membership.organization_id).eq("id", parsed.data.entity_id);
  }
  if (parsed.data.entity_type === "expense") {
    await context.supabase.from("expenses").update({ status: "requested", updated_at: new Date().toISOString() }).eq("organization_id", context.membership.organization_id).eq("id", parsed.data.entity_id).in("status", ["planned", "rejected"]);
  }
  if (parsed.data.entity_type === "email") {
    await context.supabase.from("email_communications").update({
      status: "pending_approval",
      last_error: null,
      updated_at: new Date().toISOString(),
    }).eq("organization_id", context.membership.organization_id)
      .eq("id", parsed.data.entity_id)
      .eq("created_by", context.user.id)
      .in("status", ["draft", "changes_requested", "failed"]);
  }
  revalidatePath("/app/goedkeuringen");
  revalidatePath(parsed.data.source_href);
  redirect(`${parsed.data.source_href}?succes=goedkeuring-aangevraagd`);
}

export async function decideApproval(formData: FormData) {
  const parsed = z.object({
    id: z.string().uuid(),
    decision: z.enum(["approved", "changes_requested", "rejected"]),
    decision_note: z.string().trim().max(4000).optional(),
    return_to: safeHref,
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/goedkeuringen?fout=beslissing-velden");
  if (parsed.data.decision !== "approved" && !parsed.data.decision_note) {
    redirect(`${parsed.data.return_to}?fout=toelichting-verplicht`);
  }
  const context = await requireActiveMembership();
  const { data: request } = await context.supabase
    .from("approval_requests")
    .select("id,entity_type,entity_id,source_href,status,requested_by")
    .eq("organization_id", context.membership.organization_id)
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (!request || request.status !== "pending") redirect(`${parsed.data.return_to}?fout=niet-meer-open`);
  if (!canReviewApproval(context.membership, request.entity_type)) {
    redirect(`${parsed.data.return_to}?fout=geen-toegang`);
  }
  if (request.entity_type === "email" && request.requested_by === context.user.id) {
    redirect(`${parsed.data.return_to}?fout=eigen-email-goedkeuren`);
  }
  const now = new Date().toISOString();
  const { error } = await context.supabase.from("approval_requests").update({
    status: parsed.data.decision,
    decided_by: context.user.id,
    decision_note: parsed.data.decision_note || null,
    decided_at: now,
    updated_at: now,
  }).eq("organization_id", context.membership.organization_id).eq("id", request.id).eq("status", "pending");
  if (error) redirect(`${parsed.data.return_to}?fout=beslissing-opslaan`);

  if (request.entity_type === "content") {
    await context.supabase.from("content_items").update({
      approval_status: parsed.data.decision,
      status: parsed.data.decision === "approved" ? "approved" : "review",
      updated_at: now,
    }).eq("organization_id", context.membership.organization_id).eq("id", request.entity_id);
  } else if (request.entity_type === "expense") {
    const status = parsed.data.decision === "approved" ? "approved" : parsed.data.decision === "rejected" ? "rejected" : "planned";
    await context.supabase.from("expenses").update({
      status,
      approved_by: parsed.data.decision === "approved" ? context.user.id : null,
      approved_at: parsed.data.decision === "approved" ? now : null,
      updated_at: now,
    }).eq("organization_id", context.membership.organization_id).eq("id", request.entity_id);
  } else if (request.entity_type === "partner") {
    const status = parsed.data.decision === "approved" ? "active" : parsed.data.decision === "rejected" ? "rejected" : "proposal";
    await context.supabase.from("partners").update({ status, updated_at: now }).eq("organization_id", context.membership.organization_id).eq("id", request.entity_id);
  } else if (request.entity_type === "email") {
    const status = parsed.data.decision === "approved"
      ? "approved"
      : parsed.data.decision === "rejected" ? "rejected" : "changes_requested";
    await context.supabase.from("email_communications").update({
      status,
      approved_by: parsed.data.decision === "approved" ? context.user.id : null,
      approved_at: parsed.data.decision === "approved" ? now : null,
      updated_at: now,
    }).eq("organization_id", context.membership.organization_id)
      .eq("id", request.entity_id)
      .eq("status", "pending_approval");
  }
  revalidatePath("/app/goedkeuringen");
  revalidatePath(request.source_href);
  redirect(`${parsed.data.return_to}?succes=beslissing`);
}
