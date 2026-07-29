"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActiveMembership } from "@/lib/auth-context";
import { syncLinkedMeeting } from "@/lib/linked-calendar-sync";

async function manager() {
  const context = await requireActiveMembership();
  if (!["admin", "board"].includes(context.membership.role)) {
    redirect("/app/vergaderingen?fout=geen-toegang");
  }
  return context;
}

const csv = (value?: string) => (value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
const schema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(3).max(180),
  meeting_type: z.enum(["board", "general_assembly", "workgroup", "project", "partner", "other"]),
  status: z.enum(["planned", "confirmed", "completed", "cancelled", "archived"]),
  meeting_at: z.string().optional(),
  ends_at: z.string().optional(),
  attendees: z.string().optional(),
  notes: z.string().max(20000).optional(),
  decisions: z.string().max(20000).optional(),
  action_points: z.string().max(20000).optional(),
  minutes_url: z.string().url().optional().or(z.literal("")),
});

export async function saveMeeting(formData: FormData) {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/app/vergaderingen${formData.get("id") ? `/${formData.get("id")}?bewerken=1&` : "?nieuw=1&"}fout=velden`);
  }
  const { supabase, user, membership } = await manager();
  const { id, ...data } = parsed.data;
  const meetingAt = data.meeting_at ? new Date(data.meeting_at).toISOString() : null;
  const endsAt = data.ends_at ? new Date(data.ends_at).toISOString() : null;
  if (meetingAt && endsAt && new Date(endsAt) <= new Date(meetingAt)) {
    redirect(`/app/vergaderingen${id ? `/${id}?bewerken=1&` : "?nieuw=1&"}fout=tijden`);
  }
  const values = {
    ...data,
    meeting_at: meetingAt,
    ends_at: endsAt,
    attendees: csv(data.attendees),
    notes: data.notes || null,
    decisions: data.decisions || null,
    action_points: data.action_points || null,
    minutes_url: data.minutes_url || null,
    updated_at: new Date().toISOString(),
  };
  const result = id
    ? await supabase.from("meetings").update(values).eq("organization_id", membership.organization_id).eq("id", id)
    : await supabase.from("meetings").insert({ ...values, organization_id: membership.organization_id, created_by: user.id }).select("id").single();
  if (result.error) redirect("/app/vergaderingen?fout=opslaan");
  let calendarWarning = false;
  if (id) {
    try {
      await syncLinkedMeeting({
        supabase,
        organizationId: membership.organization_id,
      }, id);
    } catch {
      calendarWarning = true;
    }
  }
  revalidatePath("/app/vergaderingen");
  if (id) revalidatePath(`/app/vergaderingen/${id}`);
  redirect(id
    ? `/app/vergaderingen/${id}?succes=bijgewerkt${calendarWarning ? "&waarschuwing=kalender-sync" : ""}`
    : `/app/vergaderingen/${result.data?.id}`);
}

export async function addMeetingAction(formData: FormData) {
  const parsed = z.object({
    meeting_id: z.string().uuid(),
    title: z.string().trim().min(2).max(500),
    assignee_text: z.string().trim().optional(),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/app/vergaderingen/${formData.get("meeting_id")}?fout=actiepunt`);
  const { supabase, user, membership } = await manager();
  const { error } = await supabase.from("meeting_action_items").insert({
    organization_id: membership.organization_id,
    meeting_id: parsed.data.meeting_id,
    title: parsed.data.title,
    assignee_text: parsed.data.assignee_text || null,
    created_by: user.id,
  });
  if (error) redirect(`/app/vergaderingen/${parsed.data.meeting_id}?fout=actiepunt-opslaan`);
  revalidatePath(`/app/vergaderingen/${parsed.data.meeting_id}`);
  redirect(`/app/vergaderingen/${parsed.data.meeting_id}?succes=actiepunt`);
}

export async function updateMeetingAction(formData: FormData) {
  const parsed = z.object({
    id: z.string().uuid(),
    meeting_id: z.string().uuid(),
    status: z.enum(["todo", "doing", "done", "cancelled"]),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/vergaderingen");
  const { supabase, membership } = await manager();
  await supabase.from("meeting_action_items")
    .update({ status: parsed.data.status, updated_at: new Date().toISOString() })
    .eq("organization_id", membership.organization_id)
    .eq("id", parsed.data.id);
  revalidatePath(`/app/vergaderingen/${parsed.data.meeting_id}`);
  redirect(`/app/vergaderingen/${parsed.data.meeting_id}`);
}

export async function convertMeetingActionToTask(formData: FormData) {
  const parsed = z.object({
    id: z.string().uuid(),
    meeting_id: z.string().uuid(),
    priority: z.enum(["low", "normal", "high", "urgent"]),
    due_at: z.string().optional(),
    project_id: z.string().uuid().optional().or(z.literal("")),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/app/vergaderingen/${formData.get("meeting_id")}?fout=taak-velden`);
  const { supabase } = await manager();
  const { data, error } = await supabase.rpc("convert_meeting_action_to_task", {
    action_id: parsed.data.id,
    task_priority: parsed.data.priority,
    task_due_at: parsed.data.due_at || null,
    task_project_id: parsed.data.project_id || null,
  });
  if (error || !data) redirect(`/app/vergaderingen/${parsed.data.meeting_id}?fout=taak-omzetten`);
  revalidatePath("/app/taken");
  revalidatePath(`/app/vergaderingen/${parsed.data.meeting_id}`);
  redirect(`/app/taken/${data}`);
}
