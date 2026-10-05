import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {runInNewContext} from "node:vm";
import ts from "typescript";
import {renderToStaticMarkup} from "react-dom/server";
import React from "react";
const require=createRequire(import.meta.url);
function load(path:string,overrides:Record<string,unknown>={},globals:Record<string,unknown>={}) {
 const compiled={exports:{} as Record<string,unknown>};
 const code=ts.transpileModule(readFileSync(new URL(`../${path}`,import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 runInNewContext(code,{module:compiled,exports:compiled.exports,require:(k:string)=>k in overrides?overrides[k]:require(k),URL,URLSearchParams,Date,...globals});return compiled.exports;
}
const id="11111111-1111-4111-8111-111111111111";
const folder={id:"fixture-folder",name:"TESTFIXTURE",mimeType:"application/vnd.google-apps.folder",parents:["original-parent"],webViewLink:"https://drive.google.com/drive/folders/fixture-folder",driveId:"source-drive"};
function actionFixture(failRead=false,allowed=true) {
 const calls:string[]=[]; const writes:unknown[]=[];const filters:unknown[][]=[];
 const supabase={from:(table:string)=>{
  const q:Record<string,unknown>={then:(fn:(x:unknown)=>unknown)=>Promise.resolve({error:null}).then(fn)};
  for(const key of ["select","eq","is"])q[key]=(...v:unknown[])=>{filters.push([table,key,...v]);return q;};
  q.maybeSingle=async()=>({data:table==="events"?{id,title:"TESTFIXTURE",drive_url:folder.webViewLink}:{id:"link",google_id:folder.id},error:null});
  q.insert=q.update=(v:unknown)=>{writes.push(v);return q;}; return q;
 }};
 const m=load("src/app/app/events/[id]/actions.ts",{
  "next/cache":{revalidatePath:()=>{}},"next/navigation":{redirect:(u:string)=>{throw Error(u);}},
  "@/lib/auth-context":{requirePermission:async(cap:string)=>{assert.equal(cap,"manageEvents");if(!allowed)throw Error("denied");return{supabase,user:{id:"fixture-user"},membership:{organization_id:"fixture-org"}};}},
  "@/lib/google-workspace":{
   googleDriveFileId:()=>folder.id,
   getGoogleDriveFolder:async()=>{calls.push("read");if(failRead)throw Error("unavailable");return folder;},
   ensureEventDriveStructure:async()=>{calls.push("ensure");return{eventFolder:folder};},
   completeEventDriveStructure:async()=>{calls.push("complete");return folder;},
   moveGoogleDriveFolderToModule:async()=>{calls.push("move");return folder;},
  }
 });return{calls,writes,filters,run:(action:string,extra:Record<string,string>={})=>(m[action] as(f:unknown)=>Promise<void>)(new Map(Object.entries({event_id:id,drive_folder:folder.webViewLink,...extra})))};
}
for(const [action,extra] of [["linkEventFolder",{}],["createEventFolder",{mode:"existing"}]] as const)test(`${action}: bestaande map lezen en org-scoped opslaan, nul Drive-mutaties`,async()=>{
 const f=actionFixture();await assert.rejects(f.run(action,extra),/succes=drive$/);assert.deepEqual(f.calls,["read"]);assert.equal(f.writes.length,2);assert.ok(f.filters.some(v=>v[1]==="eq"&&v[2]==="organization_id"&&v[3]==="fixture-org"));
});
test("Onbereikbare bestaande map veroorzaakt geen opslag of aanmaak",async()=>{const f=actionFixture(true);await assert.rejects(f.run("linkEventFolder"),/fout=drive-koppelen/);assert.equal(f.writes.length,0);assert.deepEqual(f.calls,["read"]);});
test("Geen manageEvents-recht: geen Google-read of write",async()=>{const f=actionFixture(false,false);await assert.rejects(f.run("linkEventFolder"),/denied/);assert.equal(f.calls.length,0);assert.equal(f.writes.length,0);});
test("Structuuractie vereist afzonderlijke bevestiging",async()=>{const f=actionFixture();await assert.rejects(f.run("organizeEventFolder"),/fout=drive-velden/);assert.equal(f.calls.length,0);assert.equal(f.writes.length,0);});
test("Bevestigd aanvullen verplaatst de eventmap nooit",async()=>{const f=actionFixture();await assert.rejects(f.run("organizeEventFolder",{confirm_structure:"yes",expected_folder_id:folder.id,expected_missing:'["Planning"]'}),/succes=drive-aangevuld/);assert.deepEqual(f.calls,["complete"]);});
function googleFixture(failCreate=false, incomplete=false) {
 const calls:{url:string;method:string;body?:string}[]=[];
 const env=Object.fromEntries(["GOOGLE_OAUTH_CLIENT_ID","GOOGLE_OAUTH_CLIENT_SECRET","GOOGLE_OAUTH_REFRESH_TOKEN","GOOGLE_CLOUD_PROJECT_ID","GOOGLE_SHARED_DRIVE_ID","GOOGLE_DRIVE_ROOT_FOLDER_ID","GOOGLE_CALENDAR_ID","GOOGLE_TEMPLATE_MINUTES_ID","GOOGLE_TEMPLATE_SPONSOR_REPORT_ID","GOOGLE_TEMPLATE_EVENT_ID"].map(k=>[k,"fixture"]));
 const m=load("src/lib/google-workspace.ts",{"@/lib/source-observation":load("src/lib/source-observation.ts")},{process:{env},fetch:async(url:string,init?:{method?:string;body?:string})=>{
  calls.push({url,method:init?.method??"GET",body:init?.body});
  if(failCreate && init?.method === "POST" && url.includes("googleapis.com/drive")) throw Error("create failed");
  let response:unknown={access_token:"fixture",expires_in:3600};
  if(url.includes("/files/fixture-folder"))response={...folder,trashed:false};
  else if(url.includes("/files?"))response=init?.method==="POST"?folder:new URL(url).searchParams.has("pageToken")?{files:[{name:"Partners"},{name:"Financiën"},{name:"Evaluatie"}]}:{files:[{name:"Planning"}],nextPageToken:"page2",incompleteSearch:incomplete};
  return{ok:true,json:async()=>response};
 }});return{calls,m};
}
test("Preview leest alle pagina's van de bron-drive zonder Drive-write",async()=>{
 const f=googleFixture();const p=await(f.m.previewEventDriveStructure as(id:string)=>Promise<{missing:string[]}>)(folder.id);assert.deepEqual(Array.from(p.missing),["Communicatie"]);
 const drive=f.calls.filter(c=>c.url.includes("googleapis.com/drive"));assert.ok(drive.every(c=>c.method==="GET"));assert.equal(drive.filter(c=>c.url.includes("/files?")).length,2);assert.ok(drive.filter(c=>c.url.includes("/files?")).every(c=>new URL(c.url).searchParams.get("driveId")==="source-drive"));
});
test("Aanvullen maakt uitsluitend ontbrekende map onder originele parent aan",async()=>{
 const f=googleFixture();await(f.m.completeEventDriveStructure as(id:string,expected:string[])=>Promise<unknown>)(folder.id,["Communicatie"]);const mutations=f.calls.filter(c=>c.url.includes("googleapis.com/drive")&&c.method!=="GET");assert.equal(mutations.length,1);assert.equal(mutations[0].method,"POST");assert.deepEqual(JSON.parse(mutations[0].body!),{name:"Communicatie",mimeType:folder.mimeType,parents:[folder.id]});
});
test("Veranderde preview vereist nieuwe beoordeling en veroorzaakt geen aanmaak",async()=>{
 const f=googleFixture();await assert.rejects((f.m.completeEventDriveStructure as(id:string,expected:string[])=>Promise<unknown>)(folder.id,["Planning"]));assert.ok(f.calls.filter(c=>c.url.includes("googleapis.com/drive")).every(c=>c.method==="GET"));
});
test("Financiële leegte is geen nul; expliciete nul blijft zichtbaar",()=>{
 const m=load("src/components/financial-summary-panel.tsx",{"next/link":{default:(p:{children:React.ReactNode})=>React.createElement("a",null,p.children)},"@/lib/format":{formatCurrency:(n:unknown)=>`EUR ${n}`}});
 const panel=m.FinancialSummaryPanel as React.ComponentType<{budgets:unknown[];expenses:unknown[];income:unknown[]}>;
 const empty=renderToStaticMarkup(React.createElement(panel,{budgets:[],expenses:[],income:[]}));assert.match(empty,/Geen financiële gegevens gekoppeld/);assert.doesNotMatch(empty,/EUR 0/);
 const partial=renderToStaticMarkup(React.createElement(panel,{budgets:[{id:"b",name:"TESTFIXTURE",planned_amount:0,status:"active"}],expenses:[],income:[]}));assert.match(partial,/EUR 0/);assert.match(partial,/Geen kosten gekoppeld/);assert.match(partial,/Niet te bepalen/);
});

test("Map gewijzigd sinds preview: geen aanvulling of opslag",async()=>{const f=actionFixture();await assert.rejects(f.run("organizeEventFolder",{confirm_structure:"yes",expected_folder_id:"other-folder",expected_missing:'["Planning"]'}),/drive-gewijzigd/);assert.equal(f.calls.length,0);assert.equal(f.writes.length,0);});
test("Niet ontvangen inkomsten en vervallen kosten impliceren geen geregistreerde nul",()=>{
 const m=load("src/components/financial-summary-panel.tsx",{"next/link":{default:(p:{children:React.ReactNode})=>React.createElement("a",null,p.children)},"@/lib/format":{formatCurrency:(n:unknown)=>`EUR ${n}`}});
 const panel=m.FinancialSummaryPanel as React.ComponentType<{budgets:unknown[];expenses:unknown[];income:unknown[]}>;
 const html=renderToStaticMarkup(React.createElement(panel,{budgets:[],expenses:[{id:"e",title:"TESTFIXTURE",amount:12,status:"cancelled"}],income:[{id:"i",title:"TESTFIXTURE",amount:20,status:"expected"}]}));assert.match(html,/Nog geen ontvangen inkomsten/);assert.match(html,/Geen actieve kosten/);assert.doesNotMatch(html,/EUR 0/);
});

test("Ook minder ontbrekende mappen vereist vernieuwde preview",async()=>{const f=googleFixture();await assert.rejects((f.m.completeEventDriveStructure as(id:string,expected:string[])=>Promise<unknown>)(folder.id,["Communicatie","Planning"]));assert.ok(f.calls.filter(c=>c.url.includes("googleapis.com/drive")).every(c=>c.method==="GET"));});
test("Onvolledige Google-zoekopdracht geeft geen vals volledig overzicht of aanmaak",async()=>{const f=googleFixture(false,true);await assert.rejects((f.m.completeEventDriveStructure as(id:string,expected:string[])=>Promise<unknown>)(folder.id,["Communicatie"]));assert.ok(f.calls.filter(c=>c.url.includes("googleapis.com/drive")).every(c=>c.method==="GET"));});
test("Aanmaakfout wordt doorgegeven, zonder mapverplaatsing of vals succes",async()=>{const f=googleFixture(true);await assert.rejects((f.m.completeEventDriveStructure as(id:string,expected:string[])=>Promise<unknown>)(folder.id,["Communicatie"]),/create failed/);assert.equal(f.calls.filter(c=>c.method==="PATCH").length,0);});
