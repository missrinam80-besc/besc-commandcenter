import assert from "node:assert/strict";
import test from "node:test";

import {
  auditEntityHref,
  auditGroupTables,
  describeChangedFields,
} from "../src/lib/audit.ts";

test("auditgroepen leveren alleen hun eigen tabellen op", () => {
  assert.deepEqual(auditGroupTables("finance"), [
    "budget_envelopes",
    "expenses",
    "income_entries",
    "financial_documents",
  ]);
  assert.equal(auditGroupTables("onbekend"), null);
});

test("actieve dossiers verwijzen naar hun detailpagina", () => {
  assert.equal(
    auditEntityHref("projects", "project-id", "updated"),
    "/app/projecten/project-id",
  );
  assert.equal(
    auditEntityHref("expenses", "expense-id", "created"),
    "/app/financien/kosten/expense-id",
  );
});

test("verwijderde en gearchiveerde dossiers krijgen geen dode link", () => {
  assert.equal(auditEntityHref("projects", "project-id", "archived"), null);
  assert.equal(auditEntityHref("projects", "project-id", "deleted"), null);
});

test("overzichtsmodules verwijzen niet naar een onbestaande detailroute", () => {
  assert.equal(
    auditEntityHref("inbox_items", "inbox-id", "updated"),
    "/app/inbox",
  );
  assert.equal(
    auditEntityHref("administrative_documents", "document-id", "updated"),
    "/app/administratie",
  );
});

test("gewijzigde velden krijgen begrijpelijke Nederlandse labels", () => {
  assert.equal(
    describeChangedFields(["status", "due_at", "project_id"]),
    "status, deadline, projectkoppeling",
  );
  assert.equal(describeChangedFields([]), null);
});
