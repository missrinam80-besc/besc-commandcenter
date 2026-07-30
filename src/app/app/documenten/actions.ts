"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth-context";

export async function deleteDocumentRegistration(formData: FormData) {
  const parsed = z.object({
    id: z.string().uuid(),
    confirmation: z.literal("VERWIJDER"),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/documenten?fout=verwijderen");

  const { supabase, membership } = await requirePermission(
    "manageOrganization",
    "/app/documenten?fout=geen-toegang",
  );
  const { error } = await supabase
    .from("google_resource_links")
    .delete()
    .eq("id", parsed.data.id)
    .eq("organization_id", membership.organization_id)
    .eq("resource_type", "document");
  if (error) redirect("/app/documenten?fout=verwijderen");

  revalidatePath("/app/documenten");
  redirect("/app/documenten?succes=document-verwijderd");
}
