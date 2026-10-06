"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth-context";
import { localDateTimeToIso } from "@/lib/format";
import { approvalStatuses, contentChannels, contentStatuses, contentTypes } from "./constants";

const schema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().max(180).optional(),
  description: z.string().trim().max(10000).optional(),
  content_type: z.enum(Object.keys(contentTypes) as [keyof typeof contentTypes, ...(keyof typeof contentTypes)[]]),
  status: z.enum(Object.keys(contentStatuses) as [keyof typeof contentStatuses, ...(keyof typeof contentStatuses)[]]),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  project_id: z.string().uuid().optional().or(z.literal("")),
  campaign_id: z.string().uuid().optional().or(z.literal("")),
  partner_id: z.string().uuid().optional().or(z.literal("")),
  primary_channel: z.enum(contentChannels).optional().or(z.literal("")),
  deadline: z.string().optional(),
  publication_at: z.string().optional(),
  drive_url: z.string().url().optional().or(z.literal("")),
  canva_url: z.string().url().optional().or(z.literal("")),
  publication_url: z.string().url().optional().or(z.literal("")),
  approval_status: z.enum(Object.keys(approvalStatuses) as [keyof typeof approvalStatuses, ...(keyof typeof approvalStatuses)[]]),
});

async function manager() {
  return requirePermission("manageContent", "/app/content?fout=geen-toegang");
}

function values(parsed: z.infer<typeof schema>, channels: string[]) {
  return {
    title: parsed.title || "Naamloos contentitem",
    description: parsed.description || null,
    content_type: parsed.content_type,
    status: parsed.status,
    priority: parsed.priority,
    project_id: parsed.project_id || null,
    campaign_id: parsed.campaign_id || null,
    partner_id: parsed.partner_id || null,
    primary_channel: parsed.primary_channel || null,
    channels,
    deadline: parsed.deadline || null,
    publication_at: localDateTimeToIso(parsed.publication_at),
    drive_url: parsed.drive_url || null,
    canva_url: parsed.canva_url || null,
    publication_url: parsed.publication_url || null,
    approval_status: parsed.approval_status,
    updated_at: new Date().toISOString(),
  };
}

export async function createContent(formData: FormData) {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  const channels = formData.getAll("channels").map(String).filter((item) => contentChannels.includes(item as never));
  if (!parsed.success) redirect("/app/content?nieuw=1&fout=velden");
  const { supabase, user, membership } = await manager();
  const { data, error } = await supabase.from("content_items").insert({
    ...values(parsed.data, channels),
    organization_id: membership.organization_id,
    owner_id: user.id,
    created_by: user.id,
  }).select("id").single();
  if (error || !data) redirect("/app/content?nieuw=1&fout=opslaan");
  revalidatePath("/app/content");
  redirect(`/app/content/${data.id}?succes=aangemaakt`);
}

export async function updateContent(formData: FormData) {
  const parsed = schema.required({ id: true }).safeParse(Object.fromEntries(formData));
  const channels = formData.getAll("channels").map(String).filter((item) => contentChannels.includes(item as never));
  if (!parsed.success) redirect(`/app/content/${String(formData.get("id"))}?bewerken=1&fout=velden`);
  const { supabase, membership } = await manager();
  const { data, error } = await supabase.from("content_items").update(values(parsed.data, channels))
    .eq("organization_id", membership.organization_id)
    .eq("id", parsed.data.id)
    .is("deleted_at", null).select("id").maybeSingle();
  if (error || !data) redirect(`/app/content/${parsed.data.id}?bewerken=1&fout=opslaan`);
  revalidatePath("/app/content");
  revalidatePath(`/app/content/${parsed.data.id}`);
  redirect(`/app/content/${parsed.data.id}?succes=bijgewerkt`);
}
