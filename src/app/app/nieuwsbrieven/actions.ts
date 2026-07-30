"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActiveMembership } from "@/lib/auth-context";
import { googleGmailConfiguration, saveGmailDraft, sendGmailDraft } from "@/lib/google-gmail";
import { isManager } from "@/lib/permissions";
import { unresolvedEmailVariables } from "@/lib/email-templates";

function managerPath(context: Awaited<ReturnType<typeof requireActiveMembership>>, path: string) {
  if (!isManager(context.membership)) redirect(`${path}?fout=geen-toegang`);
}

export async function saveMailingList(formData: FormData) {
  const parsed = z.object({
    id: z.string().uuid().optional().or(z.literal("")),
    name: z.string().trim().min(2).max(180),
    description: z.string().trim().max(4000).optional(),
    status: z.enum(["active", "paused", "archived"]),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/nieuwsbrieven?fout=lijst-velden");
  const context = await requireActiveMembership();
  managerPath(context, "/app/nieuwsbrieven");
  const values = {
    name: parsed.data.name,
    description: parsed.data.description || null,
    status: parsed.data.status,
    updated_at: new Date().toISOString(),
  };
  const result = parsed.data.id
    ? await context.supabase.from("mailing_lists").update(values).eq("organization_id", context.membership.organization_id).eq("id", parsed.data.id)
    : await context.supabase.from("mailing_lists").insert({ ...values, organization_id: context.membership.organization_id, created_by: context.user.id });
  if (result.error) redirect("/app/nieuwsbrieven?fout=lijst-opslaan");
  revalidatePath("/app/nieuwsbrieven");
  redirect("/app/nieuwsbrieven?succes=lijst");
}

export async function saveSubscriber(formData: FormData) {
  const parsed = z.object({
    id: z.string().uuid().optional().or(z.literal("")),
    mailing_list_id: z.string().uuid(),
    email: z.string().trim().email().max(320),
    display_name: z.string().trim().max(180).optional(),
    status: z.enum(["subscribed", "unsubscribed", "bounced"]),
    source: z.enum(["manual", "import", "form", "event", "partner", "community"]),
    consent_basis: z.enum(["consent", "existing_relationship", "legitimate_interest", "internal"]),
    notes: z.string().trim().max(4000).optional(),
  }).safeParse(Object.fromEntries(formData));
  const listId = String(formData.get("mailing_list_id") ?? "");
  if (!parsed.success) redirect(`/app/nieuwsbrieven/lijsten/${listId}?fout=abonnee-velden`);
  const context = await requireActiveMembership();
  const path = `/app/nieuwsbrieven/lijsten/${parsed.data.mailing_list_id}`;
  managerPath(context, path);
  const now = new Date().toISOString();
  const values = {
    email: parsed.data.email.toLowerCase(),
    display_name: parsed.data.display_name || null,
    status: parsed.data.status,
    source: parsed.data.source,
    consent_basis: parsed.data.consent_basis,
    consent_at: parsed.data.status === "subscribed" ? now : null,
    unsubscribed_at: parsed.data.status === "unsubscribed" ? now : null,
    notes: parsed.data.notes || null,
    updated_at: now,
  };
  const result = parsed.data.id
    ? await context.supabase.from("mailing_subscribers").update(values).eq("organization_id", context.membership.organization_id).eq("id", parsed.data.id).eq("mailing_list_id", parsed.data.mailing_list_id)
    : await context.supabase.from("mailing_subscribers").insert({
      ...values,
      organization_id: context.membership.organization_id,
      mailing_list_id: parsed.data.mailing_list_id,
      created_by: context.user.id,
    });
  if (result.error) redirect(`${path}?fout=abonnee-opslaan`);
  revalidatePath(path);
  revalidatePath("/app/nieuwsbrieven");
  redirect(`${path}?succes=abonnee`);
}

export async function changeSubscriberStatus(formData: FormData) {
  const parsed = z.object({
    id: z.string().uuid(),
    mailing_list_id: z.string().uuid(),
    status: z.enum(["subscribed", "unsubscribed", "bounced"]),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/nieuwsbrieven?fout=abonnee-status");
  const context = await requireActiveMembership();
  const path = `/app/nieuwsbrieven/lijsten/${parsed.data.mailing_list_id}`;
  managerPath(context, path);
  const now = new Date().toISOString();
  const values: {
    status: "subscribed" | "unsubscribed" | "bounced";
    consent_at?: string;
    unsubscribed_at: string | null;
    updated_at: string;
  } = {
    status: parsed.data.status,
    unsubscribed_at: parsed.data.status === "unsubscribed" ? now : null,
    updated_at: now,
  };
  if (parsed.data.status === "subscribed") values.consent_at = now;
  const { error } = await context.supabase.from("mailing_subscribers").update(values)
    .eq("organization_id", context.membership.organization_id)
    .eq("mailing_list_id", parsed.data.mailing_list_id).eq("id", parsed.data.id);
  if (error) redirect(`${path}?fout=abonnee-status-opslaan`);
  revalidatePath(path);
  redirect(`${path}?succes=status`);
}

function newsletterBody(body: string) {
  const instruction = "Wil je geen berichten meer ontvangen? Antwoord op deze e-mail met \"uitschrijven\".";
  return body.toLowerCase().includes("uitschrijven") ? body : `${body.trim()}\n\n${instruction}`;
}

export async function saveNewsletter(formData: FormData) {
  const parsed = z.object({
    id: z.string().uuid().optional().or(z.literal("")),
    mailing_list_id: z.string().uuid(),
    email_template_id: z.string().uuid().optional().or(z.literal("")),
    title: z.string().trim().min(2).max(240),
    subject: z.string().trim().min(2).max(300),
    body_text: z.string().trim().min(2).max(30000),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/nieuwsbrieven?fout=nieuwsbrief-velden");
  if (unresolvedEmailVariables(`${parsed.data.subject}\n${parsed.data.body_text}`).length) {
    redirect("/app/nieuwsbrieven?fout=niet-ingevulde-variabelen");
  }
  const context = await requireActiveMembership();
  managerPath(context, "/app/nieuwsbrieven");
  const { data: list } = await context.supabase.from("mailing_lists").select("id,status")
    .eq("organization_id", context.membership.organization_id).eq("id", parsed.data.mailing_list_id).maybeSingle();
  if (!list || list.status !== "active") redirect("/app/nieuwsbrieven?fout=lijst-niet-actief");
  const { data: subscribers } = await context.supabase.from("mailing_subscribers").select("email")
    .eq("organization_id", context.membership.organization_id)
    .eq("mailing_list_id", list.id).eq("status", "subscribed").order("email").limit(101);
  const recipients = [...new Set((subscribers ?? []).map((item) => item.email.toLowerCase()))];
  if (!recipients.length) redirect("/app/nieuwsbrieven?fout=geen-ontvangers");
  if (recipients.length > 100) redirect("/app/nieuwsbrieven?fout=max-100-ontvangers");
  const body = newsletterBody(parsed.data.body_text);
  const now = new Date().toISOString();
  let id = parsed.data.id || null;
  let currentDraftId: string | null = null;
  if (id) {
    const { data: current } = await context.supabase.from("newsletters").select("status,gmail_draft_id")
      .eq("organization_id", context.membership.organization_id).eq("id", id).maybeSingle();
    if (!current || !["draft", "changes_requested", "failed"].includes(current.status)) redirect(`/app/nieuwsbrieven/${id}?fout=niet-bewerkbaar`);
    currentDraftId = current.gmail_draft_id;
    const { error } = await context.supabase.from("newsletters").update({
      mailing_list_id: list.id,
      email_template_id: parsed.data.email_template_id || null,
      title: parsed.data.title,
      subject: parsed.data.subject,
      body_text: body,
      recipient_count: recipients.length,
      recipient_snapshot: recipients,
      status: "draft",
      approved_by: null,
      approved_at: null,
      last_error: null,
      updated_at: now,
    }).eq("organization_id", context.membership.organization_id).eq("id", id);
    if (error) redirect(`/app/nieuwsbrieven/${id}?fout=opslaan`);
  } else {
    const { data, error } = await context.supabase.from("newsletters").insert({
      organization_id: context.membership.organization_id,
      mailing_list_id: list.id,
      email_template_id: parsed.data.email_template_id || null,
      title: parsed.data.title,
      subject: parsed.data.subject,
      body_text: body,
      recipient_count: recipients.length,
      recipient_snapshot: recipients,
      created_by: context.user.id,
    }).select("id").single();
    if (error || !data) redirect("/app/nieuwsbrieven?fout=opslaan");
    id = data.id;
  }
  try {
    const sender = googleGmailConfiguration().sender;
    const draft = await saveGmailDraft({
      draftId: currentDraftId,
      to: [sender],
      bcc: recipients,
      subject: parsed.data.subject,
      body,
    });
    await context.supabase.from("newsletters").update({
      gmail_draft_id: draft.id,
      gmail_message_id: draft.message?.id || null,
      gmail_thread_id: draft.message?.threadId || null,
      status: "draft",
      last_error: null,
      updated_at: new Date().toISOString(),
    }).eq("organization_id", context.membership.organization_id).eq("id", id);
  } catch (error) {
    await context.supabase.from("newsletters").update({
      status: "failed",
      last_error: error instanceof Error ? error.message.slice(0, 1500) : "Onbekende Gmail-fout",
      updated_at: new Date().toISOString(),
    }).eq("organization_id", context.membership.organization_id).eq("id", id);
    redirect(`/app/nieuwsbrieven/${id}?fout=gmail-concept`);
  }
  revalidatePath("/app/nieuwsbrieven");
  redirect(`/app/nieuwsbrieven/${id}?succes=concept`);
}

export async function sendApprovedNewsletter(formData: FormData) {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/nieuwsbrieven?fout=verzenden");
  const context = await requireActiveMembership();
  const path = `/app/nieuwsbrieven/${parsed.data.id}`;
  managerPath(context, path);
  const { data: newsletter } = await context.supabase.from("newsletters").select("*")
    .eq("organization_id", context.membership.organization_id).eq("id", parsed.data.id).maybeSingle();
  if (!newsletter || newsletter.status !== "approved" || !newsletter.gmail_draft_id) redirect(`${path}?fout=niet-goedgekeurd`);
  let sent: { id: string; threadId?: string };
  try {
    sent = await sendGmailDraft(newsletter.gmail_draft_id);
  } catch (error) {
    await context.supabase.from("newsletters").update({
      last_error: error instanceof Error ? error.message.slice(0, 1500) : "Onbekende Gmail-fout",
      updated_at: new Date().toISOString(),
    }).eq("organization_id", context.membership.organization_id).eq("id", newsletter.id);
    redirect(`${path}?fout=gmail-verzenden`);
  }
  const now = new Date().toISOString();
  await context.supabase.from("newsletters").update({
    status: "sent",
    gmail_message_id: sent.id,
    gmail_thread_id: sent.threadId || newsletter.gmail_thread_id,
    sent_by: context.user.id,
    sent_at: now,
    last_error: null,
    updated_at: now,
  }).eq("organization_id", context.membership.organization_id).eq("id", newsletter.id).eq("status", "approved");
  revalidatePath("/app/nieuwsbrieven");
  revalidatePath("/app/goedkeuringen");
  revalidatePath(path);
  redirect(`${path}?succes=verzonden`);
}
