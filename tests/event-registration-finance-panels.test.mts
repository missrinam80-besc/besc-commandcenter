import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { hasPermission } from "../src/lib/permissions.ts";
import { eventFinancialTotals, financialStatusLabels } from "../src/lib/event-finance.ts";
import { registrationModes, registrationStatuses, registrationCounts } from "../src/lib/event-registrations.ts";

const eventId="10000000-0000-4000-8000-000000000001";
async function render(panel:string,role:string,rows:Record<string,unknown>,selected?:string,errorTable?:string) {
 const queries:string[]=[];
 const supabase={from:(table:string)=>{
  queries.push(table);const q:Record<string,unknown>={};for(const key of ["select","eq","is","order"])q[key]=()=>q;
  const result={data:rows[table]??(table==="event_registration_settings"?null:[]),error:table===errorTable?{message:"failure"}:null};
  q.maybeSingle=async()=>result;q.then=(resolve:(v:unknown)=>unknown)=>Promise.resolve(result).then(resolve);return q;
 }};
 const dependencies:Record<string,unknown>={
  "next/link":{default:({children,...props}:React.PropsWithChildren)=>React.createElement("a",props,children)},
  "@/lib/auth-context":{requireActiveMembership:async()=>({supabase,membership:{role,finance_role:"none",organization_id:"org"}})},
  "@/lib/permissions":{hasPermission},"@/lib/format":{formatCurrency:(n:number)=>`EUR ${n}`},
  "@/lib/event-finance":{eventFinancialTotals,financialStatusLabels},
  "@/lib/event-registrations":{registrationModes,registrationStatuses,registrationCounts},
  "@/components/form-modal":{FormModal:({children}:React.PropsWithChildren)=>React.createElement("div",null,children)},
  "@/components/confirm-submit-button":{ConfirmSubmitButton:({children}:React.PropsWithChildren)=>React.createElement("button",null,children)},
  "@/components/finance-forms":Object.fromEntries(["BudgetForm","ExpenseForm","IncomeForm"].map(name=>[name,({record,eventContext}: {record:Record<string,unknown>;eventContext?:string})=>React.createElement("div",{"data-form":name,"data-event":record.event_id,"data-return":eventContext})])),
  "@/app/app/events/[id]/registration-actions":{saveRegistrationSettings:()=>{},saveEventRegistration:()=>{},deleteEventRegistration:()=>{}},
 };
 const require=createRequire(import.meta.url),compiled={exports:{} as Record<string,(props:unknown)=>Promise<React.ReactNode>>};
 runInNewContext(ts.transpileModule(readFileSync(`src/components/${panel}.tsx`,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module:compiled,exports:compiled.exports,require:(name:string)=>name in dependencies?dependencies[name]:require(name)});
 const fn=panel==="event-finance-panel"?"EventFinancePanel":"EventRegistrationsPanel";
 return {queries,html:renderToStaticMarkup(await compiled.exports[fn]({eventId,eventTitle:"TESTFIXTURE event",legacyUrl:"https://example.com/eventbrite",selected}))};
}
test("financiële inzage, formulieren en fouten worden niet met lege gegevens verward",async()=>{
 const denied=await render("event-finance-panel","volunteer",{});
 assert.equal(denied.queries.length,0);assert.match(denied.html,/Eigen kost indienen/);assert.doesNotMatch(denied.html,/Budget toevoegen|EUR/);
 const failed=await render("event-finance-panel","admin",{},undefined,"expenses");
 assert.match(failed.html,/konden niet worden geladen/);assert.doesNotMatch(failed.html,/EUR|Nog geen financiële/);
 for(const selected of ["budget","kost","inkomst"]){const f=await render("event-finance-panel","admin",{},selected);assert.match(f.html,new RegExp(`data-event="${eventId}"`));assert.match(f.html,new RegExp(`data-return="${eventId}"`));}
 const board=await render("event-finance-panel","board",{},"budget");assert.doesNotMatch(board.html,/Budget toevoegen|Inkomst toevoegen|data-form="BudgetForm"/);
});
test("een oude Eventbrite-link kiest geen werkwijze; deelnemers blijven afgeschermd en bewaard",async()=>{
 const blank=await render("event-registrations-panel","admin",{});assert.match(blank.html,/Werkwijze nog niet gekozen/);assert.match(blank.html,/Bestaande Eventbrite-link/);
 const settings={mode:"none",capacity:1,notes:null,external_url:null};
 const data={event_registration_settings:settings,event_registrations:[{id:"r",name:"TESTFIXTURE privénaam",quantity:2,status:"registered",notes:"afspraak"}]};
 const historical=await render("event-registrations-panel","admin",data);assert.match(historical.html,/TESTFIXTURE privénaam/);assert.match(historical.html,/blijven bewaard/);assert.doesNotMatch(historical.html,/Deelnemer toevoegen/);
 const member=await render("event-registrations-panel","volunteer",{...data,event_registration_settings:{...settings,mode:"internal"}});assert.ok(!member.queries.includes("event_registrations"));assert.doesNotMatch(member.html,/privénaam|Instellingen|plaatsen ingeschreven/);
 const full=await render("event-registrations-panel","admin",{...data,event_registration_settings:{...settings,mode:"internal"}});assert.match(full.html,/overschrijden/);assert.match(full.html,/Deelnemer toevoegen/);
 const failure=await render("event-registrations-panel","admin",{},undefined,"event_registration_settings");assert.match(failure.html,/konden niet worden geladen/);assert.doesNotMatch(failure.html,/Werkwijze nog niet gekozen|Instellingen/);
});
