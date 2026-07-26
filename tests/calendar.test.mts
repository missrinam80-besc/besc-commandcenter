import assert from "node:assert/strict";
import test from "node:test";
import {
  calendarDayKey,
  filterCalendarItems,
  shiftCalendarMonth,
  validCalendarMonth,
  type CalendarItem,
} from "../src/lib/calendar.ts";

const items: CalendarItem[] = [
  { id: "shared", title: "Social post", date: "2026-08-20T18:00:00Z", kind: "social", label: "Social post", href: "/social" },
  { id: "mine-late", title: "Mijn event", date: "2026-08-16T18:00:00Z", kind: "event", label: "Event", href: "/event", personal: true },
  { id: "mine-first", title: "Mijn taak", date: "2026-08-10T08:00:00Z", kind: "task", label: "Taak", href: "/task", personal: true },
];

test("kalender accepteert alleen geldige maandparameters", () => {
  assert.equal(validCalendarMonth("2026-08"), "2026-08");
  assert.notEqual(validCalendarMonth("2026-13"), "2026-13");
});

test("maandnavigatie werkt over een jaargrens", () => {
  assert.equal(shiftCalendarMonth("2026-01", -1), "2025-12");
  assert.equal(shiftCalendarMonth("2026-12", 1), "2027-01");
});

test("persoonlijke planning filtert en sorteert chronologisch", () => {
  assert.deepEqual(filterCalendarItems(items, "all", "mine").map((item) => item.id), ["mine-first", "mine-late"]);
  assert.deepEqual(filterCalendarItems(items, "event", "all").map((item) => item.id), ["mine-late"]);
});

test("tijdstippen worden naar de Brusselse kalenderdag vertaald", () => {
  assert.equal(calendarDayKey("2026-08-10"), "2026-08-10");
  assert.equal(calendarDayKey("2026-08-09T22:30:00Z"), "2026-08-10");
});
