import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import * as permissions from "../src/lib/permissions.ts";
import * as rewards from "../src/lib/rewards.ts";
const require = createRequire(import.meta.url);
const org="10000000-0000-4000-8000-000000000001",user="20000000-0000-4000-8000-000000000003";
async function page(tab:string,role="member",data:Record<string,unknown>={}){
 const output=ts.transpileModule(readFileSync(new URL("../src/app/app/bucks/page.tsx",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const exports:Record<string,unknown>={};
 const calls:string[]=[];
 const mock=(name:string)=>{
  if(name==="next/link")return {__esModule:true,default:({children,...props}:{children:React.ReactNode})=>React.createElement("a",props,children)};
  if(name==="@/components/app-shell")return {AppShell:({children}:{children:React.ReactNode})=>React.createElement(React.Fragment,null,children)};
  if(name==="@/lib/auth-context")return {async requireActiveMembership(){return {user:{id:user},membership:{organization_id:org,role,finance_role:"none"},supabase:{async rpc(_name:string,args:{op:string}){calls.push(args.op);return {data,error:null};}}};}};
  if(name==="@/lib/permissions")return permissions;
  if(name==="@/lib/rewards")return rewards;
  if(name==="./actions")return {saveRewardAction:async()=>{}};
  if(name.endsWith(".css"))return {};
  return require(name);
 };
 runInNewContext(output,{exports,require:mock,process:{env:{BESC_REWARDS_ACTIVITY_ENABLED:"false"}}});
 const component=exports.default as (p:{searchParams:Promise<Record<string,string>>})=>Promise<React.ReactElement>;
 const dom=new JSDOM(renderToStaticMarkup(await component({searchParams:Promise.resolve({tab})})));
 return {dom,document:dom.window.document,calls};
}
test("Bucks-pagina: eigen saldo en reservering zijn apart zichtbaar, beheer blijft verborgen",async()=>{
 const p=await page("overzicht","member",{xp:50,level:1,bucks:100,reserved:60,available:40,ledger:[]});try{
  assert.deepEqual(p.calls,["account"]);assert.match(p.document.body.textContent!,/Beschikbare Bucks40/);assert.match(p.document.body.textContent!,/Gereserveerde Bucks60/);
  assert.equal(p.document.querySelector('a[href="/app/bucks?tab=beheer"]'),null);
 }finally{p.dom.window.close();}
});
test("Bucks-pagina: aanvraag legt vaste catalogusversie en één inzend-ID vast",async()=>{
 const p=await page("catalogus","member",{items:[{id:org,title:"TESTFIXTURE",description:"Test",price:60,version:2,available_stock:1}]});try{
  assert.match(p.document.body.textContent!,/gereserveerd/);assert.equal(p.document.querySelector<HTMLInputElement>('input[name="version"]')?.value,"2");
  assert.match(p.document.querySelector<HTMLInputElement>('input[name="submission_id"]')?.value??"",/^[a-f0-9-]{36}$/);
  assert.equal(p.document.querySelectorAll('button:disabled').length,0);
 }finally{p.dom.window.close();}
});
test("Bucks-pagina: configuratie slaat uitgeschakeld op en vult geen verdienbedragen in",async()=>{
 const p=await page("regels","admin",{servers:[{guild_id:"1067893182387474432",name:"TESTFIXTURE server"}],rules:[],settings:{}});try{
  assert.deepEqual(p.calls,["manage"]);assert.match(p.document.body.textContent!,/Automatisch verdienen staat uit/);
  assert.equal(p.document.querySelector<HTMLInputElement>('input[name="xp"]')?.value,"");
  assert.equal(p.document.querySelector<HTMLInputElement>('input[name="bucks"]')?.value,"");
  assert.equal(p.document.querySelector('input[name="enabled"]'),null);assert.match(p.document.body.textContent!,/Minimum deelnemers in voice/);
  assert.equal(p.document.querySelector('select[name="guild_id"] option[value="1067893182387474432"]')?.textContent,"TESTFIXTURE server");
 }finally{p.dom.window.close();}
});
test("Bucks-pagina: status en eigen annuleeractie zijn duidelijk aanwezig",async()=>{
 const p=await page("aanvragen","volunteer",{requests:[{id:org,title:"TESTFIXTURE",price:60,status:"pending",reason:"",version:1,created_at:"2026-10-17T12:00:00Z"}]});try{
  assert.equal(p.document.querySelector('.reward-status-pending')?.textContent,"Aangevraagd");
  assert.match(p.document.body.textContent!,/Annuleren en Bucks vrijgeven/);
 }finally{p.dom.window.close();}
});
test("Bucks-opslagactie: configuratie kan niet per ongeluk automatisering activeren",()=>{
 const source=readFileSync(new URL("../src/app/app/bucks/actions.ts",import.meta.url),"utf8");
 assert.match(source,/case "rule_save"[\s\S]*?enabled: false/);
 assert.match(source,/requireActiveMembership/);assert.match(source,/hasPermission\(membership, "manageRewards"\)/);
});
