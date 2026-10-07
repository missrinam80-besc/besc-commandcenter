import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as report from "../src/lib/management-report.ts";

function exportFixture(failingTable?: string, role = "admin") {
  let reads = 0;
  const records: Record<string, Record<string, unknown>[]> = {
    campaigns: [{ id: "active", title: "Active campaign", status: "active", deleted_at: null }, { id: "deleted", title: "Deleted campaign", deleted_at: "2026-10-01" }],
    campaign_deliverables: [{ title: "Keep active deliverable", campaign_id: "active", status: "todo" }, { title: "Hide deleted deliverable", campaign_id: "deleted", status: "todo" }, { title: "Hide orphan", campaign_id: "missing", status: "todo" }],
  };
  const supabase = { from(table: string) {
    reads++;
    let data = records[table] ?? [];
    const query = {
      select() { return query; }, eq() { return query; }, gte() { return query; }, lt() { return query; },
      is(column: string, value: unknown) { data = data.filter((row) => row[column] === value); return query; },
      then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data, error: table === failingTable ? { message: "TESTFIXTURE query failure" } : null }).then(resolve); },
    };
    return query;
  } };
  const loaded = { exports: {} as { GET(request: Request): Promise<Response> } };
  const code = ts.transpileModule(readFileSync(new URL("../src/app/app/rapportage/management/export/route.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { module: loaded, exports: loaded.exports, URL, Response, Date, console, require: (name: string) => {
    if (name === "@/lib/auth-context") return { requireActiveMembership: async () => ({ supabase, membership: { role, organization_id: "org" } }) };
    if (name === "@/lib/management-report") return report;
    throw new Error(`Unexpected import ${name}`);
  } });
  return { run: () => loaded.exports.GET(new Request("https://besc.example/app/rapportage/management/export?periode=quarter&datum=2026-10-07")), reads: () => reads };
}

test("management CSV keeps active campaign deliverables and excludes deleted or missing parents", async () => {
  const response = await exportFixture().run();
  assert.equal(response.status, 200);
  const csv = await response.text();
  assert.match(csv, /Keep active deliverable/);
  assert.doesNotMatch(csv, /Hide deleted|Hide orphan|Deleted campaign/);
});

test("every failed management query blocks a misleading successful CSV", async () => {
  for (const table of ["tasks", "projects", "content_items", "events", "campaigns", "partners", "campaign_deliverables", "expenses", "income_entries", "budget_envelopes", "kpi_records"]) {
    const response = await exportFixture(table).run();
    assert.equal(response.status, 500, table);
    assert.doesNotMatch(response.headers.get("Content-Type") ?? "", /text\/csv/);
    assert.doesNotMatch(await response.text(), /Keep active deliverable|TESTFIXTURE query failure/);
  }
});

test("a team member cannot export management data or query its tables", async () => {
  const fixture = exportFixture(undefined, "member");
  assert.equal((await fixture.run()).status, 403);
  assert.equal(fixture.reads(), 0);
});
