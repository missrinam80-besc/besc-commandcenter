import { createAdminClient } from "@/lib/supabase/admin";
import { syncMetaAccountById } from "@/lib/meta-sync";
import { syncThreadsAccountById } from "@/lib/threads-sync";
import { syncTwitchAccountById } from "@/lib/twitch-sync";
import { syncYouTubeAccountById } from "@/lib/youtube-sync";
import { handleScheduledSocialSync, loadScheduledAccounts } from "@/lib/social-sync-scheduler";

export const maxDuration = 60;

export async function GET(request: Request) {
  return handleScheduledSocialSync(request, {
    secret: process.env.CRON_SECRET,
    loadAccounts: () => loadScheduledAccounts(async (from, to) => {
      const admin = createAdminClient();
      const { data, error } = await admin.from("social_accounts")
        .select("id,platform,last_sync_at,sync_interval_minutes")
        .in("platform", ["youtube", "facebook", "instagram", "threads", "twitch"])
        .eq("status", "connected")
        .eq("sync_enabled", true)
        .is("deleted_at", null)
        .order("last_sync_at", { ascending: true, nullsFirst: true })
        .order("id", { ascending: true })
        .range(from, to);
      if (error) throw error;
      return data ?? [];
    }),
    syncAccount: (account) => account.platform === "youtube"
        ? syncYouTubeAccountById(account.id, "scheduled")
        : account.platform === "threads"
          ? syncThreadsAccountById(account.id, "scheduled")
          : account.platform === "twitch"
            ? syncTwitchAccountById(account.id, "scheduled")
            : syncMetaAccountById(account.id, "scheduled"),
  });
}
