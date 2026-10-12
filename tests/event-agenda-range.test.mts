import assert from "node:assert/strict";
import test from "node:test";
import {relevantAgendaIntervals,visibleAgendaDays,nextRelevantAgendaDay} from "../src/lib/event-agenda-range.ts";
import type {EventScheduleItem} from "../src/lib/event-schedule.ts";
const row=(starts_at:string|null,ends_at:string|null):EventScheduleItem=>({id:"fixture",title:"TESTFIXTURE",kind:"program",status:"draft",starts_at,ends_at,person_id:null,location:null,notes:null});
test("eventdagen blijven inclusief; lege dagen buiten event en planning vervallen",()=>{
 const spans=relevantAgendaIntervals([],{start_date:"2026-10-09",end_date:"2026-10-11"});
 assert.deepEqual(visibleAgendaDays("2026-10-10","week",spans),["2026-10-09","2026-10-10","2026-10-11"]);
});
test("opbouw en nachtshifts buiten de eventperiode blijven zichtbaar",()=>{
 const spans=relevantAgendaIntervals([row("2026-10-07T21:00Z","2026-10-08T01:00Z")],{start_date:"2026-10-10",end_date:"2026-10-11"});
 assert.deepEqual(visibleAgendaDays("2026-10-10","week",spans),["2026-10-07","2026-10-08","2026-10-10","2026-10-11"]);
});
test("middernachteinde opent geen lege volgende dag, ook bij eventtimestamps",()=>{
 assert.deepEqual(relevantAgendaIntervals([row("2026-10-08T20:00Z","2026-10-08T22:00Z")]),[{start:"2026-10-08",end:"2026-10-08"}]);
 assert.deepEqual(relevantAgendaIntervals([],{start_at:"2026-10-08T20:00Z",end_at:"2026-10-08T22:00Z"}),[{start:"2026-10-08",end:"2026-10-08"}]);
});
test("navigatie slaat lege dagen en weken over en stopt aan grenzen",()=>{
 const spans=[{start:"2026-10-08",end:"2026-10-09"},{start:"2026-11-05",end:"2026-11-05"}];
 assert.equal(nextRelevantAgendaDay("2026-10-09",1,"day",spans),"2026-11-05");
 assert.equal(nextRelevantAgendaDay("2026-10-08",1,"week",spans),"2026-11-05");
 assert.equal(nextRelevantAgendaDay("2026-11-05",-1,"week",spans),"2026-10-09");
 assert.equal(nextRelevantAgendaDay("2026-10-08",-1,"day",spans),null);
 assert.equal(nextRelevantAgendaDay("2026-11-05",1,"week",spans),null);
});
test("onbekende tijden en ongeldige dagen maken geen fictieve kalenderdagen",()=>{
 assert.deepEqual(relevantAgendaIntervals([row(null,null)],{start_date:"invalid"}),[]);
 assert.deepEqual(relevantAgendaIntervals([],{start_date:"2026-02-30"}),[]);
 assert.deepEqual(relevantAgendaIntervals([row("2026-10-08T08:00Z",null)]),[{start:"2026-10-08",end:"2026-10-08"}]);
});
test("tijdwissels en lange eventperiodes blijven begrensd",()=>{
 assert.deepEqual(relevantAgendaIntervals([row("2026-10-24T23:30Z","2026-10-25T03:00Z")]),[{start:"2026-10-25",end:"2026-10-25"}]);
 const spans=relevantAgendaIntervals([],{start_date:"2020-01-01",end_date:"2099-12-31"});assert.equal(spans.length,1);assert.equal(visibleAgendaDays("2026-10-08","week",spans).length,7);
});
