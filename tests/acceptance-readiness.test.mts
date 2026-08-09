import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("src/app/app/acceptatie/page.tsx", "utf8");
const shell = readFileSync("src/components/app-shell.tsx", "utf8");
const css = readFileSync("src/app/globals.css", "utf8");

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
    "manualChecks",
    "decisionGates",
    "Supabase Advisors",
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
    "acceptance-gates",
  ]) {
    assert.match(css, new RegExp(`\\.${className}`));
  }
});
