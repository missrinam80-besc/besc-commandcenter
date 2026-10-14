import {loadEventRows} from "../src/lib/event-slot-rows.ts";
import * as rangeHelpers from "../src/lib/event-agenda-range.ts";
import * as timegridHelpers from "../src/lib/event-timegrid.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { hasPermission } from "../src/lib/permissions.ts";
import { scheduleStatusLabel,scheduleKinds, scheduleKindColor, scheduleKindLabel, scheduleStatuses, scheduleConflicts, scheduleAgendaDays, scheduleAgendaTime } from "../src/lib/event-schedule.ts";
import { formatDateTime } from "../src/lib/format.ts";

async function render(role="member", failure="", selected?:string, kind?:string, timed=false,rowKind="stream") {
  const row={id:"fixture-row",title:"TESTFIXTURE stream",kind:rowKind,status:"draft",starts_at:timed?"2026-10-08T00:00:00Z":null,ends_at:timed?"2026-10-08T02:00:00Z":null,person_id:null,location:null,notes:null};
  const supabase={from:(table:string)=>{
    const q:Record<string,unknown>={};for(const method of ["select","eq","is","neq","order","range"])q[method]=()=>q;
    q.then=(resolve:(value:unknown)=>unknown)=>Promise.resolve({data:table==="event_schedule_items"?(failure==="items"?null:[row]):[],error:failure===(table==="event_schedule_items"?"items":"activities")?{code:"fixture"}:null}).then(resolve);return q;
  }};
  const container=({children}:React.PropsWithChildren)=>React.createElement("section",null,children);
  const overrides:Record<string,unknown>={
    "@/components/event-agenda-export":{EventAgendaExport:()=>React.createElement("button",{"data-export":"yes"},"Afdrukken / PDF")},
    "@/lib/event-slot-rows":{loadEventRows},
    "next/link":{default:({children,scroll,...props}:React.PropsWithChildren<Record<string,unknown>>)=>{void scroll;return React.createElement("a",props,children);}},
    "@/lib/event-timegrid":timegridHelpers,"@/lib/event-agenda-range":rangeHelpers,
    "@/lib/auth-context":{requireActiveMembership:async()=>({supabase,membership:{role,organization_id:"fixture-org"}})},
    "@/lib/permissions":{hasPermission},"@/lib/event-schedule":{scheduleStatusLabel,scheduleKinds,scheduleKindColor,scheduleKindLabel,scheduleStatuses,scheduleConflicts,scheduleAgendaDays,scheduleAgendaTime},"@/lib/format":{formatDateTime},
    "@/lib/dossier-choices-server":{loadManagedChoices:async()=>{if(failure==="kinds")throw Error("fixture failure");return Object.entries({...scheduleKinds,custom_kind:"TESTFIXTURE nieuwe soort",stream:"TESTFIXTURE hernoemde stream"}).map(([value,label])=>({set_key:"event_schedule_items.kind",value,label}));}},
    "@/components/form-modal":{FormModal:container},"@/components/confirm-submit-button":{ConfirmSubmitButton:container},
    "@/components/event-schedule-form":{EventScheduleForm:()=>React.createElement("div",{"data-editor":"yes"})},
    "@/app/app/events/[id]/schedule-actions":{deleteEventSchedule:()=>undefined},
  };
  const require=createRequire(import.meta.url),compiled={exports:{} as {EventSchedulePanel:(props:unknown)=>Promise<React.ReactNode>}};
  const client={exports:{} as Record<string,unknown>};
  runInNewContext(ts.transpileModule(readFileSync(new URL("../src/components/event-timegrid.tsx",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module:client,exports:client.exports,require:(key:string)=>key in overrides?overrides[key]:require(key)});
  overrides["@/components/event-timegrid"]=client.exports;
  runInNewContext(ts.transpileModule(readFileSync(new URL("../src/components/event-schedule-panel.tsx",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,
    {module:compiled,exports:compiled.exports,require:(key:string)=>key in overrides?overrides[key]:require(key)});
  return renderToStaticMarkup(await compiled.exports.EventSchedulePanel({eventId:"fixture-event",people:[],peopleError:failure==="people",selected,kind}));
}

test("schemaqueryfout toont geen leeg of bewerkbaar schema",async()=>{const html=await render("member","items");assert.ok(html.includes("schema kon niet worden geladen"));assert.ok(!html.includes("Nog geen schema"));assert.ok(!html.includes("Onderdeel toevoegen"));});
test("personenfout behoudt de lijst maar blokkeert de editor",async()=>{const html=await render("member","people","nieuw");assert.ok(html.includes("TESTFIXTURE stream"));assert.ok(html.includes("personenlijst kon niet"));assert.ok(!html.includes('data-editor="yes"'));});
test("beheerder bewerkt, vrijwilliger bekijkt en filters beperken de weergave",async()=>{const allowed=await render("member","","fixture-row"),denied=await render("volunteer","","fixture-row");assert.ok(allowed.includes('data-editor="yes"'));assert.ok(denied.includes("TESTFIXTURE stream"));assert.ok(!denied.includes('data-editor="yes"'));const filtered=await render("member","",undefined,"shift");assert.ok(!filtered.includes("TESTFIXTURE stream"));assert.ok(filtered.includes("Geen onderdelen voor dit filter"));});

test("agenda toont onbekende tijden apart en behoudt tekstuele type- en statuslabels",async()=>{const html=await render();assert.ok(html.includes("Eventagenda"));assert.ok(html.includes("Nog niet volledig ingepland"));assert.ok(html.includes("Tijd onbekend"));assert.ok(html.includes('data-kind="stream"'));assert.ok(html.includes("Voorstel"));assert.ok(html.includes("TESTFIXTURE stream"));});

test("tijdrooster rendert uren, dagkolommen en proportionele blokken met typekleur",async()=>{const html=await render("member","",undefined,undefined,true);assert.ok(html.includes("event-timegrid-week"));assert.ok(html.includes("00:00"));assert.ok(html.includes("event-timegrid-block"));assert.ok(html.includes("height:120px"));assert.ok(html.includes('data-kind="stream"'));assert.ok(html.includes("Week"));assert.ok(html.includes("Dag"));});
test("Nieuwe en hernoemde soorten werken in filters, bloklabels en kleuren",async()=>{
 const html=await render("member","",undefined,"custom_kind",true,"custom_kind");
 assert.match(html,/schema_type=custom_kind/);assert.match(html,/TESTFIXTURE nieuwe soort/);assert.match(html,/data-kind="custom_kind"/);
 assert.ok(html.includes(`--agenda-color:${scheduleKindColor("custom_kind")}`));assert.doesNotMatch(html,/undefined/);
 const renamed=await render();assert.match(renamed,/TESTFIXTURE hernoemde stream/);assert.ok(renamed.includes("--agenda-color:#9461d4"));
});
test("Een fout in de soortenlijst bewaart de agenda maar blokkeert bewerken",async()=>{
 const html=await render("member","kinds","nieuw");assert.match(html,/soorten agendaonderdelen kunnen niet/);assert.match(html,/TESTFIXTURE stream/);assert.doesNotMatch(html,/data-editor="yes"|Onderdeel toevoegen/);
});

test("afdrukken is beschikbaar voor kijkers maar niet bij onvolledige brongegevens",async()=>{
 assert.match(await render("volunteer"),/data-export="yes"/);
 for(const failure of ["items","people","kinds","activities"])assert.doesNotMatch(await render("member",failure),/data-export="yes"/);
});
