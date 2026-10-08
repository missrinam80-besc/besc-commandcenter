import * as contactTabHelpers from "../src/lib/contact-dossier-tabs.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = ((native) => (name: string) => name === "@/lib/contact-dossier-tabs" ? contactTabHelpers : native(name))(createRequire(import.meta.url));
const id = "11111111-1111-4111-8111-111111111111";
const linkId = "22222222-2222-4222-8222-222222222222";
function load(path: string, overrides: Record<string, unknown> = {}) {
  const compiled = { exports: {} as Record<string, (form: FormData) => Promise<void>> };
  runInNewContext(ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module: compiled, exports: compiled.exports, FormData,
    require: (key: string) => key in overrides ? overrides[key] : require(key) });
  return compiled.exports;
}
const config = load("src/lib/dossier-relations.ts") as unknown as typeof import("../src/lib/dossier-relations.ts");

for (const type of config.dossierEntityTypes) {
  for (const action of ["addRecordLink", "updateRecordLink", "deleteRecordLink"]) {
    test(`${type}/${action}: stale dossier cannot write or redirect to a missing detail`, async () => {
      for (const state of ["active", "deleted", "foreign", "unreadable", "lookup-error", "wrong-id", "denied"]) {
        const calls: unknown[][] = [], writes: unknown[][] = [], revalidated: string[] = [];
        const supabase = { from: (table: string) => {
          let organization = "", selectedId = "", activeOnly = false;
          const query: Record<string, unknown> = {};
          for (const method of ["select", "eq", "is"]) query[method] = (...args: unknown[]) => {
            calls.push([table, method, ...args]);
            if (method === "eq" && args[0] === "organization_id") organization = String(args[1]);
            if (method === "eq" && args[0] === "id") selectedId = String(args[1]);
            if (method === "is" && args[0] === "deleted_at" && args[1] === null) activeOnly = true;
            return query;
          };
          for (const method of ["insert", "update", "delete"]) query[method] = (...args: unknown[]) => {
            writes.push([table, method, ...args]); return query;
          };
          query.maybeSingle = async () => table === "record_links" ? { data: { id: linkId }, error: null } : {
            data: state === "active" && organization === "org" && selectedId === id && activeOnly ? { id } : state === "wrong-id" ? { id: linkId } : null,
            error: state === "lookup-error" ? { message: "PRIVATE_LOOKUP_DETAIL" } : null,
          };
          query.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve);
          return query;
        } };
        const actions = load("src/app/app/dossier-actions.ts", {
          "next/cache": { revalidatePath: (path: string) => revalidated.push(path) },
          "next/navigation": { redirect: (url: string) => { throw Error(url); } },
          "@/lib/auth-context": { requirePermission: async () => {
            if (state === "denied") throw Error("permission denied");
            return { supabase, user: { id }, membership: { organization_id: "org" } };
          } },
          "@/lib/dossier-relations": config, "@/lib/google-workspace": {}, "@/lib/source-observation": {},
        });
        const form = new FormData();
        for (const [key, value] of Object.entries({ entity_type: type, entity_id: id, id: linkId,
          label: "TESTFIXTURE — NIET PUBLICEREN", url: "https://example.com/test", link_type: "reference" })) form.set(key, value);
        const route = config.dossierEntityConfig[type].route;
        const expected = state === "active" ? `${route}/${id}?succes=${action === "deleteRecordLink" ? "link-verwijderd" : "link-opgeslagen"}`
          : state === "denied" ? "permission denied" : `${route}?fout=${state === "lookup-error" ? "dossier-controleren" : "dossier-niet-beschikbaar"}`;
        await assert.rejects(actions[action](form), (error: Error) => { assert.equal(error.message, expected); return true; });
        assert.equal(writes.length, state === "active" ? 1 : 0);
        if (state === "denied") { assert.equal(calls.length, 0); continue; }
        for (const filter of [["select", "id"], ["eq", "organization_id", "org"], ["eq", "id", id], ["is", "deleted_at", null]]) {
          assert.ok(calls.some(call => JSON.stringify(call) === JSON.stringify([config.dossierEntityConfig[type].table, ...filter])));
        }
        assert.deepEqual(revalidated, [state === "active" ? `${route}/${id}` : route]);
      }
    });
  }
}
