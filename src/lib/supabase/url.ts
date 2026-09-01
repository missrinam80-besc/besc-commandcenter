export function getSupabaseServerUrl() {
  return process.env.SUPABASE_URL_SERVER || process.env.NEXT_PUBLIC_SUPABASE_URL!;
}
