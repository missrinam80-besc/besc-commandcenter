import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260803150500_add_social_integration_core.sql", "utf8");
const page = readFileSync("src/app/app/integraties/social/page.tsx", "utf8");
const actions = readFileSync("src/app/app/integraties/social/actions.ts", "utf8");
const connectorDefinitions = readFileSync("src/lib/social-connectors.ts", "utf8");
const youtube = readFileSync("src/lib/youtube-integration.ts", "utf8");
const youtubeStart = readFileSync("src/app/app/integraties/social/youtube/start/route.ts", "utf8");
const youtubeCallback = readFileSync("src/app/app/integraties/social/youtube/callback/route.ts", "utf8");
const youtubeSync = readFileSync("src/lib/youtube-sync.ts", "utf8");
const meta = readFileSync("src/lib/meta-integration.ts", "utf8");
const metaStart = readFileSync("src/app/app/integraties/social/meta/start/route.ts", "utf8");
const metaCallback = readFileSync("src/app/app/integraties/social/meta/callback/route.ts", "utf8");
const metaSync = readFileSync("src/lib/meta-sync.ts", "utf8");
const threads = readFileSync("src/lib/threads-integration.ts", "utf8");
const threadsStart = readFileSync("src/app/app/integraties/social/threads/start/route.ts", "utf8");
const threadsCallback = readFileSync("src/app/app/integraties/social/threads/callback/route.ts", "utf8");
const threadsSync = readFileSync("src/lib/threads-sync.ts", "utf8");
const twitch = readFileSync("src/lib/twitch-integration.ts", "utf8");
const twitchStart = readFileSync("src/app/app/integraties/social/twitch/start/route.ts", "utf8");
const twitchCallback = readFileSync("src/app/app/integraties/social/twitch/callback/route.ts", "utf8");
const twitchSync = readFileSync("src/lib/twitch-sync.ts", "utf8");
const cronRoute = readFileSync("src/app/api/cron/social-sync/route.ts", "utf8");
const vercel = readFileSync("vercel.json", "utf8");
const reportPage = readFileSync("src/app/app/rapportage/social/page.tsx", "utf8");
const reportExport = readFileSync("src/app/app/rapportage/social/export/route.ts", "utf8");
const socialAcceptance = readFileSync("src/lib/social-acceptance.ts", "utf8");
const quotaMigration = readFileSync("supabase/migrations/20260803152000_add_social_quota_and_audit.sql", "utf8");
const audit = readFileSync("src/lib/audit.ts", "utf8");

test("social accountmetadata en OAuth-geheimen blijven strikt gescheiden", () => {
  const publicTable = migration.slice(migration.indexOf("create table public.social_accounts"), migration.indexOf("create table public.social_sync_runs"));
  assert.doesNotMatch(publicTable, /access_token|refresh_token/);
  assert.match(migration, /create table private\.social_account_credentials/);
  assert.match(migration, /vault\.create_secret/);
  assert.match(migration, /vault\.update_secret/);
  assert.match(migration, /vault\.decrypted_secrets/);
  assert.match(migration, /grant execute on function public\.read_social_account_credentials\(uuid\) to service_role/);
  assert.match(migration, /revoke all on function public\.read_social_account_credentials\(uuid\) from public,anon,authenticated/);
  assert.doesNotMatch(page, /name="access_token"|name="refresh_token"/);
});

test("social tabellen gebruiken organisatierechten en veilige RLS", () => {
  assert.match(migration, /alter table public\.social_accounts enable row level security/);
  assert.match(migration, /managers read social accounts/);
  assert.match(migration, /private\.is_org_manager\(organization_id\)/);
  assert.match(migration, /members read social metric snapshots/);
  assert.match(migration, /private\.is_active_member\(organization_id\)/);
  assert.match(migration, /revoke all on table private\.social_account_credentials from public, anon, authenticated/);
  assert.match(actions, /\["admin", "board"\]\.includes\(membership\.role\)/);
});

test("synchronisatieruns zijn idempotent en metingen blijven herleidbaar", () => {
  assert.match(migration, /unique\(social_account_id,idempotency_key\)/);
  assert.match(migration, /normalized_metric/);
  assert.match(migration, /source_url/);
  assert.match(migration, /source_metadata/);
  assert.match(migration, /records_read/);
  assert.match(migration, /records_written/);
});

test("beheer toont platformfasering, accountstatus en syncgeschiedenis", () => {
  for (const platform of ["youtube", "facebook", "instagram", "threads", "twitch", "linkedin", "tiktok", "x"]) {
    assert.match(connectorDefinitions, new RegExp(`${platform}:`));
  }
  assert.match(connectorDefinitions, /youtube: \{[^\n]+state: "ready_for_pilot"/);
  assert.match(connectorDefinitions, /facebook: \{[^\n]+state: "ready_for_pilot"/);
  assert.match(connectorDefinitions, /instagram: \{[^\n]+state: "ready_for_pilot"/);
  assert.match(connectorDefinitions, /threads: \{[^\n]+state: "blocked"[^\n]+Niet gebruiken in de eerste versie/);
  assert.match(connectorDefinitions, /twitch: \{[^\n]+state: "ready_for_pilot"/);
  assert.match(connectorDefinitions, /linkedin: \{[^\n]+state: "blocked"[^\n]+Community Management/);
  assert.match(connectorDefinitions, /tiktok: \{[^\n]+state: "blocked"[^\n]+audit/);
  assert.match(connectorDefinitions, /x: \{[^\n]+state: "blocked"[^\n]+API-budget/);
  assert.match(page, /Geregistreerde kanalen/);
  assert.match(page, /Recente synchronisaties/);
  assert.match(page, /OAuth-tokens staan versleuteld in Vault/);
  assert.match(page, /changeSocialAccountState/);
});

test("Twitch gebruikt authorization code, tokenvalidatie en refresh", () => {
  assert.match(twitch, /grant_type: "authorization_code"/);
  assert.match(twitch, /grant_type: "refresh_token"/);
  assert.match(twitch, /oauth2\/validate/);
  assert.match(twitchStart, /randomBytes\(32\)/);
  assert.match(twitchStart, /httpOnly: true/);
  assert.match(twitchCallback, /state !== expectedState/);
  assert.match(twitchCallback, /store_social_account_credentials/);
});

test("Twitch-sync beperkt zich tot operationele kanaaldata", () => {
  assert.match(twitch, /api\.twitch\.tv\/helix/);
  assert.match(twitch, /channels\?broadcaster_id/);
  assert.match(twitch, /streams\?user_id/);
  assert.match(twitch, /schedule\?broadcaster_id/);
  assert.match(twitchSync, /current_viewers/);
  assert.match(twitchSync, /scheduled_streams/);
  assert.match(twitchSync, /current_operational_state/);
  assert.doesNotMatch(twitch, /followers\?/);
  assert.match(actions, /syncTwitchAccountById\(account\.id, "manual", user\.id\)/);
});

test("Threads gebruikt een afzonderlijke OAuth-flow met verlengbare tokens", () => {
  assert.match(threads, /threads_basic/);
  assert.match(threads, /threads_manage_insights/);
  assert.match(threads, /th_exchange_token/);
  assert.match(threads, /th_refresh_token/);
  assert.match(threads, /Authorization: `Bearer \$\{accessToken\}`/);
  assert.match(threadsStart, /randomBytes\(32\)/);
  assert.match(threadsStart, /httpOnly: true/);
  assert.match(threadsCallback, /state !== expectedState/);
  assert.match(threadsCallback, /store_social_account_credentials/);
});

test("Threads-sync schrijft officiële accountinzichten en vernieuwt tokens", () => {
  assert.match(threads, /threads_insights/);
  assert.match(threads, /followers_count/);
  assert.match(threadsSync, /social_metric_snapshots/);
  assert.match(threadsSync, /last_28_complete_days/);
  assert.match(threadsSync, /official_api/);
  assert.match(actions, /syncThreadsAccountById\(account\.id, "manual", user\.id\)/);
});

test("Meta OAuth gebruikt minimale platformspecifieke scopes en statecontrole", () => {
  assert.match(meta, /pages_show_list/);
  assert.match(meta, /pages_read_engagement/);
  assert.match(meta, /instagram_basic/);
  assert.match(meta, /instagram_manage_insights/);
  assert.match(meta, /fb_exchange_token/);
  assert.match(metaStart, /randomBytes\(32\)/);
  assert.match(metaStart, /httpOnly: true/);
  assert.match(metaStart, /sameSite: "lax"/);
  assert.match(metaCallback, /state !== expectedState/);
  assert.match(metaCallback, /store_social_account_credentials/);
  assert.doesNotMatch(metaCallback, /from\("social_account_credentials"\)/);
});

test("Meta-sync schrijft herleidbare Facebook- en Instagram-metingen", () => {
  assert.match(meta, /fan_count,followers_count/);
  assert.match(meta, /reach,profile_views/);
  assert.match(metaSync, /social_sync_runs/);
  assert.match(metaSync, /social_metric_snapshots/);
  assert.match(metaSync, /last_28_complete_days/);
  assert.match(metaSync, /official_api/);
  assert.match(metaSync, /status: "failed"/);
  assert.match(actions, /syncMetaAccountById\(account\.id, "manual", user\.id\)/);
});

test("YouTube OAuth gebruikt minimale scopes, statecontrole en servergeheimen", () => {
  assert.match(youtube, /youtube\.readonly/);
  assert.match(youtube, /yt-analytics\.readonly/);
  assert.match(youtube, /SUPABASE_SECRET_KEY/);
  assert.match(youtubeStart, /randomBytes\(32\)/);
  assert.match(youtubeStart, /httpOnly: true/);
  assert.match(youtubeStart, /sameSite: "lax"/);
  assert.match(youtubeCallback, /state !== expectedState/);
  assert.match(youtubeCallback, /store_social_account_credentials/);
  assert.doesNotMatch(youtubeCallback, /from\("social_account_credentials"\)/);
});

test("YouTube-sync ververst tokens en registreert herleidbare kernmetingen", () => {
  assert.match(youtube, /grant_type: "refresh_token"/);
  assert.match(youtube, /channels\?part=snippet,statistics&mine=true/);
  assert.match(youtube, /youtubeanalytics\.googleapis\.com\/v2\/reports/);
  assert.match(youtubeSync, /social_sync_runs/);
  assert.match(youtubeSync, /social_metric_snapshots/);
  assert.match(youtubeSync, /last_28_complete_days/);
  assert.match(youtubeSync, /official_api/);
  assert.match(youtubeSync, /status: "failed"/);
  assert.match(actions, /syncYouTubeAccountById\(account\.id, "manual", user\.id\)/);
});

test("automatische social sync is afgeschermd, begrensd en idempotent", () => {
  assert.match(cronRoute, /Bearer \$\{cronSecret\}/);
  assert.match(cronRoute, /sync_enabled/);
  assert.match(cronRoute, /\.limit\(8\)/);
  assert.match(cronRoute, /syncYouTubeAccountById\(account\.id, "scheduled"\)/);
  assert.match(cronRoute, /syncMetaAccountById\(account\.id, "scheduled"\)/);
  assert.match(cronRoute, /syncThreadsAccountById\(account\.id, "scheduled"\)/);
  assert.match(cronRoute, /syncTwitchAccountById\(account\.id, "scheduled"\)/);
  assert.match(youtubeSync, /scheduled:\$\{Math\.floor/);
  assert.match(vercel, /"path": "\/api\/cron\/social-sync"/);
  assert.match(vercel, /"schedule": "15 4 \* \* \*"/);
});

test("socialrapport en CSV nemen officiële API-metingen op", () => {
  assert.match(reportPage, /social_metric_snapshots/);
  assert.match(reportPage, /Automatische accountmetingen/);
  assert.match(reportPage, /Officiële API/);
  assert.match(reportExport, /social_metric_snapshots/);
  assert.match(reportExport, /Officiële API/);
});

test("social koppelingen hebben auditregistratie en een interne quotarem", () => {
  assert.match(quotaMigration, /quota_daily_limit/);
  assert.match(quotaMigration, /quota_warning_percent/);
  assert.match(quotaMigration, /audit_social_accounts_change/);
  assert.match(quotaMigration, /audit_social_sync_runs_change/);
  assert.match(youtubeSync, /quotaCostEstimate = 2/);
  assert.match(youtubeSync, /dagelijkse quotalimiet is bereikt/);
  assert.match(page, /Dagelijkse interne quotalimiet/);
  assert.match(page, /Quota:/);
  assert.match(audit, /social_accounts: "Social account"/);
  assert.match(audit, /social_sync_runs: "Social synchronisatie"/);
});

test("social integraties hebben finale acceptatiecontrole en beslispoorten", () => {
  for (const platform of ["youtube", "facebook", "instagram", "twitch"]) {
    assert.match(socialAcceptance, new RegExp(`${platform}: \\[`));
  }
  assert.doesNotMatch(socialAcceptance, /threads: \[/);
  assert.match(socialAcceptance, /OAuth-flow/);
  assert.match(socialAcceptance, /Handmatige sync uitvoeren/);
  assert.match(socialAcceptance, /Socialrapportage en CSV-export valideren/);
  assert.match(socialAcceptance, /platform: "Threads"/);
  assert.match(socialAcceptance, /platform: "LinkedIn"/);
  assert.match(socialAcceptance, /platform: "TikTok"/);
  assert.match(socialAcceptance, /platform: "X"/);
  assert.match(page, /FINALE ACCEPTATIE/);
  assert.match(page, /Platformtesten en synccontrole/);
  assert.match(page, /Klaar voor finale controle/);
  assert.match(page, /OAuth final test nodig/);
  assert.match(page, /BESLISPOORTEN/);
  assert.match(page, /Niet opnemen in v1/);
});
