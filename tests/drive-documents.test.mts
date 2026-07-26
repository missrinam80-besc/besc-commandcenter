import assert from "node:assert/strict";
import test from "node:test";
import {
  driveCoverage,
  filterDriveDocuments,
  makeDriveDocument,
  type DriveDocument,
} from "../src/lib/drive-documents.ts";

const documents: DriveDocument[] = [
  makeDriveDocument({ id: "1", title: "TwitchCon", source: "project", sourceHref: "/project", driveUrl: "https://drive.google.com/1", status: "active", updatedAt: "2026-07-20" }),
  makeDriveDocument({ id: "2", title: "Sunday Sessions", source: "event", sourceHref: "/event", driveUrl: null, status: "planning", updatedAt: "2026-07-24" }),
  makeDriveDocument({ id: "3", title: "Partnerbriefing", source: "sponsor", sourceHref: "/sponsor", driveUrl: "https://drive.google.com/3", status: "active", updatedAt: "2026-07-22" }),
];

test("Drive-dekking telt gekoppelde en ontbrekende dossiers", () => {
  assert.deepEqual(driveCoverage(documents), { total: 3, linked: 2, missing: 1, percentage: 67 });
});

test("documentregister filtert op bron en ontbrekende link", () => {
  assert.deepEqual(filterDriveDocuments(documents, "", "event", "missing").map((item) => item.id), ["2"]);
});

test("documentregister zoekt ook in bron en status", () => {
  assert.deepEqual(filterDriveDocuments(documents, "partner", "all", "all").map((item) => item.id), ["3"]);
  assert.deepEqual(filterDriveDocuments(documents, "planning", "all", "all").map((item) => item.id), ["2"]);
});
