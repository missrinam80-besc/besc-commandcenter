import assert from "node:assert/strict";
import test from "node:test";
import { eventDossierTabs, resolveEventDossierTab } from "../src/lib/event-dossier-tabs.ts";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { hasPermission } from "../src/lib/permissions.ts";

test("elk eventtabblad is rechtstreeks bereikbaar en onbekende tabs vallen terug op het overzicht", () => {
  for (const tab of eventDossierTabs) assert.equal(resolveEventDossierTab({ tab: tab.id }), tab.id);
  assert.equal(resolveEventDossierTab({}), "overzicht");
  assert.equal(resolveEventDossierTab({ tab: "onbekend" }), "overzicht");
  assert.equal(resolveEventDossierTab({ materiaal: "nieuw" }), "materialen");
  assert.equal(resolveEventDossierTab({ succes: "materiaal-opgeslagen" }), "materialen");
});

test("bestaande modal-URLs tonen hun bijbehorende onderdeel, ook bij een tegenstrijdig tabblad", () => {
  for (const query of [{ betrokkene: "nieuw" }, { betrokkene: "bestaand" }, { nieuw: "taak" }, { nieuw: "campagne" }]) {
    assert.equal(resolveEventDossierTab({ tab: "overzicht", ...query }), "planning");
  }
  for (const query of [{ koppeling: "link" }, { koppeling: "relatie" }, { koppeling: "document" }, { link: "bestaand" }, { drivePreview: "1" }]) {
    assert.equal(resolveEventDossierTab({ tab: "overzicht", ...query }), "documenten");
  }
});

test("opslaan, verwijderen en foutmeldingen keren naar het juiste onderdeel terug", () => {
  for (const key of ["succes", "fout"]) {
    for (const code of ["drive", "drive-aangevuld", "kalender-sync", "document-gekoppeld", "link-verwijderd", "relatie-opslaan"])
      assert.equal(resolveEventDossierTab({ [key]: code }), "documenten");
    assert.equal(resolveEventDossierTab({ [key]: "betrokkene-bijwerken" }), "planning");
  }
  assert.equal(resolveEventDossierTab({ succes: "geannuleerd" }), "overzicht");
  assert.equal(resolveEventDossierTab({ succes: "taak-aangemaakt" }), "planning");
  assert.equal(resolveEventDossierTab({ succes: "campagne-aangemaakt" }), "planning");
  assert.equal(resolveEventDossierTab({ tab: "communicatie", succes: "1" }), "communicatie");
});

test("eventpagina toont alleen de gekozen sectie en houdt titel, navigatie en bewerken beschikbaar", async () => {
  const source = readFileSync(new URL("../src/app/app/events/[id]/page.tsx", import.meta.url), "utf8");
  const id = "11111111-1111-4111-8111-111111111111";
  const event = { id, title: "TESTFIXTURE event", status: "planning", event_type: "lan", priority: "normal", role_besc: "participant" };
  const supabase = { from: (table: string) => {
    const q: Record<string, unknown> = {};
    for (const method of ["select", "eq", "is", "order", "neq", "limit"]) q[method] = () => q;
    const result = { data: table === "events" ? event : ["google_resource_links", "migration_source_links"].includes(table) ? null : [], error: null };
    q.maybeSingle = async () => result;
    q.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
    return q;
  } };
  const overrides: Record<string, unknown> = {
    "next/link": { default: ({ children, scroll, ...props }: React.PropsWithChildren<Record<string, unknown>>) => { void scroll; return React.createElement("a", props, children); } },
    "next/navigation": { notFound: () => { throw Error("404"); } },
    "@/lib/event-dossier-tabs": { eventDossierTabs, resolveEventDossierTab },
    "@/lib/person-picker": { toPersonPickerOptions: () => [] },
    "@/lib/auth-context": { requireActiveMembership: async () => ({ supabase, membership: { role: "admin", organization_id: "fixture-org" } }) },
    "@/lib/permissions": { hasPermission },
    "@/lib/format": { formatDateTime: () => "", formatEventEndpoint: () => "Niet gepland" },
    "@/lib/dossier-relations": { loadDossierConnections: async () => ({ links: [], documents: [], relationships: [] }), loadRelationOptions: async () => [] },
    "@/lib/google-workspace": {},
  };
  for (const match of source.matchAll(/import \{([^}]+)\} from "(@\/components\/[^"]+)"/g)) {
    const exports: Record<string, unknown> = {};
    for (const name of match[1].split(",").map(value => value.trim())) exports[name] = ({ children }: React.PropsWithChildren) => React.createElement("section", { "data-component": name }, children);
    overrides[match[2]] = exports;
  }
  Object.assign(overrides["@/components/event-form"] as object, { eventTypes: { lan: "LAN" }, eventStatuses: { planning: "Planning" } });
  for (const path of ["../actions", "../../operations/actions", "./actions", "@/app/app/google-document-actions", "../calendar-actions"]) overrides[path] = new Proxy({}, { get: () => () => undefined });
  const require = createRequire(import.meta.url);
  const compiled = { exports: {} as { default?: (props: unknown) => Promise<React.ReactNode> } };
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    { module: compiled, exports: compiled.exports, Date, require: (key: string) => key in overrides ? overrides[key] : require(key) });
  for (const tab of eventDossierTabs) {
    const html = renderToStaticMarkup(await compiled.exports.default!({ params: Promise.resolve({ id }), searchParams: Promise.resolve({ tab: tab.id }) }));
    assert.ok(html.includes("TESTFIXTURE event"));
    assert.ok(html.includes(`?tab=${tab.id}&amp;bewerken=1`));
    assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1);
    for (const [panel, owner] of [["EventGiveawaysPanel", "giveaways"], ["EventSchedulePanel", "planning"], ["EventMaterialsPanel", "materialen"], ["PeopleAssignmentsPanel", "planning"], ["FinancialSummaryPanel", "financien"], ["RecordConnectionsPanel", "documenten"], ["EmailCommunicationPanel", "communicatie"], ["RecordLifecyclePanel", "overzicht"]]) {
      assert.equal(html.includes(`data-component="${panel}"`), tab.id === owner, `${panel} op ${tab.id}`);
    }
  }
});
