import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const actions = readFileSync("src/app/app/lifecycle-actions.ts", "utf8");
const config = readFileSync("src/lib/record-lifecycle.ts", "utf8");
const panel = readFileSync("src/components/record-lifecycle-panel.tsx", "utf8");
const operational = readFileSync("src/components/operational-record-detail.tsx", "utf8");

test("lifecycle-acties ondersteunen archiveren, herstellen en soft-delete", () => {
  assert.match(actions, /action: z\.enum\(\["archive", "restore", "delete"\]\)/);
  assert.match(actions, /deleted_at: now/);
  assert.match(actions, /config\.restoreStatus/);
  assert.match(actions, /\.eq\("status", config\.archiveStatus\)/);
  assert.doesNotMatch(actions, /\.delete\(\)/);
  assert.match(actions, /\.eq\("organization_id", membership\.organization_id\)/);
  assert.match(actions, /\.is\("deleted_at", null\)/);
});

test("definitief verbergen vereist een expliciete bevestiging", () => {
  assert.match(actions, /confirmation !== "VERWIJDER"/);
  assert.match(panel, /pattern="VERWIJDER"/);
  assert.match(panel, /name="action" value="restore"/);
});

test("alle centrale dossiermodules zijn opgenomen", () => {
  for (const entity of [
    "project",
    "event",
    "content",
    "partner",
    "campaign",
    "communityPerson",
    "socialPost",
    "meeting",
  ]) {
    assert.match(config, new RegExp(`${entity}:`));
  }
  assert.match(operational, /RecordLifecyclePanel/);
});

test("lifecycle-acties zijn gekoppeld aan bestaande capabilitycontroles", () => {
  for (const capability of [
    "manageProjects",
    "manageEvents",
    "manageContent",
    "manageOrganization",
  ]) {
    assert.match(config, new RegExp(`"${capability}"`));
  }
  assert.match(actions, /requirePermission\(\s*config\.capability/);
});

