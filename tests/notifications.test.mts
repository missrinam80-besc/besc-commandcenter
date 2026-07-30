import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260726130000_add_deadline_notifications.sql", import.meta.url),
  "utf8",
);
const notificationsPage = readFileSync(
  new URL("../src/app/app/meldingen/page.tsx", import.meta.url),
  "utf8",
);
const operationalMigration = readFileSync(
  new URL("../supabase/migrations/20260730180000_add_operational_notifications.sql", import.meta.url),
  "utf8",
);

test("deadlinegenerator bewaakt alle afgesproken BESC-bronnen", () => {
  for (const table of [
    "public.tasks",
    "public.projects",
    "public.events",
    "public.campaigns",
    "public.content_items",
    "public.partners",
    "public.compliance_deadlines",
    "public.knowledge_articles",
  ]) {
    assert.match(migration, new RegExp(table.replace(".", "\\.")));
  }
});

test("gegenereerde meldingen worden per gebruiker gededupliceerd", () => {
  assert.match(migration, /notifications_user_dedupe_uidx/);
  assert.match(
    migration,
    /on conflict\(user_id,dedupe_key\) where dedupe_key is not null do nothing/g,
  );
});

test("meldingsvoorkeuren zijn uitsluitend persoonlijk toegankelijk", () => {
  assert.match(migration, /user_id=\(select auth\.uid\(\)\)/);
  assert.match(migration, /private\.is_active_member\(organization_id\)/);
  assert.match(migration, /alter table public\.notification_preferences enable row level security/);
});

test("de meldingenpagina biedt filters, urgentie en persoonlijke voorkeuren", () => {
  assert.match(notificationsPage, /Deadlinewaarschuwingen/);
  assert.match(notificationsPage, /Dagoverzicht/);
  assert.match(notificationsPage, /Weekoverzicht/);
  assert.match(notificationsPage, /severity-\$\{n\.severity\}/);
  assert.match(notificationsPage, /filter=overzichten/);
  assert.match(notificationsPage, /filter=sponsor_follow_up/);
  assert.match(notificationsPage, /filter=event_readiness/);
  assert.match(notificationsPage, /filter=meeting_follow_up/);
  assert.match(notificationsPage, /Operationele opvolging/);
});

test("operationele meldingen bewaken events en vergaderingen", () => {
  assert.match(operationalMigration, /public\.events/);
  assert.match(operationalMigration, /missing_runbook/);
  assert.match(operationalMigration, /missing_calendar/);
  assert.match(operationalMigration, /public\.meetings/);
  assert.match(operationalMigration, /missing_minutes/);
  assert.match(operationalMigration, /open_actions/);
});

test("operationele signalen zijn persoonlijk, herhaalbaar en gededupliceerd", () => {
  assert.match(operationalMigration, /current_user_id uuid := \(select auth\.uid\(\)\)/);
  assert.match(operationalMigration, /to_char\(local_today,'IYYY-IW'\)/);
  assert.match(
    operationalMigration,
    /on conflict\(user_id,dedupe_key\) where dedupe_key is not null do nothing/g,
  );
  assert.match(operationalMigration, /follow_up_notifications/);
});

test("één refreshfunctie combineert deadlines en operationele opvolging", () => {
  assert.match(operationalMigration, /public\.generate_my_notifications\(p_now\)/);
  assert.match(operationalMigration, /public\.generate_my_operational_notifications\(p_now\)/);
  assert.match(notificationsPage, /refresh_my_notifications/);
});
