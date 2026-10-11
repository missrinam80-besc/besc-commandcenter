"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth-context";
import { ticketErrors } from "@/lib/tickets";

export async function updateTicket(form: FormData) {
  const { supabase, membership } = await requirePermission("manageTickets");
  const id = String(form.get("ticket_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect("/app/tickets?fout=ticket_unavailable");
  const action = String(form.get("action") ?? "");
  const version = Number(form.get("version"));
  if (!Number.isSafeInteger(version) || version < 1 || !["assign","internal","reply","status","recover"].includes(action)) redirect(`/app/tickets/${id}?fout=upstream_unavailable`);
  const content = String(form.get("content") ?? "").trim();
  const data = action === "assign" ? { assigned_to: form.get("assigned_to") || null }
    : action === "status" ? { status: form.get("status") }
    : action === "internal" || action === "reply" ? { content } : {};
  const result = await supabase.rpc("ticket_staff_action", { p_org: membership.organization_id, p_ticket: id, p_version: version, p_action: action, p_data: data });
  const code = result.error ? "upstream_unavailable" : result.data?.error;
  revalidatePath("/app/tickets");
  revalidatePath(`/app/tickets/${id}`);
  redirect(`/app/tickets/${id}?${code ? "fout=" + (Object.hasOwn(ticketErrors, code) ? code : "upstream_unavailable") : "opgeslagen=1"}`);
}

export async function retryTicketCleanup(form: FormData) {
  const { supabase } = await requirePermission("manageTickets");
  const id = String(form.get("delivery_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect("/app/tickets?fout=upstream_unavailable");
  const result = await supabase.rpc("ticket_retry_cleanup", { p_delivery: id });
  revalidatePath("/app/tickets");
  redirect("/app/tickets?" + (result.error ? "fout=upstream_unavailable" : "opgeslagen=1"));
}
