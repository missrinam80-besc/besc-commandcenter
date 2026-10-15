export const scheduleKinds:Record<string,string> = { program: "Programma", stream: "Streamer/content creator", runbook: "Draaiboek", shift: "Crew / vrijwilliger" };
export function scheduleKindLabel(kind:string,kinds:Record<string,string>=scheduleKinds){return Object.hasOwn(kinds,kind)?kinds[kind]:Object.hasOwn(scheduleKinds,kind)?scheduleKinds[kind]:kind.replaceAll("_"," ");}
export function scheduleKindColor(kind:string){
 const builtin:Record<string,string>={program:"#3975d4",stream:"#9461d4",runbook:"#b88622",shift:"#328866"};
 if(Object.hasOwn(builtin,kind))return builtin[kind];
 let hash=0;for(const char of kind)hash=(hash*31+char.charCodeAt(0))>>>0;
 return `hsl(${hash%360} 55% 48%)`;
}
export const scheduleStatuses = { draft: "Voorstel", confirmed: "Bevestigd", completed: "Uitgevoerd", cancelled: "Vervallen" } as const;
export type EventScheduleItem = {
  id: string; title: string; kind: string; status: keyof typeof scheduleStatuses;
  starts_at: string | null; ends_at: string | null; person_id: string | null;
  slot_booking_id?:string|null; booking_name?:string|null;
  location: string | null; notes: string | null; activity_id?: string | null;
};

export function scheduleStatusLabel(row:EventScheduleItem){return row.slot_booking_id&&row.status==="draft"?"Voorlopig":scheduleStatuses[row.status];}
// Keep the booking history, but remove cancelled booking projections from the agenda.
export function scheduleVisibleRows(rows:EventScheduleItem[]){return rows.filter(row=>!(row.slot_booking_id&&row.status==="cancelled"));}

const agendaDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit" });
const agendaDateLabel = new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", weekday: "long", day: "numeric", month: "long", year: "numeric" });
const agendaTime = new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export function scheduleDayKey(stamp: string): string {
  const parts = agendaDay.formatToParts(new Date(stamp));
  return ["year", "month", "day"].map(type => parts.find(part => part.type === type)?.value).join("-");
}

export function scheduleAgendaDays(rows: EventScheduleItem[]): { key: string; label: string; items: EventScheduleItem[] }[] {
  const groups = new Map<string, { key: string; label: string; items: EventScheduleItem[] }>();
  const sorted = [...rows].sort((a, b) => (a.starts_at ? Date.parse(a.starts_at) : Infinity) - (b.starts_at ? Date.parse(b.starts_at) : Infinity));
  for (const row of sorted) {
    const key = row.starts_at ? scheduleDayKey(row.starts_at) : "unplanned";
    if (!groups.has(key)) groups.set(key, { key, label: row.starts_at ? agendaDateLabel.format(new Date(row.starts_at)) : "Nog niet ingepland", items: [] });
    groups.get(key)!.items.push(row);
  }
  return [...groups.values()];
}

export function scheduleAgendaTime(stamp: string | null, startsAt?: string | null): string {
  if (!stamp) return "Onbekend";
  const time = agendaTime.format(new Date(stamp));
  // Night shifts keep the end date explicit rather than appearing to end before they start.
  if (startsAt && scheduleDayKey(stamp) !== scheduleDayKey(startsAt)) {
    return `${new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", day: "numeric", month: "short", year: "numeric" }).format(new Date(stamp))} · ${time}`;
  }
  return time;
}

// Adjacent shifts are allowed. Cancelled or untimed entries cannot establish a conflict.
export function scheduleConflicts(rows: EventScheduleItem[]): Set<string> {
  const conflicts = new Set<string>();
  const timed = rows.filter(row => row.person_id && row.starts_at && row.ends_at && row.status !== "cancelled");
  for (let i = 0; i < timed.length; i++) for (let j = i + 1; j < timed.length; j++) {
    const a = timed[i], b = timed[j];
    if (a.person_id === b.person_id && Date.parse(a.starts_at!) < Date.parse(b.ends_at!) && Date.parse(b.starts_at!) < Date.parse(a.ends_at!)) {
      conflicts.add(a.id); conflicts.add(b.id);
    }
  }
  return conflicts;
}
