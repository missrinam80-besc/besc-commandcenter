import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path: string) => readFile(new URL(path, root), "utf8");

test("kennisbank heeft een startpunt en doorzoekt inhoud", async () => {
  const page = await source("src/app/app/kennisbank/page.tsx");

  assert.match(page, /Startpunt/);
  assert.match(page, /Start hier: werken met BESC Command Center/);
  assert.match(page, /Open handleiding/);
  assert.match(page, /body\.ilike/);
  assert.match(page, /Zoek in titel, samenvatting of inhoud/);
});

test("kennisbankformulieren gebruiken modal en Markdown", async () => {
  const [page, detail, form] = await Promise.all([
    source("src/app/app/kennisbank/page.tsx"),
    source("src/app/app/kennisbank/[id]/page.tsx"),
    source("src/components/knowledge-form.tsx"),
  ]);

  assert.match(page, /FormModal/);
  assert.match(detail, /FormModal/);
  assert.match(detail, /MarkdownContent/);
  assert.match(form, /MarkdownField/);
  assert.doesNotMatch(form, /name="title"[^>]*\brequired\b/);
});

test("kennisbank gebruikt een categoriedropdown in plaats van een labelrij", async () => {
  const [page, styles] = await Promise.all([
    source("src/app/app/kennisbank/page.tsx"),
    source("src/app/knowledge.css"),
  ]);

  assert.match(page, /knowledge-category-picker/);
  assert.match(page, /<select name="categorie"/);
  assert.doesNotMatch(page, /knowledge-category-strip/);
  assert.match(styles, /knowledge-category-picker/);
  assert.doesNotMatch(styles, /knowledge-category-strip/);
  assert.match(styles, /knowledge-card-top\{[^}]*gap:10px/);
});

test("eerste Command Center-handleidingen worden idempotent geseed", async () => {
  const [migration, expanded] = await Promise.all([
    source("supabase/migrations/20260809090000_seed_knowledge_command_center_guides.sql"),
    source("supabase/migrations/20260812143000_expand_command_center_knowledge_guides.sql"),
  ]);

  for (const title of [
    "Start hier: werken met BESC Command Center",
    "Processen en automatisaties in BESC Command Center",
    "Rollen, rechten en databeheer",
    "Snelstart per module",
  ]) {
    assert.match(migration, new RegExp(title));
  }
  assert.match(migration, /on conflict \(organization_id, name\) do update/);
  assert.match(migration, /if not exists/);
  assert.match(migration, /'published'/);
  for (const title of [
    "Handleiding BESC Command Center",
    "Werken met Inbox",
    "Werken met Taken",
    "Projecten beheren",
    "Events beheren",
    "Campagnes beheren",
    "Google Drive-integratie",
    "Google Calendar-integratie",
    "Gmail-concepten en goedkeuringen",
    "Nieuwsbrieven",
    "Rapportage & KPI",
    "Acceptatieproces",
    "Rollen en rechten",
  ]) {
    assert.match(expanded, new RegExp(title));
  }
  assert.match(expanded, /knowledge_articles_org_title_active_idx/);
  assert.match(expanded, /on conflict \(organization_id, title\) where deleted_at is null do update/);
});

test("Home biedt onboardinglinks naar de Command Center-handleidingen", async () => {
  const [dashboard, styles] = await Promise.all([
    source("src/components/dashboard.tsx"),
    source("src/app/globals.css"),
  ]);

  assert.match(dashboard, /AAN DE SLAG/);
  assert.match(dashboard, /Command Center handleidingen/);
  assert.match(dashboard, /Start hier/);
  assert.match(dashboard, /Processen en automatisaties/);
  assert.match(dashboard, /Rollen en rechten/);
  assert.match(styles, /onboarding-panel/);
  assert.match(styles, /onboarding-links/);
});
