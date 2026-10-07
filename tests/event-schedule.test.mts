import assert from "node:assert/strict";
import test from "node:test";
import { scheduleConflicts, scheduleAgendaDays, scheduleAgendaTime, type EventScheduleItem } from "../src/lib/event-schedule.ts";
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

test("agenda sorteert en groepeert op Belgische datum, niet UTC, met onbekende tijden achteraan",()=>{
 const rows=[item("unknown",null,null),item("late","2026-10-08T22:30:00Z",null),item("early","2026-10-08T21:00:00Z",null),item("first","2026-10-08T20:00:00Z",null)];
 const days=scheduleAgendaDays(rows);assert.deepEqual(days.map(day=>day.key),["2026-10-08","2026-10-09","unplanned"]);assert.deepEqual(days[0].items.map(row=>row.id),["first","early"]);assert.equal(rows[0].id,"unknown");assert.equal(days[2].label,"Nog niet ingepland");
});
test("agenda vermeldt de einddatum van nachtshiften en volgt de zomer-/wintertijd",()=>{
 assert.equal(scheduleAgendaTime("2026-10-08T21:00:00Z"),"23:00");assert.equal(scheduleAgendaTime("2026-12-08T21:00:00Z"),"22:00");assert.match(scheduleAgendaTime("2026-10-09T01:00:00Z","2026-10-08T21:00:00Z"),/9.*2026.*03:00/);assert.equal(scheduleAgendaTime(null),"Onbekend");
});
