"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActiveMembership } from "@/lib/auth-context";
import { saveGmailDraft, sendGmailDraft } from "@/lib/google-gmail";
import { isManager } from "@/lib/permissions";
import { unresolvedEmailVariables } from "@/lib/email-templates";

const entityType = z.enum(["partner", "event", "meeting", "project", "campaign"]);
const communicationType = z.enum(["sponsor_follow_up", "event_communication", "invitation", "project_update", "campaign_update"]);
const email = z.string().trim().email();

function emails(value: string) {
  const values = value.split(/[;,]/).map((item) => item.trim()).filter(Boolean);
  if (!values.length || values.length > 25) return null;
  const parsed = z.array(email).safeParse(values);
  return parsed.success ? [...new Set(parsed.data.map((item) => item.toLowerCase()))] : null;
}

function dossierHref(type: z.infer<typeof entityType>, id: string) {
  return type === "partner" ? `/app/sponsors/${id}` : type === "event" ? `/app/events/${id}` : type === "meeting" ? `/app/vergaderingen/${id}` : type === "project" ? `/app/projecten/${id}` : `/app/campagnes/${id}`;
}

async function dossier(
  context: Awaited<ReturnType<typeof requireActiveMembership>>,
  type: z.infer<typeof entityType>,
  id: string,
) {
  const table = type === "partner" ? "partners" : type === "event" ? "events" : type === "meeting" ? "meetings" : type === "project" ? "projects" : "campaigns";
  const titleColumn = type === "partner" ? "name" : "title";
  const { data } = await context.supabase
    .from(table)
    .select(`id,${titleColumn}`)
    .eq("organization_id", context.membership.organization_id)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return null;
  return { title: String(data[titleColumn as keyof typeof data]), href: dossierHref(type, id) };
}

export async function saveEmailCommunication(formData: FormData) {
  const raw = Object.fromEntries(formData);
  const parsed = z.object({
    id: z.string().uuid().optional().or(z.literal("")),
    entity_type: entityType,
    entity_id: z.string().uuid(),
    communication_type: communicationType,
    email_template_id: z.string().uuid().optional().or(z.literal("")),
    title: z.string().trim().min(2).max(240),
    to_addresses: z.string(),
    cc_addresses: z.string().optional(),
    bcc_addresses: z.string().optional(),
    subject: z.string().trim().min(2).max(300),
    body_text: z.string().trim().min(2).max(20000),
    follow_up_date: z.string().optional(),
  }).safeParse(raw);
  if (!parsed.success) redirect("/app/communicatie?fout=velden");
  if (unresolvedEmailVariables(`${parsed.data.subject}\n${parsed.data.body_text}`).length) {
    redirect("/app/communicatie?fout=niet-ingevulde-variabelen");
  }
  const to = emails(parsed.data.to_addresses);
  const cc = parsed.data.cc_addresses ? emails(parsed.data.cc_addresses) : [];
  const bcc = parsed.data.bcc_addresses ? emails(parsed.data.bcc_addresses) : [];
  if (!to || cc === null || bcc === null) redirect("/app/communicatie?fout=emailadressen");

  const context = await requireActiveMembership();
  const source = await dossier(context, parsed.data.entity_type, parsed.data.entity_id);
  if (!source) redirect("/app/communicatie?fout=dossier");
  const now = new Date().toISOString();
  let id = parsed.data.id || null;
  let currentDraftId: string | null = null;

  if (id) {
    const { data: current } = await context.supabase
      .from("email_communications")
      .select("id,created_by,status,gmail_draft_id")
      .eq("organization_id", context.membership.organization_id)
      .eq("id", id)
      .maybeSingle();
    const mayEdit = current && (current.created_by === context.user.id || isManager(context.membership)) &&
      ["draft", "changes_requested", "failed"].includes(current.status);
    if (!mayEdit) redirect(`/app/communicatie/${id}?fout=niet-bewerkbaar`);
    currentDraftId = current.gmail_draft_id;
    const { error } = await context.supabase.from("email_communications").update({
      entity_type: parsed.data.entity_type,
      entity_id: parsed.data.entity_id,
      communication_type: parsed.data.communication_type,
      email_template_id: parsed.data.email_template_id || null,
      title: parsed.data.title,
      to_addresses: to,
      cc_addresses: cc,
      bcc_addresses: bcc,
      subject: parsed.data.subject,
      body_text: parsed.data.body_text,
      follow_up_date: parsed.data.follow_up_date || null,
      status: "draft",
      approved_by: null,
      approved_at: null,
      last_error: null,
      updated_at: now,
    }).eq("organization_id", context.membership.organization_id).eq("id", id);
    if (error) redirect(`/app/communicatie/${id}?fout=opslaan`);
  } else {
    const { data, error } = await context.supabase.from("email_communications").insert({
      organization_id: context.membership.organization_id,
      entity_type: parsed.data.entity_type,
      entity_id: parsed.data.entity_id,
      communication_type: parsed.data.communication_type,
      email_template_id: parsed.data.email_template_id || null,
      title: parsed.data.title,
      to_addresses: to,
      cc_addresses: cc,
      bcc_addresses: bcc,
      subject: parsed.data.subject,
      body_text: parsed.data.body_text,
      follow_up_date: parsed.data.follow_up_date || null,
      created_by: context.user.id,
    }).select("id").single();
    if (error || !data) redirect("/app/communicatie?fout=opslaan");
    id = data.id;
  }

  try {
    const draft = await saveGmailDraft({
      draftId: currentDraftId,
      to,
      cc,
      bcc,
      subject: parsed.data.subject,
      body: parsed.data.body_text,
    });
    await context.supabase.from("email_communications").update({
      gmail_draft_id: draft.id,
      gmail_message_id: draft.message?.id || null,
      gmail_thread_id: draft.message?.threadId || null,
      status: "draft",
      last_error: null,
      updated_at: new Date().toISOString(),
    }).eq("organization_id", context.membership.organization_id).eq("id", id);
  } catch (error) {
    await context.supabase.from("email_communications").update({
      status: "failed",
      last_error: error instanceof Error ? error.message.slice(0, 1500) : "Onbekende Gmail-fout",
      updated_at: new Date().toISOString(),
    }).eq("organization_id", context.membership.organization_id).eq("id", id);
    redirect(`/app/communicatie/${id}?fout=gmail-concept`);
  }
  revalidatePath("/app/communicatie");
  revalidatePath(source.href);
  redirect("/app/communicatie?succes=concept");
}

export async function deleteEmailCommunication(formData: FormData) {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/communicatie?fout=verwijderen");
  const context = await requireActiveMembership();
  const { data: item } = await context.supabase.from("email_communications")
    .select("id,created_by,status").eq("organization_id", context.membership.organization_id)
    .eq("id", parsed.data.id).is("deleted_at", null).maybeSingle();
  const canDelete = item && (item.created_by === context.user.id || isManager(context.membership)) &&
    ["draft", "changes_requested", "failed"].includes(item.status);
  if (!canDelete) redirect(`/app/communicatie/${parsed.data.id}?fout=niet-verwijderbaar`);
  const { error } = await context.supabase.from("email_communications")
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("organization_id", context.membership.organization_id).eq("id", parsed.data.id).is("deleted_at", null);
  if (error) redirect(`/app/communicatie/${parsed.data.id}?fout=verwijderen`);
  revalidatePath("/app/communicatie");
  redirect("/app/communicatie?succes=verwijderd");
}

export async function sendApprovedEmail(formData: FormData) {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/communicatie?fout=verzenden");
  const context = await requireActiveMembership();
  if (!isManager(context.membership)) redirect(`/app/communicatie/${parsed.data.id}?fout=geen-toegang`);
  const { data: message } = await context.supabase
    .from("email_communications")
    .select("*")
    .eq("organization_id", context.membership.organization_id)
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (!message || message.status !== "approved" || !message.gmail_draft_id) {
    redirect(`/app/communicatie/${parsed.data.id}?fout=niet-goedgekeurd`);
  }
  let sent: { id: string; threadId?: string };
  try {
    sent = await sendGmailDraft(message.gmail_draft_id);
  } catch (error) {
    await context.supabase.from("email_communications").update({
      last_error: error instanceof Error ? error.message.slice(0, 1500) : "Onbekende Gmail-fout",
      updated_at: new Date().toISOString(),
    }).eq("organization_id", context.membership.organization_id).eq("id", message.id);
    redirect(`/app/communicatie/${message.id}?fout=gmail-verzenden`);
  }
  const now = new Date().toISOString();
  await context.supabase.from("email_communications").update({
    status: "sent",
    gmail_message_id: sent.id,
    gmail_thread_id: sent.threadId || message.gmail_thread_id,
    sent_by: context.user.id,
    sent_at: now,
    last_error: null,
    updated_at: now,
  }).eq("organization_id", context.membership.organization_id).eq("id", message.id).eq("status", "approved");

  if (message.entity_type === "partner") {
    await context.supabase.from("partner_interactions").insert({
      organization_id: context.membership.organization_id,
      partner_id: message.entity_id,
      interaction_type: "email",
      occurred_at: now,
      summary: `${message.subject}\n\nVerzonden aan: ${message.to_addresses.join(", ")}`,
      next_action: message.follow_up_date ? "E-mail opvolgen" : null,
      follow_up_date: message.follow_up_date,
      created_by: context.user.id,
    });
    await context.supabase.from("partners").update({
      last_contact: now.slice(0, 10),
      next_follow_up: message.follow_up_date,
      updated_at: now,
    }).eq("organization_id", context.membership.organization_id).eq("id", message.entity_id);
  }
  const sourceHref = dossierHref(message.entity_type, message.entity_id);
  revalidatePath("/app/communicatie");
  revalidatePath("/app/goedkeuringen");
  revalidatePath(sourceHref);
  revalidatePath(`/app/communicatie/${message.id}`);
  redirect(`/app/communicatie/${message.id}?succes=verzonden`);
}
