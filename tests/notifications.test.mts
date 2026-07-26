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
});
