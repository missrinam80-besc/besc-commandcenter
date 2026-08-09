import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("src/app/app/acceptatie/page.tsx", "utf8");
const actions = readFileSync("src/app/app/acceptatie/actions.ts", "utf8");
const exportRoute = readFileSync("src/app/app/acceptatie/export/route.ts", "utf8");
const helper = readFileSync("src/lib/acceptance.ts", "utf8");
const shell = readFileSync("src/components/app-shell.tsx", "utf8");
const css = readFileSync("src/app/globals.css", "utf8");
const migration = readFileSync("supabase/migrations/20260809160000_add_acceptance_runs.sql", "utf8");

test("productieacceptatie is bereikbaar voor bestuur en beheer", () => {
  assert.match(shell, /href: "\/app\/acceptatie"/);
  assert.match(shell, /Productieacceptatie: "Productie acceptatie"/);
  assert.match(page, /AppShell active="Productieacceptatie"/);
  assert.match(page, /Alleen bestuur en beheerders/);
});

test("productieacceptatie controleert configuratie, data en handmatige rooktest", () => {
  for (const expected of [
    "googleWorkspaceConfiguration",
    "googleGmailConfiguration",
    "googlePitchdeckConfiguration",
    "Supabase client",
    "Supabase server key",
    "Google Workspace",
    "Gmail-concepten",
    "Pitchdecktemplates",
    "AI-provider",
    "Actieve gebruikers",
    "Kennisbank",
    "Goedkeuringswerkvoorraad",
    "Documentregistraties",
    "Social pilots",
    "acceptanceChecks",
    "decisionGates",
    "Supabase Advisors",
    "startAcceptanceRun",
    "updateAcceptanceCheck",
    "completeAcceptanceRun",
    "acceptance_check_results",
    "Laatste acceptatierondes",
    "CSV-export",
    "/app/acceptatie/export?run=",
  ]) {
    assert.match(page, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("productieacceptatie heeft eigen responsive styling", () => {
  for (const className of [
    "acceptance-page",
    "acceptance-score",
    "acceptance-grid",
    "acceptance-list",
    "manual-check-grid",
    "acceptance-start-form",
    "acceptance-check-table",
    "acceptance-check-row",
    "acceptance-complete-actions",
    "acceptance-run-list",
    "acceptance-run-actions",
    "acceptance-gates",
  ]) {
    assert.match(css, new RegExp(`\\.${className}`));
  }
  assert.match(css, /\.module-body\.acceptance-page>\.form-card:has\(>\.form-heading\+form\)/);
  assert.match(css, /position:static!important/);
});

test("acceptatierondes worden per organisatie en managerrechten opgeslagen", () => {
  assert.match(migration, /create table public\.acceptance_runs/);
  assert.match(migration, /create table public\.acceptance_check_results/);
  assert.match(migration, /alter table public\.acceptance_runs enable row level security/);
  assert.match(migration, /alter table public\.acceptance_check_results enable row level security/);
  assert.match(migration, /private\.is_org_manager\(organization_id\)/);
  assert.match(migration, /unique \(run_id, check_key\)/);
  assert.match(actions, /startAcceptanceRun/);
  assert.match(actions, /updateAcceptanceCheck/);
  assert.match(actions, /completeAcceptanceRun/);
  assert.match(actions, /requireManagerRole\(membership\.role\)/);
  assert.match(actions, /acceptanceChecks\.map/);
});

test("acceptatierapport kan als CSV worden geëxporteerd", () => {
  assert.match(exportRoute, /acceptance_runs/);
  assert.match(exportRoute, /acceptance_check_results/);
  assert.match(exportRoute, /Content-Disposition/);
  assert.match(exportRoute, /text\/csv/);
  assert.match(exportRoute, /acceptatierapport-/);
  assert.match(exportRoute, /acceptanceStatusLabel/);
  assert.match(exportRoute, /Geen toegang/);
});

test("acceptatiechecklist heeft vaste keys voor releasebewijs", () => {
  for (const key of [
    "auth-roles",
    "account-lifecycle",
    "inbox-conversion",
    "core-records",
    "drive-folders",
    "calendar-sync",
    "generated-documents",
    "gmail-approval",
    "newsletter-flow",
    "reporting-exports",
    "social-pilots",
    "production-smoke",
  ]) {
    assert.match(helper, new RegExp(key));
  }
});
