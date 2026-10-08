import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { hasPermission } from "../src/lib/permissions.ts";
const require = createRequire(import.meta.url);
function load(path: string, overrides: Record<string, unknown> = {}) {
  const compiled = { exports: {} as Record<string, unknown> };
  const code = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(code, { module: compiled, exports: compiled.exports, FormData, Date,
    require: (key: string) => key === "@/components/dossier-editor-gate" ? {dossierEditorGate:async()=>null} : key in overrides ? overrides[key] : require(key) });
  return compiled.exports;
}
const id = "11111111-1111-4111-8111-111111111111";
function fixture(role: string, caps: string[] = [], saved = true, failed = false) {
  const writes: unknown[] = [], filters: unknown[] = [], invalidations: string[] = [];
  const query: Record<string, unknown> = {};
  for (const key of ["eq", "is", "select"]) query[key] = (...args: unknown[]) => { filters.push([key, ...args]); return query; };
  for (const key of ["insert", "update"]) query[key] = (value: unknown) => { writes.push(value); return query; };
  query.single = query.maybeSingle = async () => ({ data: saved ? { id } : null, error: failed ? { message: "fixture" } : null });
  const overrides = {
    "next/cache": { revalidatePath: (path: string) => invalidations.push(path) },
    "next/navigation": { redirect: (url: string) => { throw Error(url); } },
    "@/lib/auth-context": { requirePermission: async (cap: "manageContent", fallback: string) => {
      assert.equal(cap, "manageContent");
      if (!hasPermission({ role, capabilities: caps, finance_role: "none" }, cap)) throw Error(fallback);
      return { supabase: { from: () => query }, user: { id }, membership: { role, organization_id: "fixture-org" } };
    } },
    "@/lib/format": { localDateTimeToIso: () => null },
    "./constants": load("src/app/app/content/constants.ts"),
    "@/lib/record-lifecycle": load("src/lib/record-lifecycle.ts"),
  };
  const actions = load("src/app/app/content/actions.ts", overrides);
  const lifecycle = load("src/app/app/lifecycle-actions.ts", overrides);
  const form = new FormData();
  for (const [key, value] of Object.entries({ id, title: "TESTFIXTURE", content_type: "social_post", status: "idea", priority: "normal", approval_status: "not_required" })) form.set(key, value);
  return { writes, filters, invalidations, run: (mode: string) => {
    if (mode === "create" || mode === "edit") return (actions[mode === "create" ? "createContent" : "updateContent"] as (f: FormData) => Promise<void>)(form);
    form.set("entity", "content"); form.set("action", mode); form.set("confirmation", "VERWIJDER");
    return (lifecycle.changeRecordLifecycle as (f: FormData) => Promise<void>)(form);
  } };
}
for (const role of ["admin", "board", "member"]) test(`Content serveracties toegestaan voor ${role}`, async () => {
  for (const mode of ["create", "edit", "archive", "restore", "delete"]) {
    const f = fixture(role); await assert.rejects(f.run(mode), /succes=/); assert.equal(f.writes.length, 1);
    if (mode !== "create") assert.ok(f.filters.some(value => JSON.stringify(value) === '["is","deleted_at",null]'));
  }
});
test("Vrijwilliger zonder capability kan geen Content-serveractie uitvoeren", async () => {
  for (const mode of ["create", "edit", "archive", "restore", "delete"]) {
    const f = fixture("volunteer"); await assert.rejects(f.run(mode), /fout=geen-toegang/);
    assert.equal(f.writes.length, 0); assert.equal(f.invalidations.length, 0);
  }
});
test("Aangepaste Content-bevoegdheid volgt dezelfde serveracties", async () => {
  for (const mode of ["create", "edit", "archive", "restore", "delete"]) {
    const f = fixture("volunteer", ["manageContent"]); await assert.rejects(f.run(mode), /succes=/);
  }
});
for (const mode of ["create", "edit", "archive", "restore", "delete"]) test(`Content ${mode}: geen geraakte rij of databasefout geeft geen succes`, async () => {
  for (const [saved, failed] of [[false, false], [true, true]]) {
    const f = fixture("member", [], saved, failed); await assert.rejects(f.run(mode), /fout=(opslaan|lifecycle)/);
    assert.equal(f.invalidations.length, 0);
  }
});
