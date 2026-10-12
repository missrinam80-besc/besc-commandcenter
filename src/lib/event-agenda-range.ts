import {scheduleDayKey,type EventScheduleItem} from "./event-schedule.ts";
import {calendarWeekStart,shiftCalendarDay} from "./event-timegrid.ts";
export type EventAgendaPeriod={start_date?:string|null;end_date?:string|null;start_at?:string|null;end_at?:string|null};
export type AgendaInterval={start:string;end:string};
// Keep intervals instead of expanding long events into unbounded day arrays.
export function relevantAgendaIntervals(rows:EventScheduleItem[],event:EventAgendaPeriod={}):AgendaInterval[]{
 const spans:AgendaInterval[]=[];
 const date=(value:string|null|undefined)=>value&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(`${value}T12:00:00Z`))&&new Date(`${value}T12:00:00Z`).toISOString().slice(0,10)===value?value:null;
 const stamp=(value:string|null|undefined)=>value&&Number.isFinite(Date.parse(value))?scheduleDayKey(value):null;
 const eventStart=stamp(event.start_at)??date(event.start_date),eventEnd=event.end_at&&Number.isFinite(Date.parse(event.end_at))?scheduleDayKey(new Date(Math.max(event.start_at&&Number.isFinite(Date.parse(event.start_at))?Date.parse(event.start_at):Date.parse(event.end_at)-1,Date.parse(event.end_at)-1)).toISOString()):date(event.end_date);
 if(eventStart||eventEnd)spans.push({start:eventStart??eventEnd!,end:eventEnd&&eventEnd>=(eventStart??eventEnd)?eventEnd:eventStart??eventEnd!});
 for(const row of rows){if(!row.starts_at||!Number.isFinite(Date.parse(row.starts_at)))continue;const start=scheduleDayKey(row.starts_at);const end=row.ends_at&&Date.parse(row.ends_at)>Date.parse(row.starts_at)?scheduleDayKey(new Date(Date.parse(row.ends_at)-1).toISOString()):start;spans.push({start,end});}
 spans.sort((a,b)=>a.start.localeCompare(b.start)||a.end.localeCompare(b.end));const merged:AgendaInterval[]=[];
 for(const span of spans){const previous=merged.at(-1);if(previous&&span.start<=shiftCalendarDay(previous.end,1)){if(span.end>previous.end)previous.end=span.end;}else merged.push({...span});}return merged;
}
export function isRelevantAgendaDay(day:string,intervals:AgendaInterval[]){return intervals.some(span=>day>=span.start&&day<=span.end);}
export function visibleAgendaDays(day:string,view:"day"|"week",intervals:AgendaInterval[]){const start=view==="week"?calendarWeekStart(day):day;return Array.from({length:view==="week"?7:1},(_,n)=>shiftCalendarDay(start,n)).filter(candidate=>isRelevantAgendaDay(candidate,intervals));}
export function nextRelevantAgendaDay(day:string,direction:1|-1,view:"day"|"week",intervals:AgendaInterval[]):string|null{
 const edge=view==="week"?shiftCalendarDay(calendarWeekStart(day),direction===1?7:-1):shiftCalendarDay(day,direction);
 if(direction===1){const span=intervals.find(s=>s.end>=edge);return span?(span.start>edge?span.start:edge):null;}
 const span=[...intervals].reverse().find(s=>s.start<=edge);return span?(span.end<edge?span.end:edge):null;
}
