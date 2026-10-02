export type ScheduledAccount = {
  id: string;
  platform: string;
  last_sync_at: string | null;
  sync_interval_minutes: number | null;
};

export async function loadScheduledAccounts(
  loadPage: (from: number, to: number) => Promise<ScheduledAccount[]>,
) {
  const accounts: ScheduledAccount[] = [];
  for (let from = 0; ; from += 100) {
    const page = await loadPage(from, from + 99);
    accounts.push(...page);
    if (page.length < 100) return accounts;
  }
}

export function isScheduledAccountDue(account: ScheduledAccount, now: number) {
  if (!account.last_sync_at) return true;
  const lastSync = Date.parse(account.last_sync_at);
  const interval = Number.isFinite(account.sync_interval_minutes)
    ? Math.max(account.sync_interval_minutes ?? 15, 15)
    : 15;
  return !Number.isFinite(lastSync) || lastSync + interval * 60_000 <= now;
}

type Dependencies = {
  secret: string | undefined;
  loadAccounts: () => Promise<ScheduledAccount[]>;
  syncAccount: (account: ScheduledAccount) => Promise<{ status: string }>;
  now?: () => number;
};

export async function handleScheduledSocialSync(request: Request, dependencies: Dependencies) {
  const reply = (body: unknown, status = 200) => Response.json(body, {
    status, headers: { "Cache-Control": "no-store" },
  });
  if (!dependencies.secret) return reply({ ok: false, error: "cron_not_configured" }, 503);
  if (request.headers.get("authorization") !== `Bearer ${dependencies.secret}`) {
    return reply({ ok: false, error: "unauthorized" }, 401);
  }
  let accounts: ScheduledAccount[];
  try {
    accounts = await dependencies.loadAccounts();
  } catch {
    return reply({ ok: false, error: "account_query_failed" }, 500);
  }
  const now = dependencies.now?.() ?? Date.now();
  const due = accounts.filter((account) => isScheduledAccountDue(account, now));
  const batch = due.slice(0, 8);
  if (new URL(request.url).searchParams.get("dry_run") === "1") {
    return reply({ ok: true, dryRun: true, considered: accounts.length, due: due.length,
      batch: batch.map(({ id, platform }) => ({ id, platform })), remaining: Math.max(0, due.length - 8) });
  }
  let succeeded = 0;
  let partial = 0;
  let failed = 0;
  let skipped = 0;
  for (const account of batch) {
    try {
      const result = await dependencies.syncAccount(account);
      if (result.status === "skipped") skipped += 1;
      else if (result.status === "partial") partial += 1;
      else if (result.status === "succeeded") succeeded += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
  }
  const ok = failed === 0 && partial === 0;
  return reply({ ok, considered: accounts.length, due: due.length, processed: batch.length,
    succeeded, partial, failed, skipped, remaining: Math.max(0, due.length - batch.length) }, ok ? 200 : 503);
}
