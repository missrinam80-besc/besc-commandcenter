import { localDateTimeToIso } from "./format.ts";
import { scheduleDayKey, type EventScheduleItem } from "./event-schedule.ts";

export function shiftCalendarDay(day: string, offset: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
export function calendarWeekStart(day: string): string {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  return shiftCalendarDay(day, -(weekday + 6) % 7);
}
export type GridSegment = { row: EventScheduleItem; start: number; end: number; lane: number; lanes: number; continuesBefore: boolean; continuesAfter: boolean };

export function buildTimeGridDay(rows: EventScheduleItem[], day: string) {
  const start = Date.parse(localDateTimeToIso(`${day}T00:00`)!);
  const end = Date.parse(localDateTimeToIso(`${shiftCalendarDay(day, 1)}T00:00`)!);
  const minutes = (end - start) / 60000;
  const segments: GridSegment[] = [];
  for (const row of rows) {
    if (!row.starts_at || !row.ends_at) continue;
    const from = Date.parse(row.starts_at), to = Date.parse(row.ends_at);
    if (from >= end || to <= start || to <= from) continue;
    segments.push({ row, start: (Math.max(start, from) - start) / 60000, end: (Math.min(end, to) - start) / 60000,
      lane: 0, lanes: 1, continuesBefore: from < start, continuesAfter: to > end });
  }
  segments.sort((a, b) => a.start - b.start || b.end - a.end || a.row.id.localeCompare(b.row.id));
  // A connected overlap group shares a width; half-open intervals allow adjacent blocks.
  let group: GridSegment[] = [], laneEnds: number[] = [], groupEnd = -1;
  const finish = () => { for (const segment of group) segment.lanes = laneEnds.length; };
  for (const segment of segments) {
    if (segment.start >= groupEnd) { finish(); group = []; laneEnds = []; }
    let lane = laneEnds.findIndex(until => until <= segment.start);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = segment.end;
    segment.lane = lane;
    group.push(segment);
    groupEnd = Math.max(...laneEnds);
  }
  finish();
  const tickFormatter = new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", hour: "2-digit", minute: "2-digit", hourCycle: "h23", ...(minutes === 1500 ? { timeZoneName: "shortOffset" as const } : {}) });
  const ticks = Array.from({ length: minutes / 60 }, (_, hour) => ({ minute: hour * 60, label: tickFormatter.format(new Date(start + hour * 3600000)) }));
  return { day, minutes, segments, ticks };
}

export function initialCalendarDay(rows: EventScheduleItem[]): string {
  const timed = rows.filter(row => row.starts_at).sort((a, b) => Date.parse(a.starts_at!) - Date.parse(b.starts_at!));
  return scheduleDayKey(timed[0]?.starts_at ?? new Date().toISOString());
}
