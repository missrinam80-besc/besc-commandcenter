import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
function load(path: string, overrides: Record<string, unknown> = {}) {
  const compiled = { exports: {} as Record<string, unknown> };
  const code = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(code, { module: compiled, exports: compiled.exports, FormData, Date, URLSearchParams,
    require: (key: string) => key in overrides ? overrides[key] : require(key) });
  return compiled.exports;
}
import { hasPermission } from "../src/lib/permissions.ts";
const org="fixture-org";
for(const roleData of [
 {name:"actieve eigen rol",organization_id:org,deleted_at:null,expected:true},
 {name:"verwijderde rol",organization_id:org,deleted_at:"2026-10-06",expected:false},
 {name:"rol uit andere organisatie",organization_id:"foreign-org",deleted_at:null,expected:false},
])test(`Event-bevoegdheid uit ${roleData.name}`,async()=>{
 const row={organization_id:org,role:"volunteer",finance_role:"none",status:"active",organization_access_roles:{...roleData,capabilities:["manageEvents"]}};
 const query={select:()=>query,eq:()=>query,limit:()=>query,maybeSingle:async()=>({data:row,error:null})};
 const client={auth:{getUser:async()=>({data:{user:{id:"fixture-user"}}})},from:()=>query};
 const auth=load("src/lib/auth-context.ts",{
  "next/navigation":{redirect:(url:string)=>{throw Error(url);}}, "react":{cache:(fn:unknown)=>fn},
  "@/lib/permissions":{hasPermission}, "@/lib/supabase/server":{createClient:async()=>client},
 });
 const run=auth.requirePermission as(cap:string)=>Promise<unknown>;
 if(roleData.expected)await run("manageEvents");else await assert.rejects(run("manageEvents"),/geen-toegang/);
});

for(const role of ["member","volunteer"])test(`Event-scherm bewaakt bewerklink en rechtstreeks geopende editor voor ${role}`,async()=>{
 const source=readFileSync(new URL("../src/app/app/events/[id]/page.tsx",import.meta.url),"utf8");
 const passthrough=({children}:{children?:React.ReactNode})=>React.createElement("div",null,children);
 const noop=()=>null;
 const overrides:Record<string,unknown>={};
 for(const match of source.matchAll(/import \{([^}]+)\} from "([^"]+)"/g)){
  if(match[2]==="lucide-react")continue;
  overrides[match[2]]=Object.fromEntries(match[1].split(",").map(name=>[name.trim(),noop]));
 }
 overrides["next/link"]={default:({href,children}:{href:string;children?:React.ReactNode})=>React.createElement("a",{href},children)};
 overrides["@/components/app-shell"]={AppShell:passthrough};
 overrides["@/components/form-modal"]={FormModal:passthrough};
 overrides["@/components/event-form"]={EventForm:()=>React.createElement("div",{"data-testid":"event-editor"}),eventStatuses:{idea:"Idee"},eventTypes:{community:"Community"}};
 overrides["@/lib/permissions"]={hasPermission};
 overrides["@/lib/dossier-relations"]={loadDossierConnections:async()=>({}),loadRelationOptions:async()=>[]};
 const supabase={from:(table:string)=>{
  let single=false;
  const q:Record<string,unknown>={};
  for(const method of ["select","eq","is","order","limit","neq"])q[method]=()=>q;
  q.maybeSingle=()=>{single=true;return q;};
  q.then=(resolve:(v:unknown)=>unknown)=>Promise.resolve({data:table==="events"?{id:"fixture-event",title:"TESTFIXTURE",status:"idea",event_type:"community",updated_at:"2026-10-06"}:single?null:[]}).then(resolve);
  return q;
 }};
 overrides["@/lib/auth-context"]={requireActiveMembership:async()=>({supabase,membership:{organization_id:org,role,finance_role:"none"}})};
 const page=load("src/app/app/events/[id]/page.tsx",overrides).default as(props:unknown)=>Promise<React.ReactNode>;
 const html=renderToStaticMarkup(await page({params:Promise.resolve({id:"fixture-event"}),searchParams:Promise.resolve({bewerken:"1"})}));
 assert.equal(html.includes('href="?bewerken=1"'),role==="member");
 assert.equal(html.includes('data-testid="event-editor"'),role==="member");
});
