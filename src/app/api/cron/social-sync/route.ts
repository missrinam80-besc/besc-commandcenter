import { createAdminClient } from "@/lib/supabase/admin";
import { syncYouTubeAccountById } from "@/lib/youtube-sync";

export const maxDuration = 60;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return Response.json({ ok: false, error: "cron_not_configured" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) return new Response("Unauthorized", { status: 401 });

  const admin = createAdminClient();
  const { data: accounts, error } = await admin.from("social_accounts")
    .select("id,last_sync_at,sync_interval_minutes")
    .eq("platform", "youtube")
    .eq("status", "connected")
    .eq("sync_enabled", true)
    .is("deleted_at", null)
    .order("last_sync_at", { ascending: true, nullsFirst: true })
    .limit(8);
  if (error) return Response.json({ ok: false, error: "account_query_failed" }, { status: 500 });

  const now = Date.now();
  const due = (accounts ?? []).filter((account) => {
    if (!account.last_sync_at) return true;
    return new Date(account.last_sync_at).valueOf() + Math.max(account.sync_interval_minutes, 15) * 60_000 <= now;
  });
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;
  for (const account of due) {
    try {
      const result = await syncYouTubeAccountById(account.id, "scheduled");
      if (result.status === "skipped") skipped += 1;
      else succeeded += 1;
    } catch {
      failed += 1;
    }
  }
  return Response.json({ ok: failed === 0, considered: accounts?.length ?? 0, due: due.length, succeeded, failed, skipped });
}
