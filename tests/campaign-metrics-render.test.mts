import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as metrics from "../src/lib/campaign-metrics.ts";
import * as management from "../src/lib/management-report.ts";

const require = createRequire(import.meta.url);
const campaigns = [
  { id: "known-zero", title: "TESTFIXTURE nul", status: "active", impressions: 0, clicks: 0 },
  { id: "missing", title: "TESTFIXTURE ontbrekend", status: "active", impressions: null, clicks: null },
  { id: "known", title: "TESTFIXTURE bekend", status: "active", impressions: 120, clicks: 4 },
];

function fixture(role = "admin", campaignRows = campaigns) {
  const calls: { table: string; filters: Record<string, unknown> }[] = [];
  const from = (table: string) => {
    const call = { table, filters: {} as Record<string, unknown> }; calls.push(call);
    const result = () => ({ data: table === "campaigns" ? campaignRows : table === "portal_access" ? [{ id: "access", access_type: "sponsor", partners: { name: "TESTFIXTURE" } }] : [], error: null });
    const query: Record<string, unknown> = {};
    for (const method of ["select", "is", "order", "not", "gte", "lt", "neq"]) query[method] = () => query;
    query.eq = (key: string, value: unknown) => { call.filters[key] = value; return query; };
    query.maybeSingle = async () => ({ data: table === "partners" ? { name: "TESTFIXTURE", status: "active", partner_type: "sponsor" } : { title: "TESTFIXTURE" }, error: null });
    query.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve);
    return query;
  };
  const supabase = { from, auth: { getUser: async () => ({ data: { user: { id: "fixture-user" } } }) }, rpc: async () => ({ data: { partner: { name: "TESTFIXTURE" }, campaigns: campaignRows, deliverables: [], kpis: [] }, error: null }) };
  const overrides: Record<string, unknown> = {
    "@/lib/campaign-metrics": metrics, "@/lib/management-report": management,
    "@/lib/auth-context": { requireActiveMembership: async () => ({ supabase, membership: { organization_id: "fixture-org", role } }) },
    "@/lib/supabase/server": { createClient: async () => supabase },
    "@/lib/reporting-scope": { isActiveSponsor: () => true },
    "@/lib/format": { formatLocalDate: () => "TESTDATUM", formatEventEndpoint: () => "TESTDATUM" },
    "@/lib/google-workspace": { googlePitchdeckConfiguration: () => ({ sponsor: false }) },
    "@/app/app/google-document-actions": { generateSponsorPitchdeck: () => {} },
    "@/app/auth/actions": { signOut: () => {} },
    "@/components/app-shell": { AppShell: ({ children }: { children: React.ReactNode }) => React.createElement("main", null, children) },
    "@/components/management-report-actions": { ManagementReportActions: () => null },
    "next/link": ({ children, href }: { children: React.ReactNode; href: string }) => React.createElement("a", { href }, children),
    "next/image": () => null,
    "next/navigation": { notFound: () => { throw Error("404"); }, redirect: (path: string) => { throw Error(path); } },
  };
  function load(file: string) {
    const compiled = { exports: {} as Record<string, unknown> };
    const code = ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    runInNewContext(code, { module: compiled, exports: compiled.exports, URL, Response, Date, Intl, require: (key: string) => key in overrides ? overrides[key] : require(key) });
    return compiled.exports;
  }
  return { load, calls };
}

for (const kind of ["sponsors", "events"]) {
  test(`${kind}: gerenderd rapport onderscheidt nul, ontbrekend en gedeeltelijke impressies`, async () => {
    const f = fixture();
    const page = f.load(`src/app/app/rapportage/${kind}/[id]/page.tsx`).default as (props: unknown) => Promise<React.ReactNode>;
    const html = renderToStaticMarkup(await page({ params: Promise.resolve({ id: "fixture" }), searchParams: Promise.resolve({}) }));
    assert.match(html, /120 \(gedeeltelijk\)/);
    assert.match(html, /2 van 3 campagnes gemeten/);
    assert.match(html, /Ontbrekende meting/);
    assert.match(html, /<td>0<\/td>/);
    assert.doesNotMatch(html, /<span>Bereik<\/span>/);
    assert.ok(f.calls.filter((call) => call.table === "campaigns").every((call) => call.filters.organization_id === "fixture-org"));
  });

  test(`${kind}: CSV bewaart nul en noemt een ontbrekende meting expliciet`, async () => {
    const f = fixture();
    const get = f.load(`src/app/app/rapportage/${kind}/[id]/export/route.ts`).GET as (request: Request, props: unknown) => Promise<Response>;
    const response = await get(new Request("https://fixture.invalid/export"), { params: Promise.resolve({ id: "fixture" }) });
    const csv = await response.text();
    assert.equal(response.status, 200);
    assert.match(csv, /"TESTFIXTURE nul"[^\r\n]*;"0";"0"/);
    assert.match(csv, /"TESTFIXTURE ontbrekend"[^\r\n]*;"Ontbrekende meting";"Ontbrekende meting"/);
  });

  test(`${kind}: een vrijwilliger krijgt geen toegang tot de export`, async () => {
    const f = fixture("volunteer");
    const get = f.load(`src/app/app/rapportage/${kind}/[id]/export/route.ts`).GET as (request: Request, props: unknown) => Promise<Response>;
    const response = await get(new Request("https://fixture.invalid/export"), { params: Promise.resolve({ id: "fixture" }) });
    assert.equal(response.status, 403);
    assert.equal(f.calls.length, 0);
  });
}

test("sponsorportal houdt ontbrekende metingen zichtbaar en selecteert de ingelogde gebruiker", async () => {
  const f = fixture();
  const page = f.load("src/app/portal/page.tsx").default as (props: unknown) => Promise<React.ReactNode>;
  const html = renderToStaticMarkup(await page({ searchParams: Promise.resolve({}) }));
  assert.match(html, /Ontbrekende meting impressies/);
  assert.match(html, /0 impressies/);
  assert.equal(f.calls.find((call) => call.table === "portal_access")?.filters.user_id, "fixture-user");
});
