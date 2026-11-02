import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import * as messages from "../src/lib/workspace-archive.ts";

const require = createRequire(import.meta.url);
const id = "20000000-0000-4000-8000-000000000001", org = "10000000-0000-4000-8000-000000000001";
function load<T>(path: string, deps: Record<string, unknown>): T {
  const compiled = { exports: {} as T };
  runInNewContext(ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { module: compiled, exports: compiled.exports, require: (name: string) => name in deps ? deps[name] : require(name) });
  return compiled.exports;
}

test("Document register keeps attachment links, escapes labels and retains archive selection through search/pagination", async () => {
  for (const archived of [false, true]) {
    const calls: unknown[][] = [];
    const db = { from(table: string) {
      const query: Record<string, unknown> = {};
      for (const method of ["select", "eq", "order", "range", "in", "not", "is", "ilike"]) query[method] = (...args: unknown[]) => { calls.push([table, method, ...args]); return query; };
      query.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ count: 60, error: null, data: table === "document_registry_workspace"
        ? [{ id, label: "<script>TESTFIXTURE</script>", url: "https://example.invalid/proof", archive_version: 4 }]
        : table === "asset_document_links" ? [{ document_id: id, asset_id: "asset" }] : [] }).then(resolve);
      return query;
    } };
    const panel = load<{ DocumentRegistryPanel: (props: { searchParams: Promise<Record<string, string>> }) => Promise<React.ReactNode> }>("src/components/document-registry-panel.tsx", {
      "@/lib/auth-context": { requireActiveMembership: async () => ({ supabase: db, membership: { organization_id: org } }) },
      "@/lib/permissions": { hasPermission: () => true },
      "@/app/app/documenten/actions": { addRegistryDocument: () => {} },
      "@/lib/workspace-archive": messages,
      "@/components/workspace-archive-form": { WorkspaceArchiveForm: ({ archived, version }: { archived: boolean; version: number }) => React.createElement("button", { "data-archived": String(archived), "data-version": version }, "Archive") },
      "next/link": { default: ({ children, ...props }: { children: React.ReactNode; href: string }) => React.createElement("a", props, children) },
    });
    const params: Record<string, string> = archived ? { register_archief: "1", zoek: "fixture" } : {};
    const html = renderToStaticMarkup(await panel.DocumentRegistryPanel({ searchParams: Promise.resolve(params) }));
    const dom = new JSDOM(html);
    assert.ok(!html.includes("<script>TESTFIXTURE</script>"));
    assert.ok(html.includes("&lt;script&gt;TESTFIXTURE&lt;/script&gt;"));
    assert.ok(dom.window.document.querySelector('a[href="/app/materialen?bewerken=asset"]'));
    assert.equal(dom.window.document.querySelector("button[data-version]")?.getAttribute("data-version"), "4");
    assert.equal(dom.window.document.querySelector("button[data-archived]")?.getAttribute("data-archived"), String(archived));
    assert.ok(calls.some(row => row[0] === "document_registry_workspace" && row[1] === (archived ? "not" : "is") && row[2] === "archived_at"));
    if (archived) {
      assert.equal(dom.window.document.querySelector('input[name="register_archief"]')?.getAttribute("value"), "1");
      assert.ok(dom.window.document.querySelector('nav[aria-label="Documentpagina’s"] a')?.getAttribute("href")?.includes("register_archief=1"));
    }
    dom.window.close();
  }
});

test("Archive action uses current organization/capability, rejects invalid inputs and redacts database failures", async () => {
  const calls: unknown[][] = [];
  let denied = false;
  let response: { data: { archived: boolean } | null; error: { code: string; message: string } | null } = { data: { archived: true }, error: null };
  const actions = load<{ setWorkspaceArchive: (form: FormData) => Promise<void> }>("src/app/app/archief/workspace-actions.ts", {
    "next/cache": { revalidatePath: (path: string) => calls.push(["revalidate", path]) },
    "next/navigation": { redirect: (url: string) => { throw new Error(url); } },
    "@/lib/auth-context": { requirePermission: async (capability: string) => {
      calls.push(["permission", capability]); if (denied) throw Error("denied");
      return { membership: { organization_id: org }, supabase: { rpc: async (...args: unknown[]) => { calls.push(["rpc", ...args]); return response; } } };
    } },
  });
  const form = (entity = "document", archived = "true", version = "4") => {
    const f = new FormData(); for (const [key, value] of Object.entries({ entity, id, archived, version, organization_id: "forged" })) f.set(key, value); return f;
  };
  await assert.rejects(actions.setWorkspaceArchive(form()), /documenten\?archief_melding=archived/);
  assert.ok(calls.some(row => row[0] === "permission" && row[1] === "manageOrganization"));
  const payload = calls.find(row => row[0] === "rpc")![2] as Record<string, unknown>;
  assert.equal(payload.p_org, org); assert.equal(payload.p_expected_version, 4);
  response = { data: { archived: false }, error: null };
  await assert.rejects(actions.setWorkspaceArchive(form("ticket", "false")), /tickets\?archief=1&archief_melding=restored/);
  assert.ok(calls.some(row => row[0] === "permission" && row[1] === "manageTickets"));
  response = { data: null, error: { code: "40001", message: "PRIVATE DATABASE DETAILS" } };
  await assert.rejects(actions.setWorkspaceArchive(form()), /archief_melding=conflict$/);
  const count = calls.filter(row => row[0] === "rpc").length;
  await assert.rejects(actions.setWorkspaceArchive(form("document", "true", "-1")), /archief\?fout=velden/);
  denied = true;
  await assert.rejects(actions.setWorkspaceArchive(form()), /denied/);
  assert.equal(calls.filter(row => row[0] === "rpc").length, count);
});
