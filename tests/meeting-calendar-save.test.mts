import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { editorLoader } from "./helpers/editor-loader.mts";
import type { EditorBundle } from "../src/lib/dossier-editor-draft.ts";

const id="11111111-1111-4111-8111-111111111111",org="22222222-2222-4222-8222-222222222222";
const bundle=(isNew=false):EditorBundle=>({kind:"meeting",root:{id,new:isNew,base:isNew?null:{title:"TESTFIXTURE"},values:{title:"TESTFIXTURE gewijzigd"}},parts:[]});
function actionFixture(options:{rpcError?:boolean;wrongId?:boolean;syncError?:boolean;denied?:boolean}={}){
 const calls:string[]=[];
 const supabase={rpc:async()=>{calls.push("saved");return{data:options.wrongId?org:id,error:options.rpcError?{code:"42501"}:null};}};
 const load=editorLoader({
  "next/cache":{revalidatePath:()=>{}},
  "@/lib/auth-context":{requireActiveMembership:async()=>({supabase,user:{id:org},membership:{organization_id:org,role:options.denied?"volunteer":"admin",finance_role:"none"}})},
  "@/lib/dossier-editor-draft":{validateEditorIssues:()=>[]},
  "@/lib/dossier-choices-server":{loadManagedChoices:async()=>[]},
  "@/lib/linked-calendar-sync":{syncLinkedMeeting:async(context:{organizationId:string},meetingId:string)=>{assert.equal(context.organizationId,org);assert.equal(meetingId,id);calls.push("synced");if(options.syncError)throw Error("PRIVATE_GOOGLE_DETAIL");return true;}},
 });
 const save=load("src/app/app/dossier-editor-actions.ts").saveDossierEditor as (b:EditorBundle)=>Promise<{ok:boolean;href?:string}>;
 return{save,calls};
}
test("Algemene dossiereditor synchroniseert pas na bevestigde opslag van bestaande vergadering",async()=>{
 const f=actionFixture();const result=await f.save(bundle());assert.equal(result.ok,true);assert.deepEqual(f.calls,["saved","synced"]);assert.doesNotMatch(result.href!,/waarschuwing/);
});
test("Nieuwe vergadering wordt niet automatisch naar Google gepubliceerd",async()=>{
 const f=actionFixture();assert.equal((await f.save(bundle(true))).ok,true);assert.deepEqual(f.calls,["saved"]);
});
for(const options of [{rpcError:true},{wrongId:true},{denied:true}])test(`Onbevestigde of onbevoegde opslag raakt Google niet: ${JSON.stringify(options)}`,async()=>{
 const f=actionFixture(options);assert.equal((await f.save(bundle())).ok,false);assert.ok(!f.calls.includes("synced"));
});
test("Google-fout na opslag behoudt opgeslagen dossier en toont herstelwaarschuwing zonder interne fout",async()=>{
 const f=actionFixture({syncError:true});const result=await f.save(bundle());assert.equal(result.ok,true);assert.match(result.href!,/waarschuwing=kalender-sync/);assert.deepEqual(f.calls,["saved","synced"]);assert.doesNotMatch(JSON.stringify(result),/PRIVATE_GOOGLE_DETAIL/);
});

function linkedFixture(options:{unlinked?:boolean;removed?:boolean;lookupError?:boolean;missingId?:boolean;providerError?:boolean}={}){
 const updates:unknown[]=[];const providerCalls:unknown[][]=[];
 const meeting={id,title:"TESTFIXTURE",status:"cancelled",meeting_type:"other",meeting_at:"2026-11-06T08:00:00Z",ends_at:"2026-11-06T08:10:00Z",attendees:[],minutes_url:null};
 const supabase={from(table:string){
  let selection="";let write:unknown;
  const q={select(fields:string){selection=fields;return q;},eq(){return q;},is(){return q;},update(value:unknown){write=value;updates.push(value);return q;},insert(){throw Error("Unexpected new link");},
   maybeSingle:async()=>({data:table==="meetings"?meeting:options.unlinked?null:selection==="id"?{id:"link"}:{google_id:options.missingId?null:"existing-calendar",name:options.removed?"[VERWIJDERD] TESTFIXTURE":"TESTFIXTURE"},error:options.lookupError?{message:"lookup failed"}:null}),
   then(resolve:(value:unknown)=>unknown){return Promise.resolve({data:write,error:null}).then(resolve);}};return q;
 }};
 const load=editorLoader({"@/lib/google-workspace":{
  syncGoogleCalendarMeeting:async(...args:unknown[])=>{providerCalls.push(args);if(options.providerError)throw Error("provider failed");return{id:"existing-calendar",name:"GEANNULEERD — TESTFIXTURE",webUrl:"https://example.invalid/calendar"};},
  deleteGoogleCalendarEvent:()=>{throw Error("Deletion not authorized");},
 }});
 const sync=load("src/lib/linked-calendar-sync.ts").syncLinkedMeeting as (c:unknown,id:string)=>Promise<boolean>;
 return{run:()=>sync({supabase,organizationId:org,createdBy:org},id),updates,providerCalls};
}
for(const options of [{unlinked:true},{removed:true}])test(`Geen nieuw Google-effect zonder actieve koppeling: ${JSON.stringify(options)}`,async()=>{
 const f=linkedFixture(options);assert.equal(await f.run(),false);assert.equal(f.providerCalls.length,0);assert.equal(f.updates.length,0);
});
for(const options of [{lookupError:true},{missingId:true}])test(`Foutieve koppeling blijft gesloten: ${JSON.stringify(options)}`,async()=>{
 const f=linkedFixture(options);await assert.rejects(f.run());assert.equal(f.providerCalls.length,0);
});
test("Annulering gebruikt bestaand item, bestaande-koppelingmodus en bevestigt metadata na providerresultaat",async()=>{
 const f=linkedFixture();assert.equal(await f.run(),true);assert.equal(f.providerCalls[0][1],"existing-calendar");assert.equal((f.providerCalls[0][2] as {existingOnly:boolean}).existingOnly,true);assert.equal(f.updates.length,1);
});
test("Providerfout wordt niet als succesvolle metadatavernieuwing opgeslagen",async()=>{
 const f=linkedFixture({providerError:true});await assert.rejects(f.run());assert.equal(f.updates.length,0);
});

function googleFixture(options:{missing?:boolean;patchMissing?:boolean}={}){
 const calls:{method:string;url:string;body?:Record<string,unknown>}[]=[];
 const env=Object.fromEntries(["GOOGLE_OAUTH_CLIENT_ID","GOOGLE_OAUTH_CLIENT_SECRET","GOOGLE_OAUTH_REFRESH_TOKEN","GOOGLE_CLOUD_PROJECT_ID","GOOGLE_SHARED_DRIVE_ID","GOOGLE_DRIVE_ROOT_FOLDER_ID","GOOGLE_CALENDAR_ID","GOOGLE_TEMPLATE_MINUTES_ID","GOOGLE_TEMPLATE_SPONSOR_REPORT_ID","GOOGLE_TEMPLATE_EVENT_ID"].map(k=>[k,"fixture"]));
 const event={id:"existing-calendar",summary:"TESTFIXTURE",htmlLink:"https://example.invalid/calendar",extendedProperties:{private:{bescEntityType:"meeting"}}};
 const response=(data:unknown,status=200)=>({ok:status<400,status,json:async()=>data});
 const fetch=async(raw:string,init:{method?:string;body?:string}={})=>{
  if(raw.startsWith("https://oauth2.googleapis.com/"))return response({access_token:"SYNTHETIC",expires_in:3600});
  const method=init.method??"GET",url=new URL(raw);const body=init.body?JSON.parse(init.body):undefined;calls.push({method,url:raw,body});
  if(method==="GET"&&url.pathname.endsWith("/events"))return response({items:options.missing?[]:[event]});
  if(method==="GET")return options.missing?response({error:{message:"missing"}},404):response(event);
  if(method==="PATCH")return options.patchMissing?response({error:{message:"missing"}},404):response({...event,...body});
  if(method==="POST")return response({...event,...body,id:"new-calendar"});
  throw Error("Unexpected fixture request");
 };
 const compiled={exports:{} as {syncGoogleCalendarMeeting:(m:unknown,id?:string,o?:{existingOnly:boolean})=>Promise<{id:string}>}};
 const code=ts.transpileModule(readFileSync("src/lib/google-workspace.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 runInNewContext(code,{module:compiled,exports:compiled.exports,process:{env},URL,URLSearchParams,Date,fetch});
 return{calls,sync:(existingOnly:boolean)=>compiled.exports.syncGoogleCalendarMeeting({id,organizationId:org,title:"TESTFIXTURE",status:"cancelled",meetingType:"other",startAt:"2026-11-06T08:00:00Z",endAt:"2026-11-06T08:10:00Z",attendees:[],minutesUrl:null},"existing-calendar",{existingOnly})};
}
test("Werkelijke Google-helper werkt hetzelfde item bij zonder uitnodigingen; annulering blokkeert geen tijd",async()=>{
 const f=googleFixture();assert.equal((await f.sync(true)).id,"existing-calendar");const patch=f.calls.find(c=>c.method==="PATCH")!;assert.match(patch.url,/existing-calendar\?sendUpdates=none/);assert.equal(patch.body?.transparency,"transparent");assert.equal(patch.body?.attendees,undefined);assert.ok(!f.calls.some(c=>c.method==="POST"));
});
for(const options of [{missing:true},{patchMissing:true}])test(`Automatische sync maakt verdwenen agenda-item niet opnieuw aan: ${JSON.stringify(options)}`,async()=>{
 const f=googleFixture(options);await assert.rejects(f.sync(true));assert.ok(!f.calls.some(c=>c.method==="POST"));
});
test("Expliciet opnieuw publiceren kan nog steeds een nieuw item aanmaken",async()=>{
 const f=googleFixture({missing:true});assert.equal((await f.sync(false)).id,"new-calendar");assert.equal(f.calls.filter(c=>c.method==="POST").length,1);
});
