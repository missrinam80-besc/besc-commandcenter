import * as contactTabHelpers from "../src/lib/contact-dossier-tabs.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { operationalModules, type OperationalModule } from "../src/app/app/operations/config.ts";

const require = createRequire(import.meta.url);
async function render(selectedModule: OperationalModule, query: Record<string, string>, denied = false) {
  const calls: unknown[][] = [];
  const supabase = { from(table: string) {
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "eq", "is", "order"]) builder[method] = (...args: unknown[]) => { calls.push([table, method, ...args]); return builder; };
    builder.maybeSingle = async () => ({ data: null, error: null });
    builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [] }).then(resolve);
    return builder;
  } };
  const compiled = { exports: {} as { OperationalRecordDetail: (props: unknown) => Promise<React.ReactNode> } };
  const code = ts.transpileModule(readFileSync(new URL("../src/components/operational-record-detail.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(code, { module: compiled, exports: compiled.exports,
    require: (key: string) => {
      if(key === "@/lib/contact-dossier-tabs") return contactTabHelpers;
      if (key === "next/navigation") return { notFound: () => { throw Error("404"); } };
      if (key === "next/link") return { default: ({ children, href }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href }, children) };
      if (key === "@/components/app-shell") return { AppShell: ({ children }: React.PropsWithChildren) => React.createElement("main", null, children) };
      if (key === "@/app/app/operations/config") return { operationalModules };
      if (key === "@/lib/auth-context") return { requireActiveMembership: async () => {
        if (denied) throw Error("AUTH_REQUIRED");
        return { supabase, membership: { organization_id: "fixture-org" } };
      } };
      if (key.startsWith("@/")) return {};
      return require(key);
    },
  });
  const tree = await compiled.exports.OperationalRecordDetail({ module: selectedModule, params: Promise.resolve({ id: "fixture-id" }), searchParams: Promise.resolve(query) });
  return { html: renderToStaticMarkup(tree), calls };
}

for (const selectedModule of Object.keys(operationalModules) as OperationalModule[]) {
  test(`${selectedModule}: failed action on unavailable dossier shows explanation and overview link`, async () => {
    for (const fout of ["opslaan", "lifecycle"]) {
      const { html, calls } = await render(selectedModule, { bewerken: "1", fout });
      assert.match(html, /Dossier niet beschikbaar/);
      assert.match(html, /role="alert"/);
      assert.match(html, /De actie kon niet worden afgerond/);
      assert.match(html, /niet meer beschikbaar of je hebt geen toegang/);
      assert.ok(html.includes(`href="/app/${selectedModule}"`));
      assert.ok(html.includes(`Terug naar ${operationalModules[selectedModule].label.replaceAll("&", "&amp;")}`));
      assert.doesNotMatch(html, /<form|succes|TESTFIXTURE_SECRET/);
      const table = operationalModules[selectedModule].table;
      for (const expected of [[table, "eq", "organization_id", "fixture-org"], [table, "is", "deleted_at", null]]) {
        assert.ok(calls.some(call => JSON.stringify(call) === JSON.stringify(expected)));
      }
    }
  });
  test(`${selectedModule}: ordinary missing dossier remains 404; action query cannot bypass authentication`, async () => {
    await assert.rejects(render(selectedModule, {}), /404/);
    await assert.rejects(render(selectedModule, { succes: "bijgewerkt" }), /404/);
    await assert.rejects(render(selectedModule, { fout: "opslaan" }, true), /AUTH_REQUIRED/);
  });
}
