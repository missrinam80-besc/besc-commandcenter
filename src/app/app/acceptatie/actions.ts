"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActiveMembership } from "@/lib/auth-context";
import { acceptanceChecks, acceptanceStatuses } from "@/lib/acceptance";

const safeAcceptancePath = "/app/acceptatie";

function requireManagerRole(role: string) {
  if (!["admin", "board"].includes(role)) redirect(`${safeAcceptancePath}?fout=geen-toegang`);
}

export async function startAcceptanceRun(formData: FormData) {
  const parsed = z.object({
    environment: z.enum(["local", "preview", "production"]),
    title: z.string().trim().min(3).max(180),
    notes: z.string().trim().max(4000).optional(),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`${safeAcceptancePath}?fout=acceptatie-start`);

  const { supabase, user, membership } = await requireActiveMembership();
  requireManagerRole(membership.role);

  const { data: run, error } = await supabase.from("acceptance_runs").insert({
    organization_id: membership.organization_id,
    title: parsed.data.title,
    environment: parsed.data.environment,
    commit_sha: process.env.VERCEL_GIT_COMMIT_SHA || null,
    notes: parsed.data.notes || null,
    started_by: user.id,
  }).select("id").single();
  if (error || !run) redirect(`${safeAcceptancePath}?fout=acceptatie-run`);

  const { error: checkError } = await supabase.from("acceptance_check_results").insert(
    acceptanceChecks.map((check) => ({
      organization_id: membership.organization_id,
      run_id: run.id,
      check_key: check.key,
      category: check.category,
      title: check.title,
    })),
  );
  if (checkError) redirect(`${safeAcceptancePath}?fout=acceptatie-checks`);

  await supabase.from("activity_events").insert({
    organization_id: membership.organization_id,
    entity_type: "project",
    entity_id: run.id,
    action: "acceptance_started",
    actor_id: user.id,
    metadata: { environment: parsed.data.environment, title: parsed.data.title },
  });

  revalidatePath(safeAcceptancePath);
  redirect(`${safeAcceptancePath}?succes=acceptatie-gestart`);
}

export async function updateAcceptanceCheck(formData: FormData) {
  const parsed = z.object({
    id: z.string().uuid(),
    run_id: z.string().uuid(),
    status: z.enum(acceptanceStatuses),
    evidence: z.string().trim().max(4000).optional(),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`${safeAcceptancePath}?fout=acceptatie-check`);

  const { supabase, user, membership } = await requireActiveMembership();
  requireManagerRole(membership.role);

  const { error } = await supabase.from("acceptance_check_results").update({
    status: parsed.data.status,
    evidence: parsed.data.evidence || null,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  })
    .eq("organization_id", membership.organization_id)
    .eq("run_id", parsed.data.run_id)
    .eq("id", parsed.data.id);
  if (error) redirect(`${safeAcceptancePath}?fout=acceptatie-check-opslaan`);

  revalidatePath(safeAcceptancePath);
  redirect(`${safeAcceptancePath}?succes=acceptatie-check`);
}

export async function completeAcceptanceRun(formData: FormData) {
  const parsed = z.object({
    id: z.string().uuid(),
    decision: z.enum(["complete", "accept"]),
    notes: z.string().trim().max(4000).optional(),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`${safeAcceptancePath}?fout=acceptatie-afronden`);

  const { supabase, user, membership } = await requireActiveMembership();
  requireManagerRole(membership.role);

  const { data: checks } = await supabase.from("acceptance_check_results")
    .select("status")
    .eq("organization_id", membership.organization_id)
    .eq("run_id", parsed.data.id);
  const rows = checks ?? [];
  const hasBlockingResult = rows.some((check) => ["pending", "failed", "blocked"].includes(check.status));
  const status = parsed.data.decision === "accept" && !hasBlockingResult ? "accepted" : hasBlockingResult ? "failed" : "passed";
  const now = new Date().toISOString();

  const { error } = await supabase.from("acceptance_runs").update({
    status,
    notes: parsed.data.notes || null,
    completed_by: user.id,
    completed_at: now,
    updated_at: now,
  }).eq("organization_id", membership.organization_id).eq("id", parsed.data.id);
  if (error) redirect(`${safeAcceptancePath}?fout=acceptatie-afronden`);

  await supabase.from("activity_events").insert({
    organization_id: membership.organization_id,
    entity_type: "project",
    entity_id: parsed.data.id,
    action: "acceptance_completed",
    actor_id: user.id,
    metadata: { status },
  });

  revalidatePath(safeAcceptancePath);
  redirect(`${safeAcceptancePath}?succes=acceptatie-afgerond`);
}
