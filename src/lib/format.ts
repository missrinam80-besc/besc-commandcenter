const dateFormatter = new Intl.DateTimeFormat("nl-BE", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("nl-BE", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Brussels",
});

const dateTimeLocalFormatter = new Intl.DateTimeFormat("en-CA", {
  calendar: "iso8601",
  timeZone: "Europe/Brussels",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const currencyFormatter = new Intl.NumberFormat("nl-BE", {
  style: "currency",
  currency: "EUR",
});

export function formatDate(value?: string | null, fallback = "Niet bepaald") {
  if (!value) return fallback;
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? fallback : dateFormatter.format(date);
}

export function formatDateTime(value?: string | null, fallback = "Geen deadline") {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : dateTimeFormatter.format(date);
}

export function formatLocalDate(value?: string | null, fallback = "Niet bepaald") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat("nl-BE", { dateStyle: "medium", timeZone: "Europe/Brussels" }).format(date);
}

export function formatDateTimeLocal(value?: string | Date | null) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = Object.fromEntries(dateTimeLocalFormatter.formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** Dates can be known without a clock time. Never invent midnight for an event. */
export function eventDateFields(event: Record<string, unknown>, prefix: "start" | "end") {
  const stamp = event[`${prefix}_at`] as string | null | undefined;
  const local = formatDateTimeLocal(stamp);
  return { date: local.slice(0, 10) || (event[`${prefix}_date`] as string | null) || "", time: local.slice(11) };
}

type EventTimingInput = Partial<Record<"start_date" | "end_date" | "start_time" | "end_time" | "start_at" | "end_at" | "original_start_at" | "original_end_at", string>>;

export function eventTimingValues(input: EventTimingInput) {
  const endpoint = (prefix: "start" | "end") => {
    // Keep compatibility with callers that still submit the combined field.
    const legacy = input[`${prefix}_at`];
    const local = formatDateTimeLocal(localDateTimeToIso(legacy));
    const date = input[`${prefix}_date`] ?? local.slice(0, 10);
    const time = input[`${prefix}_time`] ?? local.slice(11);
    if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date)) throw new Error("Ongeldige datum");
    if (time && (!date || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) throw new Error("Een tijd heeft een geldige datum nodig");
    if (!date || !time) return { date: date || null, at: null };
    const combined = `${date}T${time}`;
    const original = input[`original_${prefix}_at`];
    // Preserve seconds and the original offset during unchanged edits, including the repeated DST hour.
    const at = original && formatDateTimeLocal(original) === combined ? new Date(original).toISOString() : localDateTimeToIso(combined);
    if (!at || formatDateTimeLocal(at) !== combined) throw new Error("Deze tijd bestaat niet in Europe/Brussels");
    return { date, at };
  };
  const start = endpoint("start"), end = endpoint("end");
  if (start.date && end.date && end.date < start.date) throw new Error("Einddatum ligt vóór startdatum");
  if (start.at && end.at && end.at < start.at) throw new Error("Eindtijd ligt vóór starttijd");
  return { start_date: start.date, end_date: end.date, start_at: start.at, end_at: end.at };
}

export function formatEventEndpoint(event: Record<string, unknown>, prefix: "start" | "end", fallback = "Datum onbekend") {
  const stamp = event[`${prefix}_at`] as string | null;
  if (stamp) return formatDateTime(stamp, fallback);
  const date = event[`${prefix}_date`] as string | null;
  return date ? `${formatDate(date)} · Tijd onbekend` : fallback;
}

export function localDateTimeToIso(value?: string | null, timeZone = "Europe/Brussels") {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) {
    const fallback = new Date(value);
    return Number.isNaN(fallback.getTime()) ? null : fallback.toISOString();
  }
  const [, year, month, day, hour, minute, second = "0"] = match;
  const wallTime = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  const parts = new Intl.DateTimeFormat("en-CA", {
    calendar: "iso8601",
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(wallTime));
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
  const represented = Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute, values.second);
  return new Date(wallTime - (represented - wallTime)).toISOString();
}

export function formatCurrency(value?: number | string | null, fallback = "Niet bepaald") {
  if (value === null || value === undefined || value === "") return fallback;
  const amount = Number(value);
  return Number.isFinite(amount) ? currencyFormatter.format(amount) : fallback;
}
