"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth-context";

const schema = z.object({
  entity: z.enum(["document", "ticket"]),
  id: z.string().uuid(),
  archived: z.enum(["true", "false"]),
  version: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
});

export async function setWorkspaceArchive(form: FormData) {
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) redirect("/app/archief?fout=velden");
  const { entity, id, archived, version } = parsed.data;
  const base = entity === "document" ? "/app/documenten" : "/app/tickets";
  const { supabase, membership } = await requirePermission(
    entity === "document" ? "manageOrganization" : "manageTickets",
    base + "?fout=geen-toegang",
  );
  const desired = archived === "true";
  const { data, error } = await supabase.rpc("set_workspace_record_archive", {
    p_org: membership.organization_id,
    p_entity: entity,
    p_record: id,
    p_archived: desired,
    p_expected_version: version,
  });
  const message = error?.code === "40001" ? "conflict"
    : error || data?.archived !== desired ? "unavailable" : desired ? "archived" : "restored";
  revalidatePath(base);
  revalidatePath("/app/archief");
  const archiveQuery = desired ? "" : entity === "document" ? "register_archief=1&" : "archief=1&";
  redirect(base + "?" + archiveQuery + "archief_melding=" + message);
}
