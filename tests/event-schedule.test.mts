import assert from "node:assert/strict";
import test from "node:test";
import { scheduleConflicts, type EventScheduleItem } from "../src/lib/event-schedule.ts";
import { resolveEventDossierTab } from "../src/lib/event-dossier-tabs.ts";

const item = (id: string, starts_at: string | null, ends_at: string | null, extra: Partial<EventScheduleItem> = {}): EventScheduleItem => ({
  id, title: id, starts_at, ends_at, person_id: "person-a", kind: "shift", status: "confirmed", location: null, notes: null, ...extra,
});
test("overlap vindt nachtshiften en streams van dezelfde persoon, onafhankelijk van tijdzone", () => {
  const rows = [item("a", "2026-10-08T23:00:00+02:00", "2026-10-09T03:00:00+02:00"),
    item("b", "2026-10-09T00:30:00Z", "2026-10-09T02:00:00Z", { kind: "stream" }),
    item("other", "2026-10-09T00:30:00Z", "2026-10-09T02:00:00Z", { person_id: "person-b" })];
  assert.deepEqual([...scheduleConflicts(rows)].sort(), ["a", "b"]);
});
test("aansluitende, vervallen, ongetimede en niet-toegewezen onderdelen geven geen overlap", () => {
  const rows = [item("a", "2026-10-08T10:00Z", "2026-10-08T11:00Z"), item("b", "2026-10-08T11:00Z", "2026-10-08T12:00Z"),
    item("cancelled", "2026-10-08T10:00Z", "2026-10-08T12:00Z", { status: "cancelled" }),
    item("unknown", "2026-10-08T10:00Z", null), item("none", "2026-10-08T10:00Z", "2026-10-08T12:00Z", { person_id: null })];
  assert.equal(scheduleConflicts(rows).size, 0);
});
test("schema-modal, filter en actiefeedback behouden Planning & crew", () => {
  for (const query of [{ schema: "nieuw" }, { schema_type: "shift" }, { succes: "schema-opgeslagen" }, { fout: "schema-velden" }])
    assert.equal(resolveEventDossierTab(query), "planning");
});
