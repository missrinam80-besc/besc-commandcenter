"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { buildTimeGridDay, calendarWeekStart, initialCalendarDay, shiftCalendarDay } from "@/lib/event-timegrid";
import { scheduleAgendaTime, scheduleConflicts, scheduleKinds, scheduleStatuses, type EventScheduleItem } from "@/lib/event-schedule";
import { formatDateTime } from "@/lib/format";

const dayLabel = new Intl.DateTimeFormat("nl-BE", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
export function EventTimeGrid({ rows, people, canEdit, conflictIds }: {
  rows: EventScheduleItem[]; people: { id: string; label: string }[]; canEdit: boolean; conflictIds?: string[];
}) {
  const [day, setDay] = useState(() => initialCalendarDay(rows));
  const [view, setView] = useState<"day" | "week">("week");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const details = useRef<HTMLElement>(null);
  const firstDay = view === "week" ? calendarWeekStart(day) : day;
  const days = Array.from({ length: view === "week" ? 7 : 1 }, (_, index) => buildTimeGridDay(rows, shiftCalendarDay(firstDay, index)));
  const earliest = Math.min(...days.flatMap(item => item.segments.map(segment => segment.start)));
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = Number.isFinite(earliest) ? Math.max(0, earliest - 60) : 480;
  }, [firstDay, view, earliest]);
  useEffect(() => {
    if (selectedId && details.current) {
      details.current.focus({ preventScroll: true });
      details.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedId]);
  const selected = rows.find(row => row.id === selectedId);
  const incomplete = rows.filter(row => !row.starts_at || !row.ends_at);
  const hasTimed = rows.some(row => row.starts_at && row.ends_at);
  const conflicts = new Set(conflictIds ?? [...scheduleConflicts(rows)]);
  const personLabel = (row: EventScheduleItem) => people.find(person => person.id === row.person_id)?.label || (row.person_id ? "Eerder toegewezen persoon" : "Nog niet toegewezen");
  return <div className="event-timegrid">
    {hasTimed && <><div className="event-timegrid-toolbar">
      <div><button type="button" aria-label={view === "week" ? "Vorige week" : "Vorige dag"} onClick={() => setDay(shiftCalendarDay(day, view === "week" ? -7 : -1))}><ChevronLeft size={16}/></button>
        <label>Datum<input aria-label="Agendadatum" type="date" value={day} onChange={event => { if (/^\d{4}-\d{2}-\d{2}$/.test(event.target.value)) setDay(event.target.value); }}/></label>
        <button type="button" aria-label={view === "week" ? "Volgende week" : "Volgende dag"} onClick={() => setDay(shiftCalendarDay(day, view === "week" ? 7 : 1))}><ChevronRight size={16}/></button>
      </div>
      <div><button type="button" aria-pressed={view === "day"} onClick={() => setView("day")}>Dag</button><button type="button" aria-pressed={view === "week"} onClick={() => setView("week")}>Week</button></div>
    </div>
    <p className="event-timegrid-hint">Tijden in België · Klik op een blok voor alle gegevens.</p>
    <div className="event-timegrid-scroll" ref={scroller} tabIndex={0} aria-label="Eventagenda met uren en dagen">
      <div className={`event-timegrid-columns event-timegrid-${view}`}>
        {days.map(date => <section className="event-timegrid-day" key={date.day} aria-label={date.day}>
          <h3>{dayLabel.format(new Date(`${date.day}T12:00:00Z`))}</h3>
          <div className="event-timegrid-hours" style={{ height: date.minutes }}>
            {date.ticks.map(tick => <div className="event-timegrid-hour" style={{ top: tick.minute }} key={tick.minute}><span>{tick.label}</span></div>)}
            <div className="event-timegrid-blocks">
              {date.segments.map(segment => <button type="button" className="event-timegrid-block" data-kind={segment.row.kind} data-status={segment.row.status} key={segment.row.id}
                style={{ top: segment.start, height: Math.max(2, segment.end - segment.start), left: `${segment.lane * 100 / segment.lanes}%`, width: `${100 / segment.lanes}%` }}
                aria-label={`${segment.row.title}, ${scheduleKinds[segment.row.kind]}, ${formatDateTime(segment.row.starts_at)} tot ${formatDateTime(segment.row.ends_at)}, ${personLabel(segment.row)}, ${scheduleStatuses[segment.row.status]}${conflicts.has(segment.row.id) ? ", overlappende toewijzing" : ""}`}
                title={`${segment.row.title} · ${scheduleAgendaTime(segment.row.starts_at)}–${scheduleAgendaTime(segment.row.ends_at, segment.row.starts_at)}`}
                onClick={() => setSelectedId(segment.row.id)}>
                <strong>{segment.row.title}</strong><span>{scheduleKinds[segment.row.kind]}{conflicts.has(segment.row.id) ? " · !" : ""}</span>
                <span>{segment.continuesBefore ? "← " : ""}{scheduleAgendaTime(segment.row.starts_at)}–{scheduleAgendaTime(segment.row.ends_at, segment.row.starts_at)}{segment.continuesAfter ? " →" : ""}</span>
                <span>{personLabel(segment.row)}</span>
              </button>)}
            </div>
          </div>
        </section>)}
      </div>
    </div></>}
    {incomplete.length > 0 && <section className="event-timegrid-incomplete"><h3>Nog niet volledig ingepland</h3><p>Deze onderdelen missen een start- of eindtijd en staan daarom apart.</p>
      {incomplete.map(row => <button type="button" data-kind={row.kind} key={row.id} onClick={() => setSelectedId(row.id)}><strong>{row.title}</strong><span>{scheduleKinds[row.kind]} · {scheduleStatuses[row.status]} · {row.starts_at ? formatDateTime(row.starts_at) : "Tijd onbekend"}{row.starts_at ? " · einde onbekend" : ""}</span></button>)}
    </section>}
    {selected && <section className="event-timegrid-details" ref={details} tabIndex={-1} data-kind={selected.kind} aria-label="Details van het agendaonderdeel">
      <div><h3>{selected.title}</h3><button type="button" aria-label="Details sluiten" onClick={() => setSelectedId(null)}><X size={16}/></button></div>
      <p>{scheduleKinds[selected.kind]} · {scheduleStatuses[selected.status]}</p>
      <p>{formatDateTime(selected.starts_at, "Start onbekend")} → {formatDateTime(selected.ends_at, "Einde onbekend")}</p>
      <p>{personLabel(selected)}{selected.location ? ` · ${selected.location}` : ""}</p>
      {conflicts.has(selected.id) && <p className="event-agenda-conflict">Deze persoon heeft een overlappende toewijzing.</p>}
      {selected.notes && <p className="event-timegrid-notes">{selected.notes}</p>}
      {canEdit && <Link className="row-action" href={`?tab=planning&schema=${selected.id}`}>Bewerken</Link>}
    </section>}
  </div>;
}
