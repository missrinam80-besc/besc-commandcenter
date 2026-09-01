import type { SupabaseClient } from "@supabase/supabase-js";

export async function resolveAuthenticatedHome(supabase: SupabaseClient, userId: string) {
  const [membership, portal] = await Promise.all([
    supabase.from("organization_members").select("status").eq("user_id", userId).eq("status", "active").limit(1).maybeSingle(),
    supabase.from("portal_access").select("id").eq("user_id", userId).eq("status", "active").limit(1).maybeSingle(),
  ]);
  if (membership.data) return "/app";
  if (portal.data) return "/portal";
  return "/wachten-op-goedkeuring";
}
