import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shell = readFileSync("src/components/app-shell.tsx", "utf8");
const accountPage = readFileSync("src/app/app/account/page.tsx", "utf8");
const accountActions = readFileSync("src/app/app/account/actions.ts", "utf8");
const callback = readFileSync("src/app/auth/callback/route.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260730103244_expand_user_profiles.sql", "utf8");
const themeMigration = readFileSync("supabase/migrations/20260803140000_add_profile_theme_preference.sql", "utf8");
const themeCss = readFileSync("src/app/globals.css", "utf8");

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
    ['label: "Rapportage & KPI"', 'label: "Social inzichten"'],
    ['label: "Social inzichten"', 'label: "Management overzicht"'],
    ['label: "Management overzicht"', 'label: "Sponsorrapportage"'],
    ['label: "Sponsorrapportage"', 'label: "Streamerrapportage"'],
    ['label: "Streamerrapportage"', 'label: "Beheer"'],
    ['label: "Integraties"', 'label: "Rechtencontrole"'],
    ['label: "Archief"', 'label: "Historiek"'],
    ['label: "Historiek"', 'label: "Activiteit"'],
    ['label: "Activiteit"', 'label: "Gebruikers & toegang"'],
  ]) {
    assert.ok(shell.indexOf(before) < shell.indexOf(after), `${before} moet voor ${after} staan`);
  }
  assert.doesNotMatch(shell, /href: "\/app\/financien\/rapportage"/);
  assert.match(shell, /href="\/app\/account"/);
  assert.match(shell, /helpHref\(active\)/);
  assert.match(shell, /Help bij deze pagina/);
  assert.match(shell, /context-help-link/);
  assert.doesNotMatch(shell, /Productieacceptatie/);
  assert.match(shell, /\{ label: "Sponsorrapportage", href: "\/app\/rapportage\/sponsors", icon: Handshake, roles: \["admin", "board", "member"\] \}/);
  assert.match(shell, /\{ label: "Streamerrapportage", href: "\/app\/rapportage\/creators", icon: UserRoundSearch, roles: \["admin", "board", "member"\] \}/);
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

test("weergavevoorkeur volgt systeem, licht of donker en blijft per gebruiker bewaard", () => {
  assert.match(themeMigration, /theme_preference in \('system','light','dark'\)/);
  assert.match(accountPage, /name="theme_preference" value="system"/);
  assert.match(accountPage, /name="theme_preference" value="light"/);
  assert.match(accountPage, /name="theme_preference" value="dark"/);
  assert.match(accountActions, /theme_preference: parsed\.data\.theme_preference/);
  assert.match(shell, /data-theme=\{profile\?\.theme_preference \|\| "system"\}/);
  assert.match(themeCss, /prefers-color-scheme:dark/);
  assert.match(themeCss, /color-scheme:dark/);
  assert.match(themeCss, /--theme-field:#1a1e1c/);
  assert.match(themeCss, /--theme-control:#292f2b/);
  assert.match(themeCss, /input\[type="file"\]::file-selector-button/);
  assert.match(themeCss, /outline:3px solid var\(--theme-focus\)/);
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
