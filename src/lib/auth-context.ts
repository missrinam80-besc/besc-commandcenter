import { redirect } from "next/navigation";
import { cache } from "react";
import { type Capability, hasPermission } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

export const requireActiveMembership = cache(async function requireActiveMembership() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const enriched = await supabase
    .from("organization_members")
    .select("organization_id,role,status,finance_role,access_role_id,organization_access_roles(capabilities)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  const { data: membership } = enriched.error
    ? await supabase
      .from("organization_members")
      .select("organization_id,role,status,finance_role")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle()
    : enriched;
  if (!membership) redirect("/wachten-op-goedkeuring");
  const customRole = (membership as { organization_access_roles?: { capabilities?: string[] | null } | null }).organization_access_roles;
  return { supabase, user, membership: { ...membership, capabilities: customRole?.capabilities ?? null } };
});

export async function requirePermission(capability: Capability, fallback = "/app?fout=geen-toegang") {
  const context = await requireActiveMembership();
  if (!hasPermission(context.membership, capability)) redirect(fallback);
  return context;
}
