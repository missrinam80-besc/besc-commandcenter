import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import React from "react";
import {editorLoader} from "./helpers/editor-loader.mts";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
function load(path: string, overrides: Record<string, unknown> = {}) {
  const compiled = { exports: {} as Record<string, unknown> };
  const code = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(code, { module: compiled, exports: compiled.exports, FormData, Date, URLSearchParams,
    require: (key: string) => key === "@/components/dossier-editor-gate" ? {dossierEditorGate:async()=>null} : key in overrides ? overrides[key] : require(key) });
  return compiled.exports;
}
const id = "11111111-1111-4111-8111-111111111111";
const campaignId = "22222222-2222-4222-8222-222222222222";
const partnerId = "33333333-3333-4333-8333-333333333333";
const constants = load("src/app/app/content/constants.ts");
function selectedValue(html: string, name: string) {
 const options=html.match(new RegExp('<select id="'+name+'-[^"]*"[^>]*>([\\s\\S]*?)</select>'))?.[1];
 assert.ok(options, 'select '+name+' is present');
 const selected=options.match(/<option[^>]*value="([^"]*)"[^>]*selected=""/);
 assert.ok(selected,'select '+name+' has a selected option');return selected[1];
}
async function fixture(detail:boolean,unavailable=false,role="admin",capabilities:string[]=[]){
 const queries:{table:string;organization?:string;id?:string}[]=[];
 const record={id,title:"TESTFIXTURE",content_type:"social_post",status:"idea",priority:"normal",campaign_id:campaignId,partner_id:partnerId,channels:[],approval_status:"not_required"};
 const supabase={from:(table:string)=>{
  const call:{table:string;organization?:string;id?:string}={table};queries.push(call);
  const q:Record<string,unknown>={};
  q.eq=(key:string,value:string)=>{if(key==="organization_id")call.organization=value;if(key==="id")call.id=value;return q;};
  for(const method of ["select","is","limit","order","in","or"])q[method]=()=>q;
  q.maybeSingle=async()=>({data:record,error:null});
  q.then=(resolve:(r:unknown)=>unknown)=>Promise.resolve({data:table==="campaigns"?unavailable?null:[{id:campaignId,title:"TESTFIXTURE campagne"},{id:"deleted-campaign",title:"VERWIJDERD",deleted_at:"2026-10-08"}]:table==="partners"?unavailable?null:[{id:partnerId,name:"TESTFIXTURE partner"}]:[],error:null}).then(resolve);
  return q;
 }};
 const read=editorLoader({"./auth-context":{requireActiveMembership:async()=>({supabase,membership:{organization_id:"fixture-org",role,capabilities,finance_role:"none"},user:{id:"fixture-user"}})},"next/navigation":{redirect:(url:string)=>{throw Error(url);},notFound:()=>{throw Error("404");},useRouter:()=>({push(){},refresh(){}})}});
 const data=await (read("src/lib/dossier-editor-server.ts").loadDossierEditor as (kind:string,id?:string)=>Promise<Record<string,unknown>>)("content",detail?id:undefined);
 const Component=read("src/components/dossier-editor.tsx").DossierEditor as React.ComponentType<Record<string,unknown>>;
 return {html:renderToStaticMarkup(React.createElement(Component,{...data,mode:detail?"edit":"create",cancelHref:"/app/content"})),queries,read,record};
}
async function save(campaign: string, partner: string) {
  const writes: Record<string, unknown>[] = [];
  const query = { update: (value: Record<string, unknown>) => { writes.push(value); return query; },
    eq: () => query, is: () => query, select: () => query, maybeSingle: async () => ({ data: { id }, error: null }),
    then: (resolve: (result: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve) };
  const actions = load("src/app/app/content/actions.ts", {
    "next/cache": { revalidatePath: () => {} }, "next/navigation": { redirect: (url: string) => { throw Error(url); } },
    "@/lib/auth-context": { requirePermission: async () => ({ supabase: { from: () => query }, membership: { organization_id: "fixture-org" } }) },
    "@/lib/format": { localDateTimeToIso: () => null }, "./constants": constants,
  });
  const data = new FormData();
  for (const [key, value] of Object.entries({ id, title: "TESTFIXTURE gewijzigde tekst", content_type: "social_post",
    status: "idea", priority: "normal", approval_status: "not_required", campaign_id: campaign, partner_id: partner })) data.set(key, value);
  await assert.rejects((actions.updateContent as (data: FormData) => Promise<void>)(data), /succes=bijgewerkt/);
  return writes[0];
}
for (const unavailable of [false, true]) test(`Tekstwijziging behoudt relaties; keuzelijsten ${unavailable ? "onbeschikbaar" : "beschikbaar"}`, async () => {
  const { html, queries,read,record } = await fixture(true, unavailable);
  const draftLib=read("src/lib/dossier-editor-draft.ts") as {createDossierDraft:(kind:string,id:string,record:Record<string,unknown>)=>{values:Record<string,unknown>};buildEditorBundle:(draft:unknown)=>{root:{values:Record<string,unknown>}}};
  const draft=draftLib.createDossierDraft("content",id,record);draft.values.title="TESTFIXTURE gewijzigde tekst";
  assert.deepEqual(Object.keys(draftLib.buildEditorBundle(draft).root.values),["title"]);
  const written = await save(selectedValue(html, "campaign_id"), selectedValue(html, "partner_id"));
  assert.equal(written.campaign_id, campaignId); assert.equal(written.partner_id, partnerId);
  assert.equal(written.title, "TESTFIXTURE gewijzigde tekst");
  for (const table of ["campaigns", "partners"]) assert.ok(queries.some(q => q.table === table && q.organization === "fixture-org"));
});
test("Nieuw formulier biedt campagne en partner uit de eigen organisatie", async () => {
  const { html, queries } = await fixture(false);
  assert.ok(html.includes(`value="${campaignId}"`)); assert.doesNotMatch(html,/VERWIJDERD/); assert.ok(html.includes(`value="${partnerId}"`));
  assert.equal(selectedValue(html, "campaign_id"), ""); assert.equal(selectedValue(html, "partner_id"), "");
  for (const table of ["campaigns", "partners"]) assert.ok(queries.some(q => q.table === table && q.organization === "fixture-org" && true));
});
test("Bewust ontkoppelen blijft mogelijk", async () => {
  const written = await save("", "");
  assert.equal(written.campaign_id, null); assert.equal(written.partner_id, null);
});
test("Bewust een andere campagne kiezen behoudt de partner", async () => {
  const replacement = "44444444-4444-4444-8444-444444444444";
  const written = await save(replacement, partnerId);
  assert.equal(written.campaign_id, replacement); assert.equal(written.partner_id, partnerId);
});

for (const role of ["admin","board","member","volunteer"])test(`Content-editor volgt manageContent voor ${role}`,async()=>{
 for(const detail of [false,true]){
  if(role!=="volunteer")assert.match((await fixture(detail,false,role)).html,/id="campaign_id-/);
  else await assert.rejects(fixture(detail,false,role),/geen-toegang/);
 }
});
test("Content-editor laat expliciete Content-bevoegdheid toe",async()=>{
 for(const detail of [false,true])assert.match((await fixture(detail,false,"volunteer",["manageContent"])).html,/id="campaign_id-/);
});
