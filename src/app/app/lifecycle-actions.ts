"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth-context";
import { lifecycleEntities } from "@/lib/record-lifecycle";

const schema = z.object({
  entity: z.enum([
    "project",
    "event",
    "content",
    "partner",
    "campaign",
    "communityPerson",
    "socialPost",
    "meeting",
    "knowledgeArticle",
  ]),
  id: z.string().uuid(),
  action: z.enum(["archive", "restore", "delete"]),
  confirmation: z.string().optional(),
});

export async function changeRecordLifecycle(formData: FormData) {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app?fout=ongeldige-actie");

  const config = lifecycleEntities[parsed.data.entity];
  const { supabase, membership } = await requirePermission(
    config.capability,
    `${config.listPath}?fout=geen-toegang`,
  );

  if (parsed.data.action === "delete" && parsed.data.confirmation !== "VERWIJDER") {
    redirect(`${config.detailPath}/${parsed.data.id}?fout=bevestiging`);
  }

  const now = new Date().toISOString();
  const changes = parsed.data.action === "archive"
    ? { status: config.archiveStatus, updated_at: now }
    : parsed.data.action === "restore"
      ? { status: config.restoreStatus, updated_at: now }
      : { deleted_at: now, updated_at: now };

  let query = supabase
    .from(config.table)
    .update(changes)
    .eq("organization_id", membership.organization_id)
    .eq("id", parsed.data.id);
  query = parsed.data.action === "restore"
    ? query.eq("status", config.archiveStatus).is("deleted_at", null)
    : query.is("deleted_at", null);
  const { error } = await query;

  if (error) {
    redirect(`${config.detailPath}/${parsed.data.id}?fout=lifecycle`);
  }

  revalidatePath(config.listPath);
  revalidatePath("/app/archief");
  revalidatePath(`${config.detailPath}/${parsed.data.id}`);
  const success = parsed.data.action === "archive" ? "gearchiveerd" : parsed.data.action === "restore" ? "hersteld" : "verwijderd";
  redirect(`${config.listPath}?succes=${success}`);
}

