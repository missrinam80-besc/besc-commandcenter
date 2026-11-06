import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as presentation from "../src/lib/social-report-presentation.ts";
import * as management from "../src/lib/management-report.ts";

const require = createRequire(import.meta.url);
const fetched = "2026-11-06T11:10:16Z";
const rows = [
  { id: "duration", normalized_metric: "period_average_view_duration", platform_metric: "averageViewDuration", metric_value: 13, period_start: "2026-10-08T00:00:00Z", period_end: "2026-11-04T23:59:59Z", fetched_at: fetched, source_url: "https://www.youtube.com/channel/fixture", social_accounts: { account_name: "TESTFIXTURE", platform: "youtube" } },
  { id: "instant", normalized_metric: "current_viewers", platform_metric: "viewer_count", metric_value: 0, period_start: null, period_end: fetched, fetched_at: fetched, source_url: "https://www.twitch.tv/fixture", social_accounts: { account_name: "TESTFIXTURE", platform: "twitch" } },
  { id: "missing", normalized_metric: "subscribers", platform_metric: "subscriberCount", metric_value: null, period_start: null, period_end: null, fetched_at: fetched, source_url: null, social_accounts: { account_name: "TESTFIXTURE", platform: "youtube" } },
];

function fixture(failedTable?: string) {
  const supabase = { from(table: string) {
    let lifetime = false;
    const q: Record<string, unknown> = {};
    for (const method of ["select", "eq", "gte", "lte", "order"]) q[method] = () => q;
    q.is = (column: string) => { if (column === "period_end") lifetime = true; return q; };
    q.then = (resolve: (v: unknown) => unknown) => Promise.resolve({
      data: table === failedTable ? null : table === "social_metric_snapshots" ? rows.filter(r => lifetime ? r.period_end === null : r.period_end !== null) : [],
      error: table === failedTable ? { message: "PRIVATE_DATABASE_ERROR" } : null,
    }).then(resolve);
    return q;
  } };
  const overrides: Record<string, unknown> = {
    "@/lib/social-report-presentation": presentation,
    "@/lib/management-report": management,
    "@/lib/auth-context": { requireActiveMembership: async () => ({ supabase, membership: { organization_id: "fixture-org", role: "admin" } }) },
    "@/components/app-shell": { AppShell: ({ children }: { children: React.ReactNode }) => React.createElement("main", null, children) },
    "@/components/management-report-actions": { ManagementReportActions: () => null },
    "next/link": ({ children, href }: { children: React.ReactNode; href: string }) => React.createElement("a", { href }, children),
  };
  function load(path: string) {
    const compiled = { exports: {} as { default: (props: { searchParams: Promise<Record<string, string>> }) => Promise<React.ReactNode>; GET: (request: Request) => Promise<Response> } };
    const code = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    runInNewContext(code, { module: compiled, exports: compiled.exports, URL, Response, Date, Intl, require: (key: string) => key in overrides ? overrides[key] : require(key) });
    return compiled.exports;
  }
  return { load };
}

test("Gerenderd socialrapport behoudt echte nul, toont ontbrekend en verduidelijkt eenheden en historie", async () => {
  const page = fixture().load("src/app/app/rapportage/social/page.tsx").default;
  const html = renderToStaticMarkup(await page({ searchParams: Promise.resolve({ jaar: "2026" }) }));
  assert.match(html, /13 seconden/);
  assert.match(html, /Gelijktijdige kijkers/);
  assert.match(html, /Momentopname/);
  assert.match(html, /Totaalstand op/);
  assert.match(html, /<td>0<\/td>/);
  assert.match(html, /Ontbrekende meting/);
  assert.match(html, /mogen niet worden opgeteld/);
  assert.match(html, /Opgeslagen meetpunten/);
  assert.doesNotMatch(html, /role="alert"/);
});

for (const table of ["social_posts", "kpi_records", "social_metric_snapshots"]) {
  test(`Opvraagfout in ${table} toont onvolledig rapport zonder schijnbaar complete telling`, async () => {
    const page = fixture(table).load("src/app/app/rapportage/social/page.tsx").default;
    const html = renderToStaticMarkup(await page({ searchParams: Promise.resolve({ jaar: "2026" }) }));
    assert.match(html, /role="alert"/);
    assert.match(html, /rapport is onvolledig/);
    assert.match(html, /Opgeslagen meetpunten<\/span><strong>—<\/strong>/);
    assert.doesNotMatch(html, /PRIVATE_DATABASE_ERROR/);
    if (table === "kpi_records") assert.match(html, /<td>youtube<\/td><td>0<\/td><td>—<\/td>/);
    if (table === "social_posts") assert.match(html, /<td>youtube<\/td><td>—<\/td>/);
  });
  if (table !== "social_posts") test(`CSV weigert gedeeltelijke export bij opvraagfout in ${table}`, async () => {
    const get = fixture(table).load("src/app/app/rapportage/social/export/route.ts").GET;
    const response = await get(new Request("https://example.invalid/export?jaar=2026"));
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    const body = await response.text();
    assert.doesNotMatch(body, /TESTFIXTURE|PRIVATE_DATABASE_ERROR/);
  });
}

test("CSV behoudt oorspronkelijke metric en eenheid zonder nul voor ontbrekende waarde", async () => {
  const get = fixture().load("src/app/app/rapportage/social/export/route.ts").GET;
  const response = await get(new Request("https://example.invalid/export?jaar=2026"));
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.match(body, /"averageViewDuration";"13";"";"measured";"";"";"seconden"/);
  assert.match(body, /"subscriberCount";"Ontbrekende meting";"";"missing"/);
  assert.equal(presentation.socialMetricPresentation("period_estimated_minutes_watched").unit, "minuten");
  assert.equal(presentation.socialMeasurementValue(null), "Ontbrekende meting");
});
