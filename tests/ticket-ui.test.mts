import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as labels from "../src/lib/tickets.ts";
const require=createRequire(import.meta.url),id="20000000-0000-4000-8000-000000000001",org="10000000-0000-4000-8000-000000000001";
function load(path:string,dependencies:Record<string,unknown>){
 const compiled={exports:{} as {default:(props:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string>>})=>Promise<React.ReactNode>}};
 runInNewContext(ts.transpileModule(readFileSync(path,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module:compiled,exports:compiled.exports,require:(name:string)=>name in dependencies?dependencies[name]:require(name)});
 return compiled.exports;
}
function fixture(denied=false){
 const seen:unknown[][]=[];
 const ticket={id,subject:"<script>TESTFIXTURE</script>",status:"open",link_status:"linked",version:3,requester_discord_id:"111111111111111111",guild_id:"1067893182387474432",thread_id:"222222222222222222",assigned_to:null};
 const db={from(table:string){const q:Record<string,unknown>={};for(const key of ["select","eq","order","range","limit","is","neq","in"])q[key]=(...args:unknown[])=>{seen.push([table,key,...args]);return q;};
  q.maybeSingle=async()=>({data:ticket});q.then=(fn:(v:unknown)=>unknown)=>Promise.resolve({data:table==="support_ticket_messages"?[{id:"m",direction:"internal",content:"<b>PRIVATE NOTE</b>",created_at:"2026-10-11"},{id:"staff",direction:"staff",content:"External fixture",created_at:"2026-10-11"}]:table==="support_ticket_deliveries"?[{id:"d",message_id:"staff",state:"uncertain",kind:"send_message",last_error:"outcome_unknown"}]:[ticket],count:2}).then(fn);return q;
 },async rpc(...args:unknown[]){seen.push(["rpc",...args]);return{data:[]};}};
 const dependencies={"@/lib/auth-context":{async requirePermission(capability:string){assert.equal(capability,"manageTickets");if(denied)throw Error("denied");return{supabase:db,membership:{organization_id:org}};}},
  "@/components/app-shell":{AppShell:({children}:{children:React.ReactNode})=>React.createElement("main",null,children)},
  "@/lib/tickets":labels,"../actions":{updateTicket:()=>{}},"./actions":{retryTicketCleanup:()=>{}},
  "next/link":{default:({children,...props}:{children:React.ReactNode})=>React.createElement("a",props,children)},"next/navigation":{notFound:()=>{throw Error("not_found");}}};
 return{seen,dependencies};
}
test("Rendered ticket UI distinguishes internal note, explicit external send and uncertain delivery",async()=>{
 const f=fixture();const page=load("src/app/app/tickets/[id]/page.tsx",f.dependencies);
 const html=renderToStaticMarkup(await page.default({params:Promise.resolve({id}),searchParams:Promise.resolve({fout:"version_conflict"})}));
 for(const text of ["Interne notitie","Versturen naar Discord","Uitkomst controleren","Herstel laten controleren","intussen gewijzigd","Bijlagen"])assert.ok(html.includes(text),text);
 assert.equal(html.includes("<script>TESTFIXTURE</script>"),false);assert.ok(html.includes("&lt;script&gt;TESTFIXTURE&lt;/script&gt;"));assert.ok(html.includes("&lt;b&gt;PRIVATE NOTE&lt;/b&gt;"));
 assert.ok(f.seen.some(row=>row[1]==="eq"&&row[2]==="organization_id"&&row[3]===org));
 assert.ok(f.seen.some(row=>row[0]==="support_ticket_deliveries"&&row[1]==="in"&&row[2]==="message_id"));
});
test("Unauthorized overview/detail stops before any data access",async()=>{
 for(const path of ["src/app/app/tickets/page.tsx","src/app/app/tickets/[id]/page.tsx"]){const f=fixture(true);const page=load(path,f.dependencies);await assert.rejects(page.default({params:Promise.resolve({id}),searchParams:Promise.resolve({})}),/denied/);assert.equal(f.seen.length,0);}
});
