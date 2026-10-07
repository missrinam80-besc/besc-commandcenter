import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { operationalModules } from "../src/app/app/operations/config.ts";
import { campaignTemplates } from "../src/lib/campaign-templates.ts";

const require = createRequire(import.meta.url);
const id = "11111111-1111-4111-8111-111111111111";
function load(path: string, overrides: Record<string, unknown>) {
  const compiled = { exports: {} as Record<string, unknown> };
  const code = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(code, { module: compiled, exports: compiled.exports, FormData,
    require: (key: string) => key in overrides ? overrides[key] : require(key) });
  return compiled.exports;
}
const component = load("src/components/operational-record-form.tsx", {
  "@/app/app/operations/config": { operationalModules },
  "@/lib/campaign-templates": { campaignTemplates },
  "@/components/markdown-field": { MarkdownField: ({ name, defaultValue }: { name: string; defaultValue: string }) => React.createElement("textarea", { name, defaultValue }) },
  "@/lib/community-people": { communityRoleLabels: {} },
  "@/lib/format": { formatDateTimeLocal: (value: string) => value },
}).OperationalRecordForm as (props: Record<string, unknown>) => React.ReactNode;

function markup(channels: readonly unknown[], module = "campagnes", existing = true) {
  return renderToStaticMarkup(component({ action: () => {}, module,
    record: { ...(existing ? { id } : {}), title: "TESTFIXTURE", campaign_type: "event_promo", status: "idea", channels } }));
}
function channelInputs(html: string) {
  return [...html.matchAll(/<input\b[^>]*>/g)].map(([tag]) => ({
    name: /name="([^"]*)"/.exec(tag)?.[1],
    value: /value="([^"]*)"/.exec(tag)?.[1] ?? "",
    checked: /\bchecked(?:=|\s|>)/.test(tag),
  })).filter((input) => input.name === "channels");
}
async function savedChannels(channels: readonly string[], remove: string[] = []) {
  // Submit the checked controls from the real rendered form through the real update action.
  const form = new FormData();
  for (const [key, value] of Object.entries({ module: "campagnes", id, title: "TESTFIXTURE", type: "event_promo", status: "idea", notes: "Gewijzigde briefing" })) form.set(key, value);
  for (const input of channelInputs(markup(channels))) if (input.checked && !remove.includes(input.value)) form.append("channels", input.value);
  let saved: Record<string, unknown> | undefined;
  const query = {
    update(values: Record<string, unknown>) { saved = values; return query; },
    eq() { return query; }, is() { return query; }, select() { return query; },
    async maybeSingle() { return { data: { id }, error: null }; },
  };
  const action = load("src/app/app/operations/actions.ts", {
    "next/cache": { revalidatePath: () => {} },
    "next/navigation": { redirect: (url: string) => { throw Error(url); } },
    "@/lib/auth-context": { requirePermission: async () => ({ supabase: { from: () => query }, membership: { organization_id: "fixture-org" } }) },
    "@/lib/format": { localDateTimeToIso: () => null },
    "@/lib/campaign-templates": { campaignTemplates },
    "./config": { operationalModules },
  }).updateOperationalRecord as (form: FormData) => Promise<void>;
  await assert.rejects(action(form), /succes=bijgewerkt/);
  assert.equal(saved?.notes, "Gewijzigde briefing");
  return Array.from(saved?.channels as string[]);
}

test("tekstwijziging bewaart alle kanalen van ieder campagnesjabloon, inclusief Eventbrite", async () => {
  for (const template of Object.values(campaignTemplates)) {
    assert.deepEqual((await savedChannels(template.channels)).sort(), [...new Set(template.channels)].sort());
  }
});
test("bestaande aanvullende kanalen blijven zichtbaar en worden slechts eenmaal aangeboden", async () => {
  const channels = ["Discord", "Eventbrite", "BESC forum", "Eventbrite"];
  const inputs = channelInputs(markup(channels));
  assert.equal(inputs.filter((input) => input.value === "Eventbrite").length, 1);
  assert.ok(inputs.some((input) => input.value === "BESC forum" && input.checked));
  assert.deepEqual(await savedChannels(channels), ["Discord", "Eventbrite", "BESC forum"]);
});
test("bewust uitvinken verwijdert een kanaal, ook wanneer alle kanalen worden uitgevinkt", async () => {
  assert.deepEqual(await savedChannels(["Discord", "Eventbrite"], ["Eventbrite"]), ["Discord"]);
  assert.deepEqual(await savedChannels(["Eventbrite"], ["Eventbrite"]), []);
});
test("Eventbrite is beschikbaar voor nieuwe campagnes zonder andere kanalen vooraf te selecteren", () => {
  const inputs = channelInputs(markup([], "campagnes", false));
  assert.ok(inputs.some((input) => input.value === "Eventbrite"));
  assert.ok(inputs.every((input) => !input.checked));
});
test("campagnekanalen breiden de platformkeuze van social planning niet uit", () => {
  const html = markup(["Eventbrite", "BESC forum"], "social");
  assert.doesNotMatch(html, /Eventbrite|BESC forum/);
  assert.match(html, /<option[^>]*>Discord<\/option>/);
});
