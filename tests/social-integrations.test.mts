import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260803150000_add_social_integration_core.sql", "utf8");
const page = readFileSync("src/app/app/integraties/social/page.tsx", "utf8");
const actions = readFileSync("src/app/app/integraties/social/actions.ts", "utf8");
const connectorDefinitions = readFileSync("src/lib/social-connectors.ts", "utf8");

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
