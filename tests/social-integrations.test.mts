import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260803150000_add_social_integration_core.sql", "utf8");
const page = readFileSync("src/app/app/integraties/social/page.tsx", "utf8");
const actions = readFileSync("src/app/app/integraties/social/actions.ts", "utf8");
const connectorDefinitions = readFileSync("src/lib/social-connectors.ts", "utf8");
const youtube = readFileSync("src/lib/youtube-integration.ts", "utf8");
const youtubeStart = readFileSync("src/app/app/integraties/social/youtube/start/route.ts", "utf8");
const youtubeCallback = readFileSync("src/app/app/integraties/social/youtube/callback/route.ts", "utf8");
const youtubeSync = readFileSync("src/lib/youtube-sync.ts", "utf8");
const cronRoute = readFileSync("src/app/api/cron/social-sync/route.ts", "utf8");
const vercel = readFileSync("vercel.json", "utf8");
const reportPage = readFileSync("src/app/app/rapportage/social/page.tsx", "utf8");
const reportExport = readFileSync("src/app/app/rapportage/social/export/route.ts", "utf8");
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
  assert.match(page, /Geregistreerde kanalen/);
  assert.match(page, /Recente synchronisaties/);
  assert.match(page, /OAuth-tokens staan versleuteld in Vault/);
  assert.match(page, /changeSocialAccountState/);
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
