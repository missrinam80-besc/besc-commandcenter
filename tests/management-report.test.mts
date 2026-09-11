import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { managementPeriod, percentageDelta, targetScore } from "../src/lib/management-report.ts";

const source = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("maandrapport vergelijkt met de vorige kalendermaand", () => {
  const range = managementPeriod("month", new Date(2026, 0, 15));
  assert.equal(range.start.toISOString().slice(0, 10), "2026-01-01");
  assert.equal(range.previousStart.toISOString().slice(0, 10), "2025-12-01");
});

test("kwartaalrapport respecteert kwartaalgrenzen", () => {
  const range = managementPeriod("quarter", new Date(2026, 7, 10));
  assert.equal(range.label, "Q3 2026");
  assert.equal(range.start.toISOString().slice(0, 10), "2026-07-01");
  assert.equal(range.end.toISOString().slice(0, 10), "2026-10-01");
});

test("procentuele ontwikkeling behandelt een lege vergelijkingsperiode", () => {
  assert.equal(percentageDelta(12, 10), 20);
  assert.equal(percentageDelta(0, 0), 0);
  assert.equal(percentageDelta(4, 0), null);
});

test("doelscore telt alleen KPI's met een doel", () => {
  assert.deepEqual(targetScore([{ value: 10, target: 8 }, { value: 4, target: 5 }, { value: 3, target: null }]), { reached: 1, total: 2, percentage: 50 });
});

test("managementoverzicht markeert het eigen navigatie-item als actief", async () => {
  const page = await source("src/app/app/rapportage/management/page.tsx");
  assert.match(page, /AppShell active="Management overzicht"/);
  assert.doesNotMatch(page, /AppShell active="Rapportage & KPI"/);
});
