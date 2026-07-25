"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActiveMembership } from "@/lib/auth-context";

const modules = [
  "inbox",
  "tasks",
  "projects",
  "content",
  "events",
  "sponsors",
  "campagnes",
  "community",
  "social",
  "historiek",
] as const;

const modulePaths: Record<(typeof modules)[number], string> = {
  inbox: "/app/inbox",
  tasks: "/app/taken",
  projects: "/app/projecten",
  content: "/app/content",
  events: "/app/events",
  sponsors: "/app/sponsors",
  campagnes: "/app/campagnes",
  community: "/app/community",
  social: "/app/social",
  historiek: "/app/historiek",
};

const allowedQueryKeys = new Set([
  "zoek",
  "status",
  "type",
  "van_mij",
  "sorteren",
  "module",
  "weergave",
]);

export async function saveCurrentView(formData: FormData) {
  const parsed = z
    .object({
      module: z.enum(modules),
      name: z.string().trim().min(2).max(80),
      query: z.string().max(2000),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app");

  const query = new URLSearchParams(parsed.data.query);
  const cleanQuery: Record<string, string> = {};
  for (const [key, value] of query.entries()) {
    if (allowedQueryKeys.has(key) && value.length <= 100) cleanQuery[key] = value;
  }

  const { supabase, membership, user } = await requireActiveMembership();
  const path = modulePaths[parsed.data.module];
  const { error } = await supabase.from("saved_views").upsert(
    {
      organization_id: membership.organization_id,
      user_id: user.id,
      module: parsed.data.module,
      name: parsed.data.name,
      query_params: cleanQuery,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,module,name" },
  );
  revalidatePath(path);
  redirect(`${path}?${error ? "weergave_fout=opslaan" : "weergave_opgeslagen=1"}`);
}

export async function deleteSavedView(formData: FormData) {
  const parsed = z
    .object({ id: z.string().uuid(), module: z.enum(modules) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app");

  const { supabase, membership, user } = await requireActiveMembership();
  const path = modulePaths[parsed.data.module];
  const { error } = await supabase
    .from("saved_views")
    .delete()
    .eq("id", parsed.data.id)
    .eq("organization_id", membership.organization_id)
    .eq("user_id", user.id);
  revalidatePath(path);
  redirect(`${path}?${error ? "weergave_fout=verwijderen" : "weergave_verwijderd=1"}`);
}
