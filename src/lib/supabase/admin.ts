import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseServerUrl } from "@/lib/supabase/url";

export function createAdminClient(fetcher?: typeof fetch) {
  const url = getSupabaseServerUrl();
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error("SUPABASE_SECRET_KEY ontbreekt voor beveiligde serveracties.");
  return createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
    ...(fetcher ? { global: { fetch: fetcher } } : {}),
  });
}
