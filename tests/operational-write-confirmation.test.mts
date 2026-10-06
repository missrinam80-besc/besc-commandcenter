import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { operationalModules } from "../src/app/app/operations/config.ts";
import { lifecycleEntities } from "../src/lib/record-lifecycle.ts";

const require = createRequire(import.meta.url);
const id = "11111111-1111-4111-8111-111111111111";
function load(path: string, overrides: Record<string, unknown>) {
  const compiled = { exports: {} as Record<string, (form: FormData) => Promise<void>> };
  const code = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(code, { module: compiled, exports: compiled.exports, FormData,
    require: (key: string) => key in overrides ? overrides[key] : require(key) });
  return compiled.exports;
}

function fixture(outcome: "saved" | "missing" | "error", denied = false, returned?: unknown) {
  const calls: unknown[][] = [], invalidations: string[] = [];
  const response = { data: outcome === "saved" ? { id } : null, error: outcome === "error" ? { message: "TESTFIXTURE" } : null };
  const supabase = { rpc: async (name: string, args: unknown) => {
    calls.push([name, "rpc", args]);
    return { data: returned === undefined ? (outcome === "saved" ? id : null) : returned, error: response.error };
  }, from(table: string) {
    const query: Record<string, unknown> = {};
    for (const method of ["update", "eq", "is", "select", "delete", "insert"]) {
      query[method] = (...args: unknown[]) => { calls.push([table, method, ...args]); return query; };
    }
    query.maybeSingle = async () => { calls.push([table, "maybeSingle"]); return response; };
    // The old await-query path returns no error even when no row was updated.
    query.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ error: response.error }).then(resolve);
    return query;
  } };
  const overrides = {
    "next/cache": { revalidatePath: (path: string) => invalidations.push(path) },
    "next/navigation": { redirect: (url: string) => { throw Error(url); } },
    "@/lib/auth-context": { requirePermission: async (_cap: string, fallback: string) => {
      if (denied) throw Error(fallback);
      return { supabase, user: { id }, membership: { organization_id: "fixture-org" } };
    } },
    "@/lib/format": { localDateTimeToIso: () => null },
    "@/lib/campaign-templates": { campaignTemplates: {} },
    "./config": { operationalModules },
    "@/lib/record-lifecycle": { lifecycleEntities },
  };
  return { calls, invalidations, operational: load("src/app/app/operations/actions.ts", overrides), lifecycle: load("src/app/app/lifecycle-actions.ts", overrides) };
}

function assertScope(calls: unknown[][], table: string, restoreStatus?: string) {
  for (const expected of [[table, "eq", "organization_id", "fixture-org"], [table, "eq", "id", id],
    [table, "is", "deleted_at", null], [table, "select", "id"], [table, "maybeSingle"]]) {
    assert.ok(calls.some(call => JSON.stringify(call) === JSON.stringify(expected)), JSON.stringify(expected));
  }
  if (restoreStatus) assert.ok(calls.some(call => JSON.stringify(call) === JSON.stringify([table, "eq", "status", restoreStatus])));
}

for (const [module, config] of Object.entries(operationalModules)) {
  for (const mode of ["updateOperationalRecord", "updateOperationalStatus"]) {
    test(`${module} ${mode}: only a confirmed row permits success`, async () => {
      for (const outcome of ["missing", "error", "saved"] as const) {
        const f = fixture(outcome);
        const form = new FormData();
        for (const [key, value] of Object.entries({ module, id, title: "TESTFIXTURE", type: Object.keys(config.types)[0], status: Object.keys(config.statuses)[0] })) form.set(key, value);
        form.append("roles", "volunteer");
        await assert.rejects(f.operational[mode](form), outcome === "saved" ? /succes=bijgewerkt/ : /fout=(opslaan|status-opslaan)/);
        if (module === "community" && mode === "updateOperationalRecord") {
          assert.equal(f.calls[0][0], "save_community_person_bundle");
          assert.equal(f.calls.length, 1);
        } else assertScope(f.calls, config.table);
        if (outcome !== "saved") {
          assert.equal(f.invalidations.length, 0);
          assert.equal(f.calls.filter(call => call[0] === "community_person_roles").length, 0);
        } else assert.ok(f.invalidations.includes(`/app/${module}`));
      }
    });
  }
}

for (const [entity, config] of Object.entries(lifecycleEntities)) {
  for (const action of ["archive", "restore", "delete"]) {
    test(`${entity} ${action}: missing rows and errors never report success`, async () => {
      for (const outcome of ["missing", "error", "saved"] as const) {
        const f = fixture(outcome);
        const form = new FormData();
        for (const [key, value] of Object.entries({ entity, id, action, confirmation: "VERWIJDER" })) form.set(key, value);
        await assert.rejects(f.lifecycle.changeRecordLifecycle(form), outcome === "saved" ? /succes=/ : /fout=lifecycle/);
        assertScope(f.calls, config.table, action === "restore" ? config.archiveStatus : undefined);
        if (outcome !== "saved") assert.equal(f.invalidations.length, 0);
        else assert.ok(f.invalidations.includes(config.listPath));
      }
    });
  }
}

test("permission denial and missing deletion confirmation prevent all writes", async () => {
  for (const denied of [false, true]) {
    const f = fixture("saved", denied);
    const form = new FormData();
    for (const [key, value] of Object.entries({ entity: "partner", id, action: "delete", confirmation: "" })) form.set(key, value);
    await assert.rejects(f.lifecycle.changeRecordLifecycle(form), denied ? /fout=geen-toegang/ : /fout=bevestiging/);
    assert.equal(f.calls.length, 0);
    assert.equal(f.invalidations.length, 0);
  }
});

test("community creation and editing validate roles before one bundle RPC", async () => {
  for (const mode of ["createOperationalRecord", "updateOperationalRecord"]) {
    for (const invalid of [false, true]) {
      const f = fixture("saved");
      const form = new FormData();
      for (const [key, value] of Object.entries({ module: "community", id, title: "TESTFIXTURE", type: "volunteer", status: "candidate" })) form.set(key, value);
      form.append("roles", invalid ? "unknown" : "volunteer");
      form.append("roles", "volunteer");
      await assert.rejects(f.operational[mode](form), invalid ? /fout=rollen/ : /succes=/);
      if (invalid) { assert.equal(f.calls.length, 0); assert.equal(f.invalidations.length, 0); }
      else {
        assert.equal(f.calls.length, 1);
        const args = f.calls[0][2] as { p_roles: string[]; p_values: Record<string, unknown>; p_person_id: string | null; p_organization_id: string };
        assert.equal(JSON.stringify(args.p_roles), '["volunteer"]');
        assert.equal(args.p_person_id, mode === "createOperationalRecord" ? null : id);
        assert.equal(args.p_organization_id, "fixture-org");
        assert.equal(args.p_values.display_name, "TESTFIXTURE");
        for (const key of ["organization_id", "owner_id", "created_by", "updated_at"]) assert.equal(key in args.p_values, false);
      }
    }
  }
});

test("community RPC needs a valid confirmation and editing needs the requested ID", async () => {
  for (const [mode, returned] of [["createOperationalRecord", {}], ["createOperationalRecord", "invalid"], ["updateOperationalRecord", "22222222-2222-4222-8222-222222222222"]] as const) {
    const f = fixture("saved", false, returned);
    const form = new FormData();
    for (const [key, value] of Object.entries({ module: "community", id, title: "TESTFIXTURE", type: "volunteer", status: "candidate" })) form.set(key, value);
    await assert.rejects(f.operational[mode](form), /fout=opslaan/);
    assert.equal(f.invalidations.length, 0);
  }
});
