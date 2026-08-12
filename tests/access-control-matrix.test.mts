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
  const [shell, page, actions, migration, users] = await Promise.all([
    source("src/components/app-shell.tsx"),
    source("src/app/app/beheer/rechten/page.tsx"),
    source("src/app/app/beheer/actions.ts"),
    source("supabase/migrations/20260812110000_add_custom_access_roles.sql"),
    source("src/app/app/beheer/gebruikers/page.tsx"),
  ]);

  assert.match(shell, /Rechtencontrole/);
  assert.match(shell, /\/app\/beheer\/rechten/);
  assert.match(shell, /roles: \["admin", "board"\]/);
  assert.match(page, /requirePermission\("manageOrganization"/);
  assert.match(page, /permission-role-tabs/);
  assert.match(page, /permissions-table/);
  assert.match(page, /Rolprofiel toevoegen/);
  assert.match(page, /capabilities/);
  assert.match(actions, /saveAccessRole/);
  assert.match(actions, /deleteAccessRole/);
  assert.match(users, /access_role_id/);
  assert.match(migration, /organization_access_roles/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /grant select, insert, update, delete/);
});
