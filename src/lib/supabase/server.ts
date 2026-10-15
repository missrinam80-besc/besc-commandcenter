import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseServerUrl } from "./url";

export async function createClient(fetcher?:typeof fetch) {
  const cookieStore = await cookies();
  return createServerClient(
    getSupabaseServerUrl(),
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { ...(fetcher?{global:{fetch:fetcher}}:{}), cookies: { getAll: () => cookieStore.getAll(), setAll: (items) => { try { items.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch {} } } },
  );
}
