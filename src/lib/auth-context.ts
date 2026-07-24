import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireActiveMembership() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: membership } = await supabase.from("organization_members").select("organization_id,role,status,finance_role").eq("user_id", user.id).eq("status", "active").limit(1).maybeSingle();
  if (!membership) redirect("/wachten-op-goedkeuring");
  return { supabase, user, membership };
}
