import assert from "node:assert/strict";
import test from "node:test";
import { eventTimingValues, localDateTimeToIso } from "../src/lib/format.ts";

test("Brussels event across the autumn transition retains both real clock times", () => {
  const result = eventTimingValues({start_date:"2026-10-25", start_time:"01:30", end_date:"2026-10-25", end_time:"03:30"});
  assert.equal(result.start_at, "2026-10-24T23:30:00.000Z");
  assert.equal(result.end_at, "2026-10-25T02:30:00.000Z");
  assert.equal(Date.parse(result.end_at!) - Date.parse(result.start_at!), 3 * 3600000);
});

for (const [local, utc] of [
  ["2026-03-29T01:30:42", "2026-03-29T00:30:42.000Z"],
  ["2026-03-29T03:30", "2026-03-29T01:30:00.000Z"],
  ["2026-10-25T00:30", "2026-10-24T22:30:00.000Z"],
  ["2026-10-25T02:30", "2026-10-25T01:30:00.000Z"],
  ["2026-01-15T12:00", "2026-01-15T11:00:00.000Z"],
  ["2026-07-15T12:00", "2026-07-15T10:00:00.000Z"],
]) test(`Brussels conversion ${local}`, () => assert.equal(localDateTimeToIso(local), utc));

test("Both original occurrences of the repeated hour keep their instant and seconds", () => {
  for (const original of ["2026-10-25T00:30:42.000Z", "2026-10-25T01:30:42.000Z"]) {
    assert.equal(eventTimingValues({start_date:"2026-10-25", start_time:"02:30", original_start_at:original}).start_at, original);
  }
});

test("Spring gap is never silently shifted to a different clock time", () => {
  assert.equal(localDateTimeToIso("2026-03-29T02:30"), null);
  assert.throws(() => eventTimingValues({start_date:"2026-03-29", start_time:"02:30"}), /Deze tijd bestaat niet/);
});

test("Other time zones resolve their own transition offsets", () => {
  assert.equal(localDateTimeToIso("2026-11-01T00:30", "America/New_York"), "2026-11-01T04:30:00.000Z");
  assert.equal(localDateTimeToIso("2026-03-08T02:30", "America/New_York"), null);
  assert.equal(localDateTimeToIso("2026-04-05T01:15", "Australia/Lord_Howe"), "2026-04-04T14:15:00.000Z");
});

test("Explicit instants and empty values retain their existing contract", () => {
  assert.equal(localDateTimeToIso("2026-10-25T02:30:42+02:00"), "2026-10-25T00:30:42.000Z");
  assert.equal(localDateTimeToIso(""), null);
  assert.equal(localDateTimeToIso("invalid"), null);
});
