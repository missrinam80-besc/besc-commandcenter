import assert from "node:assert/strict";
import test from "node:test";
import {
  driveCoverage,
  filterDriveDocuments,
  filterGeneratedDocuments,
  makeDriveDocument,
  type DriveDocument,
  type GeneratedDocumentRecord,
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

const generated: GeneratedDocumentRecord[] = [
  { id: "meeting:1", entityId: "1", title: "Notulen - Bestuur", module: "meetings", moduleLabel: "Vergaderingen", documentType: "minutes", documentTypeLabel: "Notulen", status: "available", sourceStatus: "completed", sourceHref: "/meeting", driveUrl: "https://docs.google.com/1", updatedAt: "2026-07-28" },
  { id: "event:1", entityId: "1", title: "Eventdossier - Community Night", module: "events", moduleLabel: "Events", documentType: "event_dossier", documentTypeLabel: "Eventdossier", status: "missing", sourceStatus: "confirmed", sourceHref: "/event", driveUrl: null, updatedAt: "2026-07-29" },
];

test("gegenereerde documenten filteren op module, type en ontbrekende status", () => {
  assert.deepEqual(filterGeneratedDocuments(generated, {
    query: "",
    module: "events",
    documentType: "event_dossier",
    status: "missing",
  }).map((item) => item.id), ["event:1"]);
});

test("ontbrekende documenten staan bovenaan in het register", () => {
  assert.deepEqual(filterGeneratedDocuments(generated, {
    query: "",
    module: "all",
    documentType: "all",
    status: "all",
  }).map((item) => item.id), ["event:1", "meeting:1"]);
});
