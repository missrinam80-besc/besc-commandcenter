import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { z } from "zod";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsx from "react/jsx-runtime";
import { canViewInternalPath } from "../src/lib/route-permissions.ts";
import { hasPermission } from "../src/lib/permissions.ts";

test("indieningsroute en alleen-lezen kostdossier zijn bereikbaar zonder financiële rol", () => {
  for (const role of ["member", "volunteer"]) {
    const membership = {role,finance_role:"none"};
    assert.equal(canViewInternalPath("/app/financien",membership,new URLSearchParams("nieuw=kost")),true);
    assert.equal(canViewInternalPath("/app/financien/kosten/own",membership),true);
    for (const path of ["/app/financien","/app/financien/budgetten/1","/app/financien/inkomsten/1","/app/financien/instellingen","/app/financien/rapportage"]) assert.equal(canViewInternalPath(path,membership),false,path);
    assert.equal(canViewInternalPath("/app/financien",membership,new URLSearchParams("nieuw=budget")),false);
    assert.equal(canViewInternalPath("/app/financien/kosten/own",membership,new URLSearchParams("bewerken=1")),false);
  }
});

function harness(role:string) {
  const queried:string[]=[];
  const membership={role,finance_role:"none",organization_id:"org"};
  const from=(table:string)=>{
    queried.push(table);
    const filters:Record<string,unknown>={};
    const query={select:()=>query,eq:(key:string,value:unknown)=>{filters[key]=value;return query;},is:()=>query,order:()=>query,
      maybeSingle:async()=>({data:filters.submitted_by==="actor"&&filters.id==="own"?{id:"own",title:"Own fixture",amount:0,status:"requested",submitted_by:"actor"}:null}),
      then:(resolve:(v:unknown)=>unknown)=>Promise.resolve({data:[]}).then(resolve),
    };
    return query;
  };
  const passthrough=({children}: {children?:React.ReactNode})=>React.createElement("div",null,children);
  const dependencies:Record<string,unknown>={
    "react/jsx-runtime":jsx,
    "zod":{z},
    "next/link":{__esModule:true,default:({children,href}: {children?:React.ReactNode;href:string})=>React.createElement("a",{href},children)},
    "next/navigation":{notFound:()=>{throw new Error("NOT_FOUND");}},
    "lucide-react":{ExternalLink:()=>null},
    "@/lib/auth-context":{requireActiveMembership:async()=>({supabase:{from},membership,user:{id:"actor"}})},
    "@/lib/permissions":{hasPermission},
    "@/components/app-shell":{AppShell:passthrough},
    "@/components/finance-navigation":{FinanceNavigation:()=>null},
    "@/components/approval-panel":{ApprovalPanel:()=>null},
    "@/components/finance-forms":{BudgetForm:()=>null,IncomeForm:()=>null,ExpenseForm:()=>React.createElement("form",null,"Submission form")},
    "@/app/app/financien/actions":{updateExpenseWorkflow:()=>{}},
  };
  function load(path:string) {
    const exported:{default?:(props:unknown)=>Promise<React.ReactNode>}={};
    const code=ts.transpileModule(readFileSync(path,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
    new Function("require","exports",code)((name:string)=>{assert.ok(name in dependencies,name);return dependencies[name];},exported);
    return exported.default!;
  }
  return {load,queried};
}

test("het echte indieningsscherm vraagt geen financiële overzichtsgegevens op",async()=>{
  for (const role of ["member","volunteer"]) {
    const h=harness(role);
    const result=await h.load("src/app/app/financien/page.tsx")({searchParams:Promise.resolve({nieuw:"kost"})});
    const html=renderToStaticMarkup(result);
    assert.match(html,/Kost indienen/);
    assert.match(html,/Submission form/);
    assert.doesNotMatch(html,/Gepland budget|Actueel resultaat|Nieuw budget|Nieuwe inkomst/);
    for (const table of ["expenses","budget_envelopes","income_entries"]) assert.ok(!h.queried.includes(table),table);
  }
});

test("het echte kostdossier filtert op de indiener en weigert andermans kost",async()=>{
  for (const role of ["member","volunteer"]) {
    const h=harness(role);
    const page=h.load("src/app/app/financien/kosten/[id]/page.tsx");
    await assert.rejects(page({params:Promise.resolve({id:"other"}),searchParams:Promise.resolve({})}),/NOT_FOUND/);
    const html=renderToStaticMarkup(await page({params:Promise.resolve({id:"own"}),searchParams:Promise.resolve({bewerken:"1"})}));
    assert.match(html,/Own fixture/);
    assert.match(html,/Nieuwe kost indienen/);
    assert.doesNotMatch(html,/Submission form|Kost bewerken|Markeer betaald/);
  }
});
