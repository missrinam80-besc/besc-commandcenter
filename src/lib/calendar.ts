export type CalendarKind =
  | "task"
  | "project"
  | "content"
  | "publication"
  | "event"
  | "meeting"
  | "social"
  | "campaign"
  | "compliance"
  | "launch";

export type CalendarItem = {
  id: string;
  title: string;
  date: string;
  kind: CalendarKind;
  label: string;
  href: string;
  timed?: boolean;
  personal?: boolean;
};

export const calendarLabels: Record<CalendarKind, string> = {
  task: "Taak",
  project: "Project",
  content: "Contentdeadline",
  publication: "Publicatie",
  event: "Event",
  meeting: "Vergadering",
  social: "Social post",
  campaign: "Campagne",
  compliance: "VZW-deadline",
  launch: "Shoplancering",
};

export const calendarKinds = Object.keys(calendarLabels) as CalendarKind[];

export function validCalendarMonth(value?: string) {
  return value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
    ? value
    : new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Brussels",
        year: "numeric",
        month: "2-digit",
      }).format(new Date());
}

export function shiftCalendarMonth(month: string, offset: number) {
  const [year, value] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, value - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function calendarDayKey(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Brussels",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

export function filterCalendarItems(
  items: CalendarItem[],
  kind: CalendarKind | "all",
  scope: "all" | "mine",
) {
  return items
    .filter((item) => kind === "all" || item.kind === kind)
    .filter((item) => scope === "all" || item.personal)
    .sort((left, right) => left.date.localeCompare(right.date));
}
