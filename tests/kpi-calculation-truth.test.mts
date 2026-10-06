import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PGlite } from "@electric-sql/pglite";
import * as reporting from "../src/lib/management-report.ts";
const require = createRequire(import.meta.url);
function load(path: string, overrides: Record<string, unknown> = {}) {
  const compiled = { exports: {} as Record<string, unknown> };
  const code = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(code, { module: compiled, exports: compiled.exports, FormData, Date, URL, URLSearchParams, Response,
    require: (key: string) => key in overrides ? overrides[key] : require(key) });
  return compiled.exports;
}
for (const direction of ["higher", "lower"]) test(`Doelen: ${direction}, gelijkheid en doel nul`, () => {
  const expected = direction === "higher";
  assert.equal(reporting.targetReached({ value: 12, target: 10, target_direction: direction }), expected);
  assert.equal(reporting.targetReached({ value: 8, target: 10, target_direction: direction }), !expected);
  assert.equal(reporting.targetReached({ value: 0, target: 0, target_direction: direction }), true);
});
test("Onbekende richting en ontbrekende meting tellen niet als geslaagd of mislukt", () => {
  assert.deepEqual(reporting.targetScore([
    { value: 0, target: 0, target_direction: "lower" },
    { value: null, target: 5, measurement_status: "missing", target_direction: "higher" },
    { value: 10, target: 5, target_direction: "unknown" },
    { value: 8, target: 5, target_direction: "lower" },
  ]), { reached: 1, total: 2, unassessed: 2, percentage: 50 });
  assert.equal(reporting.targetScore([]).percentage, null);
  assert.equal(reporting.measuredValue({ value: 0 }), 0);
  assert.equal(reporting.kpiValueLabel({ value: null }), "Ontbrekende meting");
  assert.equal(reporting.measuredValue({ value: "NaN" }), null);
});
test("Groei vanaf nul of ontbrekende waarden is niet berekenbaar", () => {
  for (const pair of [[0, 0], [10, 0], [null, 4], [4, null]] as const) assert.equal(reporting.percentageDelta(pair[0], pair[1]), null);
  assert.equal(reporting.percentageDelta(8, 10), -20);
  assert.equal(reporting.percentageDelta(-8, -10), 20);
});
async function save(values: Record<string, string>, update = false) {
  const writes: Record<string, unknown>[] = [];
  const query = { insert: (v: Record<string, unknown>) => { writes.push(v); return query; },
    update: (v: Record<string, unknown>) => { writes.push(v); return query; }, eq: () => query, is: () => query,
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve) };
  const actions = load("src/app/app/rapportage/actions.ts", {
    "next/cache": { revalidatePath: () => {} }, "next/navigation": { redirect: (url: string) => { throw Error(url); } },
    "@/lib/auth-context": { requireActiveMembership: async () => ({ supabase: { from: () => query }, user: { id: "fixture-user" }, membership: { organization_id: "fixture-org", role: "admin" } }) },
  });
  const form = new FormData();
  for (const [key, value] of Object.entries({ id: "11111111-1111-4111-8111-111111111111", name: "TESTFIXTURE", domain: "social", metric: "Bereik", unit: "number", source: "Testbron", collection_method: "manual", ...values })) form.set(key, value);
  let destination = "";
  try { await (actions[update ? "updateKpi" : "saveKpi"] as (v: FormData) => Promise<void>)(form); } catch (error) { destination = String(error); }
  return { writes, destination };
}
for (const update of [false, true]) test(`Opslaan ${update ? "bestaand" : "nieuw"}: nul, ontbrekend en ongeldige invoer`, async () => {
  const zero = await save({ value: "0", target: "0", target_direction: "lower" }, update);
  assert.equal(zero.writes[0].value, 0); assert.equal(zero.writes[0].target, 0);
  assert.equal(zero.writes[0].measurement_status, "measured"); assert.match(zero.destination, /succes=/);
  const missing = await save({ measurement_status: "missing", target: "" }, update);
  assert.equal(missing.writes[0].value, null); assert.equal(missing.writes[0].target, null);
  for (const values of ([{ value: "" }, { value: "Infinity" }, { value: "2", target: "abc" }, { value: "2", measurement_status: "missing" }, { value: "2", target_direction: "sideways" }] as Record<string, string>[])) {
    const invalid = await save(values, update); assert.equal(invalid.writes.length, 0); assert.match(invalid.destination, /fout=velden/);
  }
});
test("Meetformulier onderscheidt nul en ontbrekend; omschakelen activeert waardeveld", () => {
  const fields = load("src/components/kpi-measurement-fields.tsx").KpiMeasurementFields as React.ComponentType<Record<string, unknown>>;
  const missing = renderToStaticMarkup(React.createElement(fields, { status: "missing", value: null }));
  assert.match(missing, /<input(?=[^>]*name="value")(?=[^>]*disabled="")/); assert.doesNotMatch(missing, /value="0"/);
  const zero = renderToStaticMarkup(React.createElement(fields, { status: "measured", value: 0 }));
  assert.match(zero, /required=""[^>]*value="0"/);
  let state = true;
  const interactive = load("src/components/kpi-measurement-fields.tsx", { react: { useState: () => [state, (value: boolean) => { state = value; }] } }).KpiMeasurementFields as (props: unknown) => React.ReactElement<{ children: React.ReactElement<{ children: [string, React.ReactElement] }>[] }>;
  let tree = interactive({ status: "missing" });
  const select = tree.props.children[0].props.children[1] as React.ReactElement<{ onChange: (event: unknown) => void }>;
  select.props.onChange({ target: { value: "measured" } });
  tree = interactive({ status: "missing" });
  const input = tree.props.children[1].props.children[1] as React.ReactElement<{ disabled: boolean; required: boolean }>;
  assert.equal(input.props.disabled, false); assert.equal(input.props.required, true);
});
test("CSV behoudt een gemeten nul en benoemt ontbrekende metingen en doelrichting", async () => {
  const query: Record<string, unknown> = {};
  for (const key of ["select", "eq", "is", "gte", "lte", "order"]) query[key] = () => query;
  query.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [
    { name: "Nul", value: 0, target: 0, target_direction: "lower", measurement_status: "measured" },
    { name: "Ontbreekt", value: null, target: 5, target_direction: "higher", measurement_status: "missing" },
  ] }).then(resolve);
  const route = load("src/app/app/rapportage/export/route.ts", { "@/lib/management-report": reporting,
    "@/lib/auth-context": { requireActiveMembership: async () => ({ supabase: { from: () => query }, membership: { organization_id: "fixture-org" } }) } });
  const response = await (route.GET as (r: Request) => Promise<Response>)(new Request("https://fixture.test/export?jaar=2026"));
  const csv = await response.text(); assert.match(csv, /"Nul";"";"0"/); assert.match(csv, /Lager is beter/);
  assert.match(csv, /Ontbrekende meting/); assert.match(csv, /Niet te beoordelen/);
});
test("Postgres-migratie behoudt bestaande nul, RLS en audit en dwingt meetconsistentie af", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create table kpi_records(id serial primary key,value numeric(14,4) not null,target numeric(14,4));
      alter table kpi_records enable row level security;
      create policy fixture_read on kpi_records for select using(true);
      create table fixture_audit(id int);
      create function fixture_log() returns trigger language plpgsql as $$ begin insert into fixture_audit values(new.id); return new; end $$;
      create trigger fixture_trigger after insert on kpi_records for each row execute function fixture_log();
      insert into kpi_records(value,target) values(0,0);`);
    await db.exec(readFileSync(new URL("../supabase/migrations/20261006144233_kpi_measurement_status_and_direction.sql", import.meta.url), "utf8"));
    const old = (await db.query<{ value: string; measurement_status: string; target_direction: string }>("select * from kpi_records where id=1")).rows[0];
    assert.equal(Number(old.value), 0); assert.equal(old.measurement_status, "measured"); assert.equal(old.target_direction, "unknown");
    await db.exec("insert into kpi_records(value,measurement_status,target_direction) values(null,'missing','lower')");
    assert.equal((await db.query("select * from fixture_audit")).rows.length, 2);
    assert.equal((await db.query<{ relrowsecurity: boolean }>("select relrowsecurity from pg_class where relname='kpi_records'")).rows[0].relrowsecurity, true);
    assert.equal((await db.query("select * from pg_policies where tablename='kpi_records'")).rows.length, 1);
    for (const sql of ["insert into kpi_records(value) values(null)", "insert into kpi_records(value,measurement_status) values(0,'missing')", "insert into kpi_records(value,target_direction) values(0,'sideways')", "insert into kpi_records(value) values('NaN')", "insert into kpi_records(value,target) values(0,'NaN')"]) await assert.rejects(db.exec(sql));
  } finally { await db.close(); }
});
