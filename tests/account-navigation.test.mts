import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shell = readFileSync("src/components/app-shell.tsx", "utf8");
const accountPage = readFileSync("src/app/app/account/page.tsx", "utf8");
const accountActions = readFileSync("src/app/app/account/actions.ts", "utf8");
const callback = readFileSync("src/app/auth/callback/route.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260730103244_expand_user_profiles.sql", "utf8");

test("zijnavigatie volgt herkenbare werkstromen", () => {
  for (const group of [
    "Mijn werkplek",
    "Planning & uitvoering",
    "Relaties & communicatie",
    "Content & publicatie",
    "Organisatie",
    "Inzichten",
    "Beheer",
  ]) {
    assert.match(shell, new RegExp(`label: "${group.replace("&", "\\&")}"`));
  }
  for (const [before, after] of [
    ['href="/app/meldingen"', 'href="/app"'],
    ['label: "Projecten"', 'label: "Campagnes"'],
    ['label: "Campagnes"', 'label: "Social planning"'],
    ['label: "Shop & merchandise"', 'label: "Nieuwsbrieven"'],
    ['label: "Nieuwsbrieven"', 'label: "AI Hub"'],
    ['label: "Vergaderingen & besluiten"', 'label: "VZW-administratie"'],
    ['label: "Rapportage & KPI"', 'label: "Beheer"'],
    ['label: "Historiek"', 'label: "Activiteit"'],
    ['label: "Activiteit"', 'label: "Gebruikers & toegang"'],
  ]) {
    assert.ok(shell.indexOf(before) < shell.indexOf(after), `${before} moet voor ${after} staan`);
  }
  assert.doesNotMatch(shell, /href: "\/app\/financien\/rapportage"/);
  assert.match(shell, /href="\/app\/account"/);
  assert.match(shell, /\{ label: "Gebruikers & toegang", href: "\/app\/beheer\/gebruikers", icon: Users, roles: \["admin"\] \}/);
  assert.ok(shell.indexOf("<Navigation active={active}") < shell.indexOf("<GlobalSearchTrigger active={active"), "Zoeken moet onder de gegroepeerde navigatie staan");
});

test("accountpagina beheert profiel, beveiliging en voorkeuren", () => {
  assert.match(accountPage, /Persoonlijke gegevens/);
  assert.match(accountPage, /E-mailadres wijzigen/);
  assert.match(accountPage, /Wachtwoord wijzigen/);
  assert.match(accountPage, /Meldingsvoorkeuren/);
  assert.match(accountPage, /profile-completeness/);
});

test("Discord kan veilig gekoppeld en ontkoppeld worden", () => {
  assert.match(accountActions, /auth\.linkIdentity\(\{[\s\S]*provider: "discord"/);
  assert.match(accountActions, /auth\.getUserIdentities\(\)/);
  assert.match(accountActions, /data\.identities\.length < 2/);
  assert.match(accountActions, /auth\.unlinkIdentity\(discord\)/);
  assert.match(callback, /discordIdentityDetails/);
});

test("uitgebreide profielgegevens blijven onder eigen profiel-RLS vallen", () => {
  for (const column of [
    "first_name",
    "last_name",
    "pronouns",
    "bio",
    "location",
    "preferred_language",
    "timezone",
    "website_url",
    "discord_user_id",
    "discord_username",
  ]) {
    assert.match(migration, new RegExp(`add column if not exists ${column}`));
  }
  assert.match(migration, /profiles_discord_user_id_unique_idx/);
});
