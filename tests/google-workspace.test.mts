import assert from "node:assert/strict";
import test from "node:test";
import { googleWorkspaceConfiguration } from "../src/lib/google-workspace.ts";

test("Workspace-configuratie rapporteert ontbrekende variabelen zonder waarden te lekken", () => {
  const previous = process.env.GOOGLE_WORKLOAD_IDENTITY_POOL_ID;
  delete process.env.GOOGLE_WORKLOAD_IDENTITY_POOL_ID;
  const result = googleWorkspaceConfiguration();
  assert.equal(result.configured, false);
  assert.ok(result.missing.includes("GOOGLE_WORKLOAD_IDENTITY_POOL_ID"));
  if (previous) process.env.GOOGLE_WORKLOAD_IDENTITY_POOL_ID = previous;
});
