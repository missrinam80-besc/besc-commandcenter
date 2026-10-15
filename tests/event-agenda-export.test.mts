import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {editorLoader} from "./helpers/editor-loader.mts";
import type {EventScheduleItem} from "../src/lib/event-schedule.ts";
const load=editorLoader({"./event-agenda-export.css":{}});
const Document=load("src/components/event-agenda-export.tsx").EventAgendaPrintDocument as React.ComponentType<Record<string,unknown>>;
const row=(id:string,kind:string,starts_at:string|null,ends_at:string|null):EventScheduleItem=>({id,title:`TESTFIXTURE ${id}`,kind,starts_at,ends_at,status:"confirmed",person_id:"person",activity_id:"activity",location:"Zaal A",notes:"Uitleg\nTweede regel"});
const props={eventTitle:"TESTFIXTURE event",rows:[row("night","shift","2026-10-14T21:00Z","2026-10-15T01:00Z"),row("early","program","2026-10-14T08:00Z","2026-10-14T09:00Z"),row("later","custom","2026-10-18T10:00Z",null),row("untimed","program",null,null)],kinds:{program:"Programma",shift:"Crew",custom:"Eigen categorie"},people:[{id:"person",label:"TESTFIXTURE persoon"}],activities:[{id:"activity",title:"TESTFIXTURE activiteit"}]};
const render=(extra:Record<string,unknown>={})=>renderToStaticMarkup(React.createElement(Document,{...props,...extra}));
test("lijstexport filtert categorie, bewaart alle dagen en gebruikt actuele labels",()=>{
 const html=render({category:"program"});assert.match(html,/TESTFIXTURE early/);assert.match(html,/TESTFIXTURE untimed/);assert.doesNotMatch(html,/TESTFIXTURE night|TESTFIXTURE later/);
 const custom=render({category:"custom"});assert.match(custom,/Eigen categorie/);assert.match(custom,/18 oktober 2026/);assert.match(custom,/Einde onbekend/);
});
test("agenda en lijst bewaren nachturen, ongetimede items, uitleg, personen en activiteit",()=>{
 for(const view of ["agenda","list"]){const html=render({view});assert.match(html,/15 okt 2026/);assert.match(html,/23:00/);assert.match(html,/03:00/);assert.match(html,/Nog niet ingepland/);assert.match(html,/Start onbekend/);assert.match(html,/TESTFIXTURE activiteit/);assert.match(html,/TESTFIXTURE persoon/);assert.match(html,/Zaal A/);assert.match(html,/Uitleg/);assert.ok(html.indexOf("TESTFIXTURE early")<html.indexOf("TESTFIXTURE night"));}
});
test("lange tekst blijft volledig en HTML wordt als tekst behandeld",()=>{
 const title="<script>niet uitvoeren</script> "+"Lange titel ".repeat(100);const html=render({rows:[{...props.rows[0],title,notes:"<img src=x>"}]});assert.match(html,/&lt;script&gt;/);assert.match(html,/&lt;img/);assert.ok(html.includes("Lange titel ".repeat(100).trim()));assert.doesNotMatch(html,/<script>|<img/);
});
test("lege categoriekeuze toont een expliciete lege staat",()=>{assert.match(render({category:"missing"}),/Geen agendaonderdelen voor deze selectie/);});


test("geannuleerde boekingen verdwijnen uit lijst en PDF zonder gewone vervallen onderdelen te verbergen",()=>{
 const rows=[{...props.rows[0],id:"cancelled-booking",title:"VERBORGEN BOEKING",status:"cancelled",slot_booking_id:"booking"},{...props.rows[0],id:"pending-booking",title:"VOORLOPIGE BOEKING",status:"draft",slot_booking_id:"pending"},{...props.rows[0],id:"regular",title:"GEWOON VERVALLEN",status:"cancelled"}];
 for(const view of ["agenda","list"]){const html=render({rows,view});assert.doesNotMatch(html,/VERBORGEN BOEKING/);assert.match(html,/VOORLOPIGE BOEKING/);assert.match(html,/GEWOON VERVALLEN/);assert.match(html,/2 onderdelen/);}
});
