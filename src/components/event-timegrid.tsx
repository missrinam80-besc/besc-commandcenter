"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { buildTimeGridDay, initialCalendarDay } from "@/lib/event-timegrid";
import { scheduleAgendaDays, scheduleAgendaTime, scheduleConflicts, scheduleKinds, scheduleKindLabel, scheduleKindColor, scheduleStatusLabel, type EventScheduleItem } from "@/lib/event-schedule";
import { formatDateTime } from "@/lib/format";

import {relevantAgendaIntervals,visibleAgendaDays,nextRelevantAgendaDay,isRelevantAgendaDay,type EventAgendaPeriod} from "@/lib/event-agenda-range";

const dayLabel = new Intl.DateTimeFormat("nl-BE", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
export function EventTimeGrid({ rows, people, canEdit, conflictIds, kinds=scheduleKinds, activities=[], eventPeriod={} }: {
  rows: EventScheduleItem[]; people: { id: string; label: string }[]; canEdit: boolean; conflictIds?: string[]; kinds?:Record<string,string>; activities?:{id:string;title:string}[]; eventPeriod?:EventAgendaPeriod;
}) {
  const [day, setDay] = useState(() => initialCalendarDay(rows));
  const [view, setView] = useState<"day" | "week" | "list">("week");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const details = useRef<HTMLElement>(null);
  const intervals=relevantAgendaIntervals(rows,eventPeriod);
  const activeDay=isRelevantAgendaDay(day,intervals)?day:intervals[0]?.start??day;
  const calendarView=view==="day"?"day":"week";
  const previous=nextRelevantAgendaDay(activeDay,-1,calendarView,intervals),next=nextRelevantAgendaDay(activeDay,1,calendarView,intervals);
  const days=visibleAgendaDays(activeDay,calendarView,intervals).map(date=>buildTimeGridDay(rows,date));
  const firstDay=days[0]?.day??activeDay;
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
  const personLabel = (row: EventScheduleItem) => row.booking_name || people.find(person => person.id === row.person_id)?.label || (row.person_id ? "Eerder toegewezen persoon" : "Nog niet toegewezen");
  const activityTitle=(row:EventScheduleItem)=>activities.find(activity=>activity.id===row.activity_id)?.title;
  return <div className="event-timegrid">
    <div className="event-timegrid-toolbar">
      {view!=="list" && intervals.length>0 && <div><button type="button" disabled={!previous} aria-label={view === "week" ? "Vorige week" : "Vorige dag"} onClick={() => {if(previous)setDay(previous);}}><ChevronLeft size={16}/></button>
        <label>Datum<input aria-label="Agendadatum" type="date" value={activeDay} min={intervals[0]?.start} max={intervals.at(-1)?.end} onChange={event => {const chosen=event.target.value;if(/^\d{4}-\d{2}-\d{2}$/.test(chosen)){setDay(isRelevantAgendaDay(chosen,intervals)?chosen:intervals.find(span=>span.start>chosen)?.start??intervals.at(-1)?.end??chosen);}}}/></label>
        <button type="button" disabled={!next} aria-label={view === "week" ? "Volgende week" : "Volgende dag"} onClick={() => {if(next)setDay(next);}}><ChevronRight size={16}/></button>
      </div>}
      <div><button type="button" aria-pressed={view === "day"} onClick={() => setView("day")}>Dag</button><button type="button" aria-pressed={view === "week"} onClick={() => setView("week")}>Week</button><button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>Lijst</button></div>
    </div>
    {view==="list" && <div className="event-agenda-list">{scheduleAgendaDays(rows).map(group=><section key={group.key}><h3>{group.label}</h3>{group.items.map(row=><button id={`agenda-${row.id}`} type="button" key={row.id} data-kind={row.kind} style={{"--agenda-color":scheduleKindColor(row.kind)} as CSSProperties} onClick={()=>setSelectedId(row.id)}><span className="event-agenda-list-time">{row.starts_at?scheduleAgendaTime(row.starts_at):"Tijd onbekend"}{row.ends_at?` – ${scheduleAgendaTime(row.ends_at,row.starts_at)}`:" · einde onbekend"}</span><span><strong>{row.title}</strong><span>{scheduleKindLabel(row.kind,kinds)} · {scheduleStatusLabel(row)}</span>{activityTitle(row)&&<span>Activiteit: {activityTitle(row)}</span>}<span>{personLabel(row)}{row.location?` · ${row.location}`:""}</span>{conflicts.has(row.id)&&<span className="event-agenda-conflict">Overlappende toewijzing</span>}</span></button>)}</section>)}</div>}
    {view!=="list" && hasTimed && days.length>0 && <>
    <p className="event-timegrid-hint">Tijden in België · Klik op een blok voor alle gegevens.</p>
    <div className="event-timegrid-scroll" ref={scroller} tabIndex={0} aria-label="Eventagenda met uren en dagen">
      <div className={`event-timegrid-columns event-timegrid-${view}`} style={{gridTemplateColumns:`repeat(${days.length}, minmax(190px, 1fr))`,minWidth:days.length*190}}>
        {days.map(date => <section className="event-timegrid-day" key={date.day} aria-label={date.day}>
          <h3>{dayLabel.format(new Date(`${date.day}T12:00:00Z`))}</h3>
          <div className="event-timegrid-hours" style={{ height: date.minutes }}>
            {date.ticks.map(tick => <div className="event-timegrid-hour" style={{ top: tick.minute }} key={tick.minute}><span>{tick.label}</span></div>)}
            <div className="event-timegrid-blocks">
              {date.segments.map(segment => <button type="button" className="event-timegrid-block" data-kind={segment.row.kind} data-status={segment.row.status} key={segment.row.id}
                style={{ "--agenda-color":scheduleKindColor(segment.row.kind), top: segment.start, height: Math.max(2, segment.end - segment.start), left: `${segment.lane * 100 / segment.lanes}%`, width: `${100 / segment.lanes}%` } as CSSProperties}
                aria-label={`${segment.row.title}, ${scheduleKindLabel(segment.row.kind,kinds)}, ${formatDateTime(segment.row.starts_at)} tot ${formatDateTime(segment.row.ends_at)}, ${personLabel(segment.row)}, ${scheduleStatusLabel(segment.row)}${conflicts.has(segment.row.id) ? ", overlappende toewijzing" : ""}`}
                title={`${segment.row.title} · ${scheduleAgendaTime(segment.row.starts_at)}–${scheduleAgendaTime(segment.row.ends_at, segment.row.starts_at)}`}
                onClick={() => setSelectedId(segment.row.id)}>
                <strong>{segment.row.title}</strong><span>{scheduleKindLabel(segment.row.kind,kinds)}{conflicts.has(segment.row.id) ? " · !" : ""}</span>
                <span>{segment.continuesBefore ? "← " : ""}{scheduleAgendaTime(segment.row.starts_at)}–{scheduleAgendaTime(segment.row.ends_at, segment.row.starts_at)}{segment.continuesAfter ? " →" : ""}</span>
                <span>{personLabel(segment.row)}</span>
              </button>)}
            </div>
          </div>
        </section>)}
      </div>
    </div></>}
    {view!=="list" && incomplete.length > 0 && <section className="event-timegrid-incomplete"><h3>Nog niet volledig ingepland</h3><p>Deze onderdelen missen een start- of eindtijd en staan daarom apart.</p>
      {incomplete.map(row => <button type="button" data-kind={row.kind} style={{"--agenda-color":scheduleKindColor(row.kind)} as CSSProperties} key={row.id} onClick={() => setSelectedId(row.id)}><strong>{row.title}</strong><span>{scheduleKindLabel(row.kind,kinds)} · {scheduleStatusLabel(row)} · {row.starts_at ? formatDateTime(row.starts_at) : "Tijd onbekend"}{row.starts_at ? " · einde onbekend" : ""}</span></button>)}
    </section>}
    {selected && <section className="event-timegrid-details" ref={details} tabIndex={-1} data-kind={selected.kind} style={{"--agenda-color":scheduleKindColor(selected.kind)} as CSSProperties} aria-label="Details van het agendaonderdeel">
      <div><h3>{selected.title}</h3><button type="button" aria-label="Details sluiten" onClick={() => setSelectedId(null)}><X size={16}/></button></div>
      <p>{scheduleKindLabel(selected.kind,kinds)} · {scheduleStatusLabel(selected)}</p>
      <p>{formatDateTime(selected.starts_at, "Start onbekend")} → {formatDateTime(selected.ends_at, "Einde onbekend")}</p>
      <p>{personLabel(selected)}{selected.location ? ` · ${selected.location}` : ""}</p>
      {conflicts.has(selected.id) && <p className="event-agenda-conflict">Deze persoon heeft een overlappende toewijzing.</p>}
      {selected.activity_id && activityTitle(selected) && <p>Activiteit: <Link href={`?tab=activiteiten#activiteit-${selected.activity_id}`}>{activityTitle(selected)}</Link></p>}
      {selected.notes && <p className="event-timegrid-notes">{selected.notes}</p>}
      {canEdit && !selected.slot_booking_id && <Link className="row-action" href={`?tab=planning&schema=${selected.id}`}>Bewerken</Link>}
    </section>}
  </div>;
}
