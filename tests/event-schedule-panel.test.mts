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
import { scheduleKinds, scheduleStatuses, scheduleConflicts, scheduleAgendaDays, scheduleAgendaTime } from "../src/lib/event-schedule.ts";
import { formatDateTime } from "../src/lib/format.ts";

async function render(role="member", failure="", selected?:string, kind?:string, timed=false) {
  const row={id:"fixture-row",title:"TESTFIXTURE stream",kind:"stream",status:"draft",starts_at:timed?"2026-10-08T00:00:00Z":null,ends_at:timed?"2026-10-08T02:00:00Z":null,person_id:null,location:null,notes:null};
  const supabase={from:(table:string)=>{
    const q:Record<string,unknown>={};for(const method of ["select","eq","is","neq","order"])q[method]=()=>q;
    q.then=(resolve:(value:unknown)=>unknown)=>Promise.resolve({data:table==="event_schedule_items"?(failure==="items"?null:[row]):[],error:failure===(table==="event_schedule_items"?"items":"assets")?{code:"fixture"}:null}).then(resolve);return q;
  }};
  const container=({children}:React.PropsWithChildren)=>React.createElement("section",null,children);
  const overrides:Record<string,unknown>={
    "next/link":{default:({children,scroll,...props}:React.PropsWithChildren<Record<string,unknown>>)=>{void scroll;return React.createElement("a",props,children);}},
    "@/lib/event-timegrid":timegridHelpers,
    "@/lib/auth-context":{requireActiveMembership:async()=>({supabase,membership:{role,organization_id:"fixture-org"}})},
    "@/lib/permissions":{hasPermission},"@/lib/event-schedule":{scheduleKinds,scheduleStatuses,scheduleConflicts,scheduleAgendaDays,scheduleAgendaTime},"@/lib/format":{formatDateTime},
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
