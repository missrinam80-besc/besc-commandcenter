import assert from "node:assert/strict";
import test from "node:test";
import { googleWorkspaceConfiguration } from "../src/lib/google-workspace.ts";

test("Workspace-configuratie rapporteert ontbrekende variabelen zonder waarden te lekken", () => {
  const previous = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  delete process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  const result = googleWorkspaceConfiguration();
  assert.equal(result.configured, false);
  assert.ok(result.missing.includes("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY"));
  if (previous) process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = previous;
});
