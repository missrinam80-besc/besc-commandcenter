import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { hasPermission } from "../src/lib/permissions.ts";
import { giveawaySources, giveawayStatuses, giveawayRemaining } from "../src/lib/event-giveaways.ts";
import { formatDateTime } from "../src/lib/format.ts";

async function render(role="member", failure="", selected?:string, received:number|null=null, distributed:number|null=null) {
  const row={id:"fixture-row",name:"TESTFIXTURE cadeau",quantity_planned:10,quantity_received:received,quantity_distributed:distributed,source:"supplied",provider:"TESTFIXTURE leverancier",responsible_person_id:null,status:"needed",notes:null};
  const supabase={from:(table:string)=>{
    const q:Record<string,unknown>={};for(const method of ["select","eq","is","neq","order"])q[method]=()=>q;
    q.then=(resolve:(value:unknown)=>unknown)=>Promise.resolve({data:table==="event_giveaways"?(failure==="items"?null:[row]):[],error:failure===(table==="event_giveaways"?"items":"assets")?{code:"fixture"}:null}).then(resolve);return q;
  }};
  const container=({children}:React.PropsWithChildren)=>React.createElement("section",null,children);
  const overrides:Record<string,unknown>={
    "next/link":{default:({children,...props}:React.PropsWithChildren<Record<string,unknown>>)=>React.createElement("a",props,children)},
    "@/lib/auth-context":{requireActiveMembership:async()=>({supabase,membership:{role,organization_id:"fixture-org"}})},
    "@/lib/permissions":{hasPermission},"@/lib/event-giveaways":{giveawaySources,giveawayStatuses,giveawayRemaining},"@/lib/format":{formatDateTime},
    "@/components/form-modal":{FormModal:container},"@/components/confirm-submit-button":{ConfirmSubmitButton:container},
    "@/components/event-giveaway-form":{EventGiveawayForm:()=>React.createElement("div",{"data-editor":"yes"})},
    "@/app/app/events/[id]/giveaway-actions":{deleteEventGiveaway:()=>undefined},
  };
  const require=createRequire(import.meta.url),compiled={exports:{} as {EventGiveawaysPanel:(props:unknown)=>Promise<React.ReactNode>}};
  runInNewContext(ts.transpileModule(readFileSync(new URL("../src/components/event-giveaways-panel.tsx",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,
    {module:compiled,exports:compiled.exports,require:(key:string)=>key in overrides?overrides[key]:require(key)});
  return renderToStaticMarkup(await compiled.exports.EventGiveawaysPanel({eventId:"fixture-event",people:[],peopleError:failure==="people",selected}));
}

test("een giveawayqueryfout toont geen lege of bewerkbare lijst",async()=>{const html=await render("member","items");assert.ok(html.includes("giveawaylijst kon niet worden geladen"));assert.ok(!html.includes("Nog geen giveaway-items"));assert.ok(!html.includes("Item toevoegen"));});
test("personenfout behoudt de lijst maar blokkeert de editor",async()=>{const html=await render("member","people","nieuw");assert.ok(html.includes("TESTFIXTURE cadeau"));assert.ok(html.includes("personenlijst kon niet"));assert.ok(!html.includes('data-editor="yes"'));});
test("beheerder bewerkt en vrijwilliger bekijkt de lijst zonder editor",async()=>{const allowed=await render("member","","fixture-row"),denied=await render("volunteer","","fixture-row");assert.ok(allowed.includes('data-editor="yes"'));assert.ok(denied.includes("TESTFIXTURE cadeau"));assert.ok(!denied.includes('data-editor="yes"'));});
test("onbekende aantallen en bevestigd nul verschillen; restant gebruikt alleen bekende tellingen",async()=>{const unknown=await render();assert.equal((unknown.match(/Onbekend/g)??[]).length,3);const known=await render("member","",undefined,8,3);assert.ok(known.includes("<dd>5</dd>"));const zero=await render("member","",undefined,0,0);assert.equal((zero.match(/<dd>0<\/dd>/g)??[]).length,3);});
