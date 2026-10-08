import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import React from "react";
import { hasPermission } from "../src/lib/permissions.ts";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
function load(path: string, overrides: Record<string, unknown> = {}) {
  const compiled = { exports: {} as Record<string, unknown> };
  const code = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(code, { module: compiled, exports: compiled.exports, FormData, Date, URLSearchParams,
    require: (key: string) => key === "@/components/dossier-editor-gate" ? {dossierEditorGate:async()=>null} : key in overrides ? overrides[key] : require(key) });
  return compiled.exports;
}
const id = "11111111-1111-4111-8111-111111111111";
const campaignId = "22222222-2222-4222-8222-222222222222";
const partnerId = "33333333-3333-4333-8333-333333333333";
const constants = load("src/app/app/content/constants.ts");
const form = load("src/components/content-form.tsx", {
  "@/app/app/content/constants": constants,
  "@/lib/format": { formatDateTimeLocal: () => "" },
  "@/components/markdown-field": { MarkdownField: () => null },
}).ContentForm as React.ComponentType<Record<string, unknown>>;

function selectedValue(html: string, name: string) {
  const options = html.match(new RegExp(`<select name="${name}"[^>]*>([\\s\\S]*?)</select>`))?.[1];
  assert.ok(options, `select ${name} is present`);
  const selected = options.match(/<option[^>]*value="([^"]*)"[^>]*selected=""/);
  assert.ok(selected, `select ${name} has a selected option`);
  return selected[1];
}
async function fixture(detail: boolean, unavailable = false, role = "admin", capabilities: string[] = []) {
  const queries: { table: string; fields: string; organization?: string; active?: boolean }[] = [];
  const record = { id, title: "TESTFIXTURE", description: null, content_type: "social_post",
    status: "idea", priority: "normal", project_id: null, campaign_id: campaignId, partner_id: partnerId,
    channels: [], approval_status: "not_required" };
  const supabase = { from: (table: string) => {
    const call = { table, fields: "" } as (typeof queries)[number]; queries.push(call);
    const query: Record<string, unknown> = {};
    query.select = (fields: string) => { call.fields = fields; return query; };
    query.eq = (key: string, value: string) => { if (key === "organization_id") call.organization = value; return query; };
    query.is = (key: string, value: unknown) => { if (key === "deleted_at" && value === null) call.active = true; return query; };
    for (const key of ["order", "range", "limit", "maybeSingle"]) query[key] = () => query;
    query.then = (resolve: (result: unknown) => unknown) => {
      let data: unknown = [];
      if (table === "content_items") data = detail
        ? Object.fromEntries(Object.entries(record).filter(([key]) => call.fields.split(",").includes(key))) : [];
      if (table === "campaigns") data = unavailable ? null : [{ id: campaignId, title: "TESTFIXTURE campagne" }];
      if (table === "partners") data = unavailable ? null : [{ id: partnerId, name: "TESTFIXTURE partner" }];
      if (table === "migration_source_links") data = null;
      return Promise.resolve({ data, count: 0, error: null }).then(resolve);
    };
    return query;
  } };
  const passthrough = ({ children }: { children?: React.ReactNode }) => React.createElement("div", null, children);
  const overrides: Record<string, unknown> = {
    "next/link": { default: passthrough }, "next/navigation": { notFound: () => { throw Error("not found"); } },
    "@/lib/auth-context": { requireActiveMembership: async () => ({ supabase, membership: { organization_id: "fixture-org", role, capabilities, finance_role: "none" }, user: { id: "fixture-user" } }) },
    "@/lib/permissions": { hasPermission }, "@/lib/format": { formatDateTime: () => "" },
    "@/components/content-form": { ContentForm: form },
    "./actions": { createContent: () => {} }, "../actions": { updateContent: () => {} },
    "./constants": constants, "../constants": constants,
    "@/lib/dossier-relations": { loadDossierConnections: async () => ({}), loadRelationOptions: async () => [] },
  };
  for (const [path, component] of Object.entries({
    "app-shell": "AppShell", "form-modal": "FormModal", "approval-panel": "ApprovalPanel",
    "record-lifecycle-panel": "RecordLifecyclePanel", "record-connections-panel": "RecordConnectionsPanel",
    "task-create-modal": "TaskCreateModal", "saved-views": "SavedViews",
  })) overrides[`@/components/${path}`] = { [component]: passthrough };
  const pageExports = load(detail ? "src/app/app/content/[id]/page.tsx" : "src/app/app/content/page.tsx", overrides);
  const tree = await (pageExports.default as (props: unknown) => Promise<React.ReactNode>)({
    params: Promise.resolve({ id }), searchParams: Promise.resolve(detail ? { bewerken: "1" } : { nieuw: "1" }),
  });
  return { html: renderToStaticMarkup(tree), queries };
}
async function save(campaign: string, partner: string) {
  const writes: Record<string, unknown>[] = [];
  const query = { update: (value: Record<string, unknown>) => { writes.push(value); return query; },
    eq: () => query, is: () => query, select: () => query, maybeSingle: async () => ({ data: { id }, error: null }),
    then: (resolve: (result: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve) };
  const actions = load("src/app/app/content/actions.ts", {
    "next/cache": { revalidatePath: () => {} }, "next/navigation": { redirect: (url: string) => { throw Error(url); } },
    "@/lib/auth-context": { requirePermission: async () => ({ supabase: { from: () => query }, membership: { organization_id: "fixture-org" } }) },
    "@/lib/format": { localDateTimeToIso: () => null }, "./constants": constants,
  });
  const data = new FormData();
  for (const [key, value] of Object.entries({ id, title: "TESTFIXTURE gewijzigde tekst", content_type: "social_post",
    status: "idea", priority: "normal", approval_status: "not_required", campaign_id: campaign, partner_id: partner })) data.set(key, value);
  await assert.rejects((actions.updateContent as (data: FormData) => Promise<void>)(data), /succes=bijgewerkt/);
  return writes[0];
}
for (const unavailable of [false, true]) test(`Tekstwijziging behoudt relaties; keuzelijsten ${unavailable ? "onbeschikbaar" : "beschikbaar"}`, async () => {
  const { html, queries } = await fixture(true, unavailable);
  const written = await save(selectedValue(html, "campaign_id"), selectedValue(html, "partner_id"));
  assert.equal(written.campaign_id, campaignId); assert.equal(written.partner_id, partnerId);
  assert.equal(written.title, "TESTFIXTURE gewijzigde tekst");
  for (const table of ["campaigns", "partners"]) assert.ok(queries.some(q => q.table === table && q.organization === "fixture-org" && q.active));
});
test("Nieuw formulier biedt campagne en partner uit de eigen organisatie", async () => {
  const { html, queries } = await fixture(false);
  assert.ok(html.includes(`value="${campaignId}"`)); assert.ok(html.includes(`value="${partnerId}"`));
  assert.equal(selectedValue(html, "campaign_id"), ""); assert.equal(selectedValue(html, "partner_id"), "");
  for (const table of ["campaigns", "partners"]) assert.ok(queries.some(q => q.table === table && q.organization === "fixture-org" && q.active));
});
test("Bewust ontkoppelen blijft mogelijk", async () => {
  const written = await save("", "");
  assert.equal(written.campaign_id, null); assert.equal(written.partner_id, null);
});
test("Bewust een andere campagne kiezen behoudt de partner", async () => {
  const replacement = "44444444-4444-4444-8444-444444444444";
  const written = await save(replacement, partnerId);
  assert.equal(written.campaign_id, replacement); assert.equal(written.partner_id, partnerId);
});

for (const role of ["admin", "board", "member", "volunteer"]) test(`Content-schermen volgen manageContent voor ${role}`, async () => {
  const allowed = role !== "volunteer";
  const listing = await fixture(false, false, role);
  assert.equal(listing.html.includes('name="campaign_id"'), allowed);
  const detail = await fixture(true, false, role);
  assert.equal(detail.html.includes('name="campaign_id"'), allowed);
  assert.equal(detail.html.includes("Bewerken"), allowed);
});
test("Content-schermen tonen beheer bij expliciete Content-bevoegdheid", async () => {
  for (const detail of [false, true]) assert.ok((await fixture(detail, false, "volunteer", ["manageContent"])).html.includes('name="campaign_id"'));
});
