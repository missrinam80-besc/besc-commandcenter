import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import * as permissions from "../src/lib/permissions.ts";
import type { AppShellData } from "../src/lib/app-shell-context.ts";

const require = createRequire(import.meta.url);
function load<T>(path: string, dependencies: Record<string, unknown>): T {
  const compiled = { exports: {} as T };
  runInNewContext(ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { module: compiled, exports: compiled.exports, require: (id: string) => id in dependencies ? dependencies[id] : require(id) });
  return compiled.exports;
}

type Row = { organization_id: string; status: string };
function fixture(role = "admin", capabilities: string[] = [], failure = false) {
  const organization = "10000000-0000-4000-8000-000000000001";
  const rows: Row[] = [
    { organization_id: organization, status: "open" }, { organization_id: organization, status: "open" },
    { organization_id: organization, status: "in_progress" }, { organization_id: organization, status: "waiting_requester" },
    { organization_id: organization, status: "closed" }, { organization_id: "other-org", status: "open" },
  ];
  const calls: { table: string; steps: unknown[][] }[] = [];
  const supabase = {
    rpc: async () => ({ data: 0 }),
    from(table: string) {
      const call = { table, steps: [] as unknown[][] }; calls.push(call);
      const query: Record<string, unknown> = {};
      for (const method of ["select", "eq", "is", "in", "maybeSingle"]) query[method] = (...args: unknown[]) => { call.steps.push([method, ...args]); return query; };
      query.then = (resolve: (data: unknown) => unknown, reject: (e: unknown) => unknown) => {
        if (table === "profiles") return Promise.resolve({ data: { display_name: "TESTFIXTURE", theme_preference: "dark" } }).then(resolve, reject);
        if (table !== "support_tickets") return Promise.resolve({ count: 0 }).then(resolve, reject);
        const matches = rows.filter(row => call.steps.filter(step => step[0] === "eq").every(([, key, value]) => row[key as keyof Row] === value));
        return Promise.resolve(failure ? { count: null, error: { message: "PRIVATE_DATABASE_ERROR" } } : { count: matches.length, error: null }).then(resolve, reject);
      };
      return query;
    },
  };
  const loader = load<{ getAppShellContext: () => Promise<AppShellData> }>("src/lib/app-shell-context.ts", {
    react: { cache: (fn: unknown) => fn }, "@/lib/permissions": permissions,
    "@/lib/auth-context": { requireActiveMembership: async () => ({ supabase, user: { id: "user", email: "test@example.invalid" }, membership: { organization_id: organization, role, finance_role: "none", capabilities } }) },
  });
  return { context: loader.getAppShellContext, calls, rows, organization };
}

for (const [role, capabilities] of [["admin", []], ["board", []], ["member", ["manageTickets"]]] as const) {
  test(`${role}/${capabilities.join(",")} telt alleen Open tickets binnen de actieve organisatie zonder inhoud op te halen`, async () => {
    const f = fixture(role, [...capabilities]); const data = await f.context();
    assert.equal(data.ticketCount, 2); assert.equal(data.canManageTickets, true);
    const query = f.calls.find(call => call.table === "support_tickets")!;
    assert.equal(query.steps.find(step => step[0] === "select")?.[1], "id");
    assert.equal(JSON.stringify(query.steps.find(step => step[0] === "select")?.[2]), JSON.stringify({ count: "exact", head: true }));
    assert.ok(query.steps.some(step => step[0] === "eq" && step[1] === "organization_id" && step[2] === f.organization));
    f.rows[0].status = "in_progress"; assert.equal((await f.context()).ticketCount, 1);
    f.rows[1].status = "closed"; assert.equal((await f.context()).ticketCount, 0);
  });
}

for (const [role, capabilities] of [["member", []], ["volunteer", []], ["member", ["manageDiscordBot"]]] as const) {
  test(`${role}/${capabilities.join(",")} krijgt geen ticketquery of telling zonder ticketrecht`, async () => {
    const f = fixture(role, [...capabilities]); const data = await f.context();
    assert.equal(data.canManageTickets, false); assert.equal(data.ticketCount, 0);
    assert.ok(!f.calls.some(call => call.table === "support_tickets"));
  });
}

test("Een mislukte telling breekt de navigatie niet en toont geen databasefout", async () => {
  const f = fixture("admin", [], true); const data = await f.context();
  assert.equal(data.ticketCount, 0); assert.ok(!JSON.stringify(data).includes("PRIVATE_DATABASE_ERROR"));
});

function navigation(data: AppShellData) {
  const shell = load<{ PersistentAppShell: React.ComponentType<{ initialData: AppShellData }> }>("src/components/persistent-app-shell.tsx", {
    "next/navigation": { usePathname: () => "/app/meldingen" },
    "next/link": { default: ({ children, ...props }: { children?: React.ReactNode; href?: string }) => React.createElement("a", props, children) },
    "next/image": { default: () => null }, "@/app/auth/actions": { signOut: async () => {} },
    "@/components/global-search-trigger": { GlobalSearchTrigger: () => null },
  });
  return new JSDOM(renderToStaticMarkup(React.createElement(shell.PersistentAppShell, { initialData: data })));
}

test("Ticketbadge gebruikt dezelfde telling op desktop en mobiel, verbergt nul en begrenst 99+", async () => {
  const data = await fixture().context();
  for (const count of [0, 7, 125]) {
    const dom = navigation({ ...data, ticketCount: count });
    const links = [...dom.window.document.querySelectorAll('a[href="/app/tickets"]')]; assert.equal(links.length, 2);
    for (const link of links) {
      assert.equal(link.querySelector("b")?.textContent ?? null, count === 0 ? null : count > 99 ? "99+" : String(count));
      if (count) assert.equal(link.querySelector("b")?.getAttribute("title"), `${count} open Discordtickets`);
    }
    dom.window.close();
  }
  const denied = navigation({ ...data, canManageTickets: false, ticketCount: 125 });
  assert.equal(denied.window.document.querySelectorAll('a[href="/app/tickets"]').length, 0); denied.window.close();
});
