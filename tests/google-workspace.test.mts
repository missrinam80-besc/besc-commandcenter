import assert from "node:assert/strict";
import test from "node:test";
import {
  googleDriveFileId,
  googleDriveModuleFolders,
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

test("Google Drive-map-ID wordt uit ondersteunde links gelezen", () => {
  const id = "1AbCdEfGhIjKlMnOpQrStUvWxYz";
  assert.equal(googleDriveFileId(id), id);
  assert.equal(googleDriveFileId(`https://drive.google.com/drive/folders/${id}?usp=sharing`), id);
  assert.equal(googleDriveFileId(`https://drive.google.com/open?id=${id}`), id);
  assert.equal(googleDriveFileId("https://drive.google.com/drive/my-drive"), null);
  assert.equal(googleDriveFileId("geen geldige link"), null);
});

test("elke Command Center-module heeft een vaste Drive-mapnaam", () => {
  assert.equal(googleDriveModuleFolders.projects, "Projecten");
  assert.equal(googleDriveModuleFolders.events, "Events");
  assert.equal(googleDriveModuleFolders.content, "Content");
  assert.equal(googleDriveModuleFolders.finance, "Financiën");
  assert.equal(Object.keys(googleDriveModuleFolders).length, 11);
});
