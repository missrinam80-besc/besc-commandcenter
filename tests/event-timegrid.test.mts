import assert from "node:assert/strict";
import test from "node:test";
import { buildTimeGridDay, calendarWeekStart, initialCalendarDay, shiftCalendarDay } from "../src/lib/event-timegrid.ts";
import type { EventScheduleItem } from "../src/lib/event-schedule.ts";

function row(id: string, starts_at: string | null, ends_at: string | null): EventScheduleItem {
  return { id, title: id, starts_at, ends_at, kind: "stream", status: "confirmed", person_id: null, notes: null, location: null };
}
test("overlappende tijden staan in afzonderlijke kolommen, onafhankelijk van persoon", () => {
  const rows = [row("a", "2026-10-08T08:00Z", "2026-10-08T10:00Z"), row("b", "2026-10-08T09:00Z", "2026-10-08T11:00Z"), row("c", "2026-10-08T09:30Z", "2026-10-08T10:30Z")];
  const { segments } = buildTimeGridDay(rows, "2026-10-08");
  assert.deepEqual(segments.map(segment => segment.lane), [0, 1, 2]);
  assert.ok(segments.every(segment => segment.lanes === 3));
  assert.equal(segments[0].start, 600); assert.equal(segments[0].end, 720);
});
test("aansluitende blokken hergebruiken een kolom; losse groepen krijgen hun eigen volle breedte", () => {
  const rows = [row("a", "2026-10-08T08:00Z", "2026-10-08T09:00Z"), row("b", "2026-10-08T09:00Z", "2026-10-08T10:00Z")];
  assert.ok(buildTimeGridDay(rows, "2026-10-08").segments.every(segment => segment.lanes === 1 && segment.lane === 0));
});
test("keten van overlap bewaart groepsbreedte en hergebruikt vrijgekomen kolommen", () => {
  const rows = [row("a", "2026-10-08T08:00Z", "2026-10-08T10:00Z"), row("b", "2026-10-08T09:00Z", "2026-10-08T11:00Z"), row("c", "2026-10-08T10:00Z", "2026-10-08T12:00Z")];
  const segments = buildTimeGridDay(rows, "2026-10-08").segments;
  assert.deepEqual(segments.map(segment => segment.lane), [0, 1, 0]); assert.ok(segments.every(segment => segment.lanes === 2));
});
test("nachtshift splitst bij Belgische middernacht; exact middernachteinde verschijnt niet de volgende dag", () => {
  const night = row("night", "2026-10-08T21:00Z", "2026-10-09T01:00Z");
  const first = buildTimeGridDay([night], "2026-10-08").segments[0], next = buildTimeGridDay([night], "2026-10-09").segments[0];
  assert.equal(first.start, 1380); assert.equal(first.end, 1440); assert.ok(first.continuesAfter);
  assert.equal(next.start, 0); assert.equal(next.end, 180); assert.ok(next.continuesBefore);
  assert.equal(buildTimeGridDay([row("midnight", "2026-10-08T21:00Z", "2026-10-08T22:00Z")], "2026-10-09").segments.length, 0);
});
test("tijdwissels behouden werkelijke duur, met 23/25 uur en onderscheiden herhaalde uren", () => {
  const spring = buildTimeGridDay([row("spring", "2026-03-29T00:00Z", "2026-03-29T02:00Z")], "2026-03-29");
  assert.equal(spring.minutes, 1380); assert.equal(spring.segments[0].end - spring.segments[0].start, 120);
  assert.ok(!spring.ticks.some(tick => tick.label === "02:00"));
  const autumn = buildTimeGridDay([], "2026-10-25"); assert.equal(autumn.minutes, 1500);
  const repeated = autumn.ticks.filter(tick => tick.label.startsWith("02:00")); assert.equal(repeated.length, 2); assert.notEqual(repeated[0].label, repeated[1].label);
});
test("onvolledige tijden krijgen geen verzonnen duur; navigatie volgt kalenderdagen", () => {
  assert.equal(buildTimeGridDay([row("none", null, null), row("start", "2026-10-08T08:00Z", null)], "2026-10-08").segments.length, 0);
  assert.equal(shiftCalendarDay("2026-12-31", 1), "2027-01-01"); assert.equal(calendarWeekStart("2026-10-11"), "2026-10-05");
  assert.equal(initialCalendarDay([row("later", "2026-10-08T22:30Z", null), row("early", "2026-10-08T20:00Z", null)]), "2026-10-08");
});
