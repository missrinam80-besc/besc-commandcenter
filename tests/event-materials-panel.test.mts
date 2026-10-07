import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { hasPermission } from "../src/lib/permissions.ts";
import { materialSources, materialStatuses } from "../src/lib/event-materials.ts";
import { formatDateTime } from "../src/lib/format.ts";

async function render(role="member", failure="", selected?:string) {
  const row={id:"fixture-row",asset_id:null,name:"TESTFIXTURE statief",quantity:2,source:"borrowed",provider:"TESTFIXTURE leverancier",responsible_person_id:null,location:null,pickup_at:null,return_at:null,status:"needed",notes:null};
  const supabase={from:(table:string)=>{
    const q:Record<string,unknown>={};for(const method of ["select","eq","is","neq","order"])q[method]=()=>q;
    q.then=(resolve:(value:unknown)=>unknown)=>Promise.resolve({data:table==="event_materials"?(failure==="items"?null:[row]):[],error:failure===(table==="event_materials"?"items":"assets")?{code:"fixture"}:null}).then(resolve);return q;
  }};
  const container=({children}:React.PropsWithChildren)=>React.createElement("section",null,children);
  const overrides:Record<string,unknown>={
    "next/link":{default:({children,...props}:React.PropsWithChildren<Record<string,unknown>>)=>React.createElement("a",props,children)},
    "@/lib/auth-context":{requireActiveMembership:async()=>({supabase,membership:{role,organization_id:"fixture-org"}})},
    "@/lib/permissions":{hasPermission},"@/lib/event-materials":{materialSources,materialStatuses},"@/lib/format":{formatDateTime},
    "@/components/form-modal":{FormModal:container},"@/components/confirm-submit-button":{ConfirmSubmitButton:container},
    "@/components/event-material-form":{EventMaterialForm:()=>React.createElement("div",{"data-editor":"yes"})},
    "@/app/app/events/[id]/material-actions":{deleteEventMaterial:()=>undefined},
  };
  const require=createRequire(import.meta.url),compiled={exports:{} as {EventMaterialsPanel:(props:unknown)=>Promise<React.ReactNode>}};
  runInNewContext(ts.transpileModule(readFileSync(new URL("../src/components/event-materials-panel.tsx",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,
    {module:compiled,exports:compiled.exports,require:(key:string)=>key in overrides?overrides[key]:require(key)});
  return renderToStaticMarkup(await compiled.exports.EventMaterialsPanel({eventId:"fixture-event",people:[],selected}));
}

test("een mislukte materialenquery toont een fout, geen misleidende lege lijst",async()=>{
  const html=await render("member","items");assert.ok(html.includes("materialenlijst kon niet worden geladen"));assert.ok(!html.includes("Nog geen materialen"));assert.ok(!html.includes("Materiaal toevoegen"));
});
test("registerfouten behouden de zichtbare eventlijst maar blokkeren wijzigingen",async()=>{
  const html=await render("member","assets","nieuw");assert.ok(html.includes("2 × TESTFIXTURE statief"));assert.ok(html.includes("register of de personenlijst kon niet"));assert.ok(!html.includes('data-editor="yes"'));
});
test("leden met Events-bevoegdheid kunnen bewerken, gewone vrijwilligers alleen bekijken",async()=>{
  const allowed=await render("member","","fixture-row"),denied=await render("volunteer","","fixture-row");
  assert.ok(allowed.includes('data-editor="yes"'));assert.ok(denied.includes("2 × TESTFIXTURE statief"));assert.ok(!denied.includes('data-editor="yes"'));assert.ok(!denied.includes("Materiaal toevoegen"));
});
