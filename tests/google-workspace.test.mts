import assert from "node:assert/strict";
import test from "node:test";
import {
  googleWorkloadAudience,
  googleWorkspaceConfiguration,
} from "../src/lib/google-workspace.ts";

test("Workspace-configuratie rapporteert ontbrekende variabelen zonder waarden te lekken", () => {
  const previous = process.env.GOOGLE_WORKLOAD_IDENTITY_POOL_ID;
  delete process.env.GOOGLE_WORKLOAD_IDENTITY_POOL_ID;
  const result = googleWorkspaceConfiguration();
  assert.equal(result.configured, false);
  assert.ok(result.missing.includes("GOOGLE_WORKLOAD_IDENTITY_POOL_ID"));
  if (previous) process.env.GOOGLE_WORKLOAD_IDENTITY_POOL_ID = previous;
});

test("Google audience accepteert losse IDs en volledige resourcepaden", () => {
  const expected = "//iam.googleapis.com/projects/154027614837/locations/global/workloadIdentityPools/besc-vercel/providers/provider";
  assert.equal(googleWorkloadAudience({
    projectNumber: "154027614837",
    workloadIdentityPoolId: "besc-vercel",
    workloadIdentityProviderId: "provider",
  }), expected);
  assert.equal(googleWorkloadAudience({
    projectNumber: "projects/154027614837",
    workloadIdentityPoolId: "projects/154027614837/locations/global/workloadIdentityPools/besc-vercel",
    workloadIdentityProviderId: "projects/154027614837/locations/global/workloadIdentityPools/besc-vercel/providers/provider",
  }), expected);
});
