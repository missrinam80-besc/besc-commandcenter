import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path: string) => readFile(new URL(path, root), "utf8");

test("globale UX-polish houdt lege staten en feedbackmeldingen rustig in light en dark mode", async () => {
  const css = await source("src/app/globals.css");

  assert.match(css, /Laatste UX-polish/);
  assert.match(css, /\.app-shell :where\(\.empty,\.empty-state\)/);
  assert.match(css, /\.app-shell \.success/);
  assert.match(css, /\.app-shell \.error-note/);
  assert.match(css, /\.app-shell\[data-theme="dark"\] \.success/);
  assert.match(css, /\.app-shell\[data-theme="dark"\] \.error-note/);
});

test("detail- en integratiepanelen gebruiken themavariabelen in plaats van harde lichte vlakken", async () => {
  const css = await source("src/app/globals.css");

  assert.match(css, /record-metadata/);
  assert.match(css, /drive-connected-row/);
  assert.match(css, /integration-security/);
  assert.doesNotMatch(css, /acceptance-run-banner/);
  assert.match(css, /background-color:var\(--theme-control\)/);
});

test("dark mode corrigeert modulepanelen met eigen lichte CSS", async () => {
  const css = await source("src/app/globals.css");

  assert.match(css, /calendar-summary article/);
  assert.match(css, /approval-queue>article/);
  assert.match(css, /drive-register/);
  assert.match(css, /management-hero-metrics article/);
  assert.match(css, /report-kpi-grid>article/);
  assert.match(css, /knowledge-grid>a/);
  assert.match(css, /\.app-shell\[data-theme="dark"\] :where\(\.approval-current/);
  assert.match(css, /prefers-color-scheme:dark/);
});
