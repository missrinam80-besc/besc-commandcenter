import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import type { DashboardData } from "../src/lib/types";

const require = createRequire(import.meta.url);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

// Execute the actual loader/component with mocked infrastructure, not a copy
// of the production branching logic. No database or Google writes occur.
function loadSource(path: string, overrides: Record<string, unknown> = {}) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const compiledModule = { exports: {} as Record<string, unknown> };
  runInNewContext(code, { module: compiledModule, exports: compiledModule.exports, require: (id: string) => {
    if (id in overrides) return overrides[id];
    if (id === "@/lib/permissions") return loadSource("src/lib/permissions.ts");
    if (id === "@/lib/format") return loadSource("src/lib/format.ts");
    if (id === "next/link") return { __esModule: true, default: ({ children, ...props }: { children: unknown; href?: string }) => React.createElement("a", props, children) };
    return require(id);
  }, Date, Intl });
  return compiledModule.exports;
}

function fixture(options: {
  configured?: boolean; authError?: boolean; noUser?: boolean; noMembership?: boolean;
  failure?: string; rejection?: string; nullData?: string; nullCount?: string;
  populated?: boolean; role?: string;
} = {}) {
  const calls: { table: string; filters: unknown[][] }[] = [];
  const user = "22222222-2222-4222-8222-222222222222";
  const org = "11111111-1111-4111-8111-111111111111";
  const client = {
    auth: { getUser: async () => ({ data: { user: options.noUser ? null : { id: user, email: "fixture@example.invalid" } }, error: options.authError ? { message: "PRIVATE_AUTH_DETAIL" } : null }) },
    from(table: string) {
      const call = { table, filters: [] as unknown[][] }; calls.push(call);
      const response = () => {
        if (options.rejection === table) return Promise.reject(Error("PRIVATE_CONNECTION_DETAIL"));
        if (options.failure === table) return Promise.resolve({ data: null, count: null, error: { message: "PRIVATE_DATABASE_DETAIL" } });
        if (table === "organization_members") return Promise.resolve({ data: options.noMembership ? null : { organization_id: org, role: options.role ?? "board", finance_role: options.role === "volunteer" ? "none" : "treasurer" }, error: null });
        if (table === "profiles") return Promise.resolve({ data: { display_name: "Fixture" }, error: null });
        let data: unknown[] = [];
        if (options.populated && table === "tasks") data = [{ id: "task-1", title: "Fixturetaak", status: "todo", priority: "normal", due_at: null, created_by: user, projects: null, task_assignees: [{ user_id: user }] }];
        if (options.populated && table === "projects") data = [{ id: "project-1", title: "Fixtureproject", status: "active", due_date: null, owner_id: user, project_members: [] }];
        return Promise.resolve({ data: options.nullData === table ? null : data, count: options.nullCount === table ? null : 0, error: null });
      };
      const query: Record<string, unknown> = { then: (yes: (result: unknown) => unknown, no: (error: unknown) => unknown) => response().then(yes, no) };
      for (const method of ["select", "eq", "is", "not", "in", "order", "limit", "maybeSingle", "gte", "lte"]) query[method] = (...args: unknown[]) => { call.filters.push([method, ...args]); return query; };
      return query;
    },
  };
  const loader = loadSource("src/lib/dashboard-data.ts", {
    "@/lib/supabase/server": { createClient: async () => client },
    "@/lib/supabase/configured": { isSupabaseConfigured: () => options.configured !== false },
  });
  return { getData: loader.getDashboardData as () => Promise<DashboardData>, calls, org };
}

function render(data: DashboardData) {
  const component = loadSource("src/components/dashboard.tsx");
  return renderToStaticMarkup(React.createElement(component.Dashboard, { data }));
}

test("successful empty queries show genuine zeros and normal empty lists", async () => {
  const f = fixture(); const data = await f.getData();
  assert.equal(data.loadState, "ready"); assert.equal(data.taskCount, 0);
  const markup = render(data);
  assert.match(markup, /Geen open taken gevonden/);
  assert.match(markup, /Mijn open taken/);
  assert.doesNotMatch(markup, /Gegevens konden niet worden geladen/);
});

test("normal records retain personal assignment and project presentation", async () => {
  const f = fixture({ populated: true }); const data = await f.getData();
  assert.equal(data.loadState, "ready"); assert.equal(data.taskCount, 1); assert.equal(data.projectCount, 1);
  const markup = render(data);
  assert.match(markup, /Fixturetaak/); assert.match(markup, /Fixtureproject/);
  assert.match(markup, /Projectdeadline/); assert.doesNotMatch(markup, /Indicatieve voortgang/);
  for (const call of f.calls.filter(c => !["profiles", "notifications"].includes(c.table))) {
    if (call.table === "organization_members") assert.ok(call.filters.some(v => v[1] === "user_id"));
    else assert.ok(call.filters.some(v => v[1] === "organization_id" && v[2] === f.org));
  }
});

for (const table of ["organization_members", "profiles", "tasks", "projects", "inbox_items", "notifications", "events", "meetings", "meeting_action_items", "expenses", "compliance_deadlines"]) {
  test(`${table} query failure is visible and never rendered as zero or empty work`, async () => {
    const f = fixture({ failure: table, populated: true }); const data = await f.getData();
    assert.equal(data.loadState, "unavailable");
    const markup = render(data);
    assert.match(markup, /role="alert"/); assert.match(markup, /Gegevens konden niet worden geladen/);
    assert.match(markup, /Opnieuw proberen/);
    assert.doesNotMatch(markup, /Mijn open taken|Geen open taken|Geen aandachtspunten|Fixturetaak|PRIVATE_/);
  });
}

test("rejected connection and auth error get sanitized unavailable states", async () => {
  for (const options of [{ rejection: "tasks" }, { authError: true }]) {
    const data = await fixture(options).getData();
    assert.equal(data.loadState, "unavailable"); assert.doesNotMatch(render(data), /PRIVATE_/);
  }
});

test("null list or missing exact count is unknown, not evidence of zero", async () => {
  for (const options of [{ nullData: "tasks" }, { nullCount: "notifications" }]) assert.equal((await fixture(options).getData()).loadState, "unavailable");
});

test("missing connection or access never substitutes demo records", async () => {
  for (const [options, state] of [[{ configured: false }, "not_configured"], [{ noUser: true }, "no_access"], [{ noMembership: true }, "no_access"]] as const) {
    const data = await fixture(options).getData(); assert.equal(data.loadState, state);
    assert.equal(data.tasks.length, 0);
    const markup = render(data); assert.doesNotMatch(markup, /Partnerbriefing|Community Night|Mijn open taken|Geen open taken/);
  }
});

test("volunteers do not query restricted management or finance sources", async () => {
  const f = fixture({ role: "volunteer" }); const data = await f.getData();
  assert.equal(data.loadState, "ready");
  assert.ok(!f.calls.some(c => ["inbox_items", "meetings", "meeting_action_items", "expenses", "compliance_deadlines"].includes(c.table)));
});
