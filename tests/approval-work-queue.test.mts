import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsx from "react/jsx-runtime";
import type { SupabaseClient } from "@supabase/supabase-js";
import * as approvals from "../src/lib/approvals.ts";
import { currentApprovalRequests, latestApprovalRequests } from "../src/lib/approval-work-queue.ts";

function request(id: string, entity_id: string, status: string, time: string, entity_type: approvals.ApprovalEntityType = "content") {
  return { id, entity_id, entity_type, status, requested_at: time, requested_by: "actor", title: id, module: entity_type === "expense" ? "finance" : "content", source_href: `/app/content/${entity_id}` };
}

const rounds = [
  request("older-change-request", "content-1", "changes_requested", "2026-10-07T09:00:00Z"),
  request("latest-rejected", "content-1", "rejected", "2026-10-07T10:00:00Z"),
];

test("herindiening vervangt een oude wijzigingsronde in de werkvoorraad, zonder geschiedenis te wijzigen", () => {
  const before = structuredClone(rounds);
  const latest = latestApprovalRequests(rounds);
  assert.deepEqual(latest.map((row) => row.id), ["latest-rejected"]);
  assert.deepEqual(approvals.approvalCounts(latest, "actor"), { pending: 0, changesRequested: 0, mine: 0, completed: 1 });
  assert.deepEqual(rounds, before);
});

test("alleen pending en changes_requested zijn eigen open aanvragen", () => {
  const rows = ["pending", "changes_requested", "approved", "rejected"].map((status, i) => request(String(i), String(i), status, "2026-10-07T09:00:00Z"));
  rows.push({ ...request("other", "other", "pending", "2026-10-07T09:00:00Z"), requested_by: "other" });
  assert.equal(approvals.approvalCounts(rows, "actor").mine, 2);
});

test("de laatste ronde wordt per dossier en type bepaald, ook bij ongeordende invoer en gelijke tijden", () => {
  const rows = [rounds[1], rounds[0], request("new-expense", "content-1", "pending", "2026-10-07T11:00:00Z", "expense"), request("z", "other", "approved", "2026-10-07T12:00:00Z"), request("a", "other", "pending", "2026-10-07T12:00:00Z")];
  assert.deepEqual(latestApprovalRequests(rows).map((row) => row.id), ["z", "new-expense", "latest-rejected"]);
});

type Filters = { table: string; equals: Record<string, unknown>; nulls: string[]; ids: string[] };
function database(rows: ReturnType<typeof request>[], sourceRows: Record<string, { id: string; organization_id: string; deleted_at?: string | null; resource_type?: string }[]>, failedTable?: string) {
  const calls: Filters[] = [];
  const from = (table: string) => {
    const filters: Filters = { table, equals: {}, nulls: [], ids: [] };
    calls.push(filters);
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { filters.equals[key] = value; return query; },
      is: (key: string, value: unknown) => { assert.equal(value, null); filters.nulls.push(key); return query; },
      in: (key: string, ids: string[]) => { assert.equal(key, "id"); filters.ids = ids; return query; },
      order: () => query,
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: table === "approval_requests" ? rows : (sourceRows[table] ?? []).filter((row) => filters.ids.includes(row.id) && Object.entries(filters.equals).every(([key, value]) => row[key as keyof typeof row] === value) && filters.nulls.every((key) => row[key as keyof typeof row] == null)), error: table === failedTable ? { message: "Read failed" } : null }).then(resolve),
    };
    return query;
  };
  return { supabase: { from } as unknown as SupabaseClient, calls };
}

test("verwijderde, ontbrekende en niet-zichtbare bronnen verdwijnen uit de actuele werkvoorraad", async () => {
  const rows = [
    ...rounds,
    request("deleted", "deleted-content", "pending", "2026-10-07T11:00:00Z"),
    request("other-org", "other-org-content", "pending", "2026-10-07T11:00:00Z"),
    request("missing", "inaccessible-content", "pending", "2026-10-07T11:00:00Z"),
  ];
  const db = database(rows, { content_items: [
    { id: "content-1", organization_id: "org", deleted_at: null },
    { id: "deleted-content", organization_id: "org", deleted_at: "2026-10-07" },
    { id: "other-org-content", organization_id: "other-org", deleted_at: null },
  ] });
  assert.deepEqual((await currentApprovalRequests(db.supabase, "org", rows)).map((row) => row.id), ["latest-rejected"]);
  assert.deepEqual(db.calls[0].equals, { organization_id: "org" });
  assert.deepEqual(db.calls[0].nulls, ["deleted_at"]);
});

test("alle zes goedkeuringssoorten blijven ondersteund en lege types veroorzaken geen bronquery", async () => {
  const types = ["content", "expense", "partner", "document", "email", "newsletter"] as const;
  const tables = ["content_items", "expenses", "partners", "google_resource_links", "email_communications", "newsletters"];
  const rows = types.map((type) => request(type, type, "pending", "2026-10-07T10:00:00Z", type));
  const db = database(rows, Object.fromEntries(tables.map((table, i) => [table, [{ id: types[i], organization_id: "org", deleted_at: null, resource_type: "document" }]])));
  assert.equal((await currentApprovalRequests(db.supabase, "org", rows)).length, 6);
  assert.deepEqual(db.calls.find((call) => call.table === "google_resource_links")?.equals, { organization_id: "org", resource_type: "document" });
  for (const table of ["google_resource_links", "newsletters"]) assert.deepEqual(db.calls.find((call) => call.table === table)?.nulls, []);
  const empty = database([], {});
  assert.deepEqual(await currentApprovalRequests(empty.supabase, "org", []), []);
  assert.equal(empty.calls.length, 0);
});

test("een mislukte bronquery wordt niet als een lege geslaagde werkvoorraad gemeld", async () => {
  const db = database(rounds, {}, "content_items");
  await assert.rejects(currentApprovalRequests(db.supabase, "org", rounds), /kon niet worden geladen/);
});

test("de echte goedkeuringspagina filtert pas na selectie van de laatste beschikbare ronde", async () => {
  const rows = [...rounds, request("deleted-pending", "deleted-content", "pending", "2026-10-07T11:00:00Z")];
  const db = database(rows, { content_items: [{ id: "content-1", organization_id: "org", deleted_at: null }] });
  const dependencies: Record<string, unknown> = {
    "react/jsx-runtime": jsx,
    "next/link": { __esModule: true, default: ({ children, href }: { children?: React.ReactNode; href: string }) => React.createElement("a", { href }, children) },
    "lucide-react": Object.fromEntries(["CheckCircle2", "Clock3", "Filter", "RotateCcw", "UserRound", "XCircle"].map((name) => [name, () => null])),
    "./actions": { decideApproval: () => {} },
    "@/components/app-shell": { AppShell: ({ children }: { children?: React.ReactNode }) => React.createElement("div", null, children) },
    "@/lib/auth-context": { requireActiveMembership: async () => ({ supabase: db.supabase, user: { id: "actor" }, membership: { role: "admin", finance_role: "none", organization_id: "org" } }) },
    "@/lib/format": { formatDateTime: (value: string) => value },
    "@/lib/approvals": approvals,
    "@/lib/approval-work-queue": { currentApprovalRequests },
  };
  const exported: { default?: (props: unknown) => Promise<React.ReactNode> } = {};
  const code = ts.transpileModule(readFileSync("src/app/app/goedkeuringen/page.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function("require", "exports", code)((name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; }, exported);
  const closed = renderToStaticMarkup(await exported.default!({ searchParams: Promise.resolve({ status: "rejected" }) }));
  assert.match(closed, /latest-rejected/);
  assert.doesNotMatch(closed, /older-change-request|deleted-pending/);
  assert.match(closed, /Mijn open aanvragen<\/span><strong>0<\/strong>/);
  const changes = renderToStaticMarkup(await exported.default!({ searchParams: Promise.resolve({ status: "changes_requested" }) }));
  assert.doesNotMatch(changes, /older-change-request/);
  assert.match(changes, /Geen goedkeuringsaanvragen/);
});
