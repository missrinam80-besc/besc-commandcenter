import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path: string) => readFile(new URL(path, root), "utf8");

test("rechtenmatrix bevat alle v1-rollen inclusief finance en portaal", async () => {
  const matrix = await source("src/lib/access-matrix.ts");

  for (const role of [
    "admin",
    "board",
    "volunteer",
    "member",
    "portal",
    "expense_submitter",
    "approver",
    "treasurer",
  ]) {
    assert.match(matrix, new RegExp(`${role}:`));
  }
  assert.match(matrix, /Portaalgebruiker/);
  assert.match(matrix, /Expense submitter/);
  assert.match(matrix, /Finance approver/);
  assert.match(matrix, /Treasurer/);
});

test("rechtenmatrix bewaakt aanmaken, bewerken, archiveren, verwijderen, exporteren, goedkeuren en datascope", async () => {
  const matrix = await source("src/lib/access-matrix.ts");

  for (const property of [
    "view:",
    "create:",
    "edit:",
    "archive:",
    "delete:",
    "export:",
    "approve:",
    "dataScope:",
  ]) {
    assert.match(matrix, new RegExp(property));
  }
  assert.match(matrix, /canReviewApproval/);
  assert.match(matrix, /hasPermission/);
  assert.match(matrix, new RegExp("Geen toegang tot /app"));
});

test("rechtencontrolepagina is zichtbaar voor bestuur en beheer en toont de matrix", async () => {
  const shell = await source("src/components/app-shell.tsx");
  const page = await source("src/app/app/beheer/rechten/page.tsx");

  assert.match(shell, /Rechtencontrole/);
  assert.match(shell, /\/app\/beheer\/rechten/);
  assert.match(shell, /roles: \["admin", "board"\]/);
  assert.match(page, /requirePermission\("manageOrganization"/);
  assert.match(page, /permission-role-tabs/);
  assert.match(page, /permissions-table/);
});
