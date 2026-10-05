import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
const require=createRequire(import.meta.url);
function load(path:string,overrides:Record<string,unknown>={},globals:Record<string,unknown>={}) {
  const source=readFileSync(new URL(`../${path}`,import.meta.url),"utf8");
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const compiled={exports:{} as Record<string,unknown>};
  runInNewContext(code,{module:compiled,exports:compiled.exports,require:(id:string)=>id==="@/lib/source-observation"?load("src/lib/source-observation.ts"):id in overrides?overrides[id]:require(id),URL,URLSearchParams,Date,...globals});
  return compiled.exports;
}
const folder={id:"fixture-folder-id",name:"Hernoemde map",mimeType:"application/vnd.google-apps.folder",webViewLink:"https://drive.google.com/drive/folders/fixture-folder-id",driveId:"fixture-drive",parents:["fixture-parent"]};
function fixture(options:{link?:Record<string,unknown>|null;readError?:boolean;saveError?:boolean;googleError?:boolean}={}) {
  let stored=options.link===undefined?{id:"link-id",google_id:folder.id}:options.link;
  const reads:string[]=[];const ensures:string[]=[];const writes:Record<string,unknown>[]=[];const filters:unknown[][]=[];
  const supabase={from:(table:string)=>{
    const q:Record<string,unknown>={};
    for(const method of ["select","eq"])q[method]=(...args:unknown[])=>{filters.push([table,method,...args]);return q;};
    q.maybeSingle=async()=>({data:stored,error:options.readError?{message:"read error"}:null});
    q.insert=async(row:Record<string,unknown>)=>{writes.push(row);if(!options.saveError)stored={id:"new-link",google_id:row.google_id};return{error:options.saveError?{message:"save error"}:null};};
    return q;
  }};
  const google=load("src/lib/google-workspace.ts");
  const loaded=load("src/lib/dossier-drive-folder.ts",{"@/lib/google-workspace":{
    googleDriveFileId:google.googleDriveFileId,
    getGoogleDriveFolder:async(id:string)=>{reads.push(id);if(options.googleError)throw Error("unavailable");return folder;},
    ensureGoogleDriveEntityFolder:async(module:string,title:string)=>{ensures.push(`${module}:${title}`);return folder;},
  }});
  const input={supabase,organizationId:"fixture-org",userId:"fixture-user",entityType:"event",entityId:"fixture-event",module:"events",title:"Nieuwe dossiertitel"};
  const run=loaded.resolveDossierDriveFolder as (input:unknown)=>Promise<typeof folder>;
  return{reads,ensures,writes,filters,run:(legacyDriveUrl?:string)=>run({...input,legacyDriveUrl})};
}
test("Opgeslagen map-ID blijft leidend bij gewijzigde titel en mapnaam",async()=>{
  const f=fixture();assert.equal((await f.run()).id,folder.id);assert.deepEqual(f.reads,[folder.id]);assert.equal(f.ensures.length,0);assert.equal(f.writes.length,0);
  for(const [key,value] of [["organization_id","fixture-org"],["entity_type","event"],["entity_id","fixture-event"],["resource_type","folder"]])assert.ok(f.filters.some(r=>r[1]==="eq"&&r[2]===key&&r[3]===value));
});
test("Oude Drive-URL wordt zonder titelzoekopdracht geregistreerd en hergebruikt",async()=>{
  const f=fixture({link:null});await f.run(folder.webViewLink);await f.run(folder.webViewLink);
  assert.equal(f.ensures.length,0);assert.equal(f.writes.length,1);assert.equal(f.writes[0].google_id,folder.id);assert.equal(f.writes[0].organization_id,"fixture-org");
});
test("Eerste map wordt geregistreerd; tweede generatie zoekt niet opnieuw op titel",async()=>{
  const f=fixture({link:null});await f.run();await f.run();assert.equal(f.ensures.length,1);assert.equal(f.writes.length,1);assert.deepEqual(f.reads,[folder.id]);
});
for(const [label,options,legacy] of [
  ["leesfout",{readError:true},undefined],
  ["conflicterende URL",{},"https://drive.google.com/drive/folders/other-folder-id"],
  ["ongeldige bestaande URL",{},"geen link"],
  ["lege opgeslagen ID",{link:{id:"link",google_id:""}},undefined],
  ["onbereikbare map",{googleError:true},undefined],
] as const)test(`Geen nieuwe map of opslag bij ${label}`,async()=>{
  const f=fixture(options);await assert.rejects(f.run(legacy));assert.equal(f.ensures.length,0);assert.equal(f.writes.length,0);
});
test("Registratiefout stopt de resolutie, zonder succes",async()=>{
  const f=fixture({link:null,saveError:true});await assert.rejects(f.run(folder.webViewLink));assert.equal(f.ensures.length,0);
});

function googleFixture(response:Record<string,unknown>) {
  const calls:{url:string;method:string}[]=[];
  const env=Object.fromEntries(["GOOGLE_OAUTH_CLIENT_ID","GOOGLE_OAUTH_CLIENT_SECRET","GOOGLE_OAUTH_REFRESH_TOKEN","GOOGLE_CLOUD_PROJECT_ID","GOOGLE_SHARED_DRIVE_ID","GOOGLE_DRIVE_ROOT_FOLDER_ID","GOOGLE_CALENDAR_ID","GOOGLE_TEMPLATE_MINUTES_ID","GOOGLE_TEMPLATE_SPONSOR_REPORT_ID","GOOGLE_TEMPLATE_EVENT_ID"].map(k=>[k,"fixture"]));
  const loaded=load("src/lib/google-workspace.ts",{},{process:{env},fetch:async(url:string,init?:{method?:string})=>{
    calls.push({url,method:init?.method??"GET"});return{ok:true,json:async()=>url.startsWith("https://oauth2.googleapis.com/")?{access_token:"fixture",expires_in:3600}:response};
  }});
  return{calls,get:loaded.getGoogleDriveFolder as (id:string)=>Promise<typeof folder>,ensure:loaded.ensureGoogleDriveEntityFolder as(module:string,title:string)=>Promise<typeof folder>};
}
for(const [label,response] of [
  ["prullenbak",{...folder,trashed:true}],
  ["verkeerd type",{...folder,trashed:false,mimeType:"application/pdf"}],
  ["andere ID",{...folder,trashed:false,id:"other-id"}],
] as const)test(`Gekoppelde mapcontrole weigert ${label}`,async()=>{await assert.rejects(googleFixture(response).get(folder.id));});
test("Twee mappen met dezelfde titel geven fout zonder Drive-write",async()=>{
  const f=googleFixture({files:[folder,{...folder,id:"duplicate"}]});await assert.rejects(f.ensure("events","Titel"),/Meerdere mappen/);assert.equal(f.calls.filter(c=>c.method!=="GET"&&!c.url.startsWith("https://oauth2.googleapis.com/")).length,0);
});
test("Ontbrekende maplijst wordt geen aanleiding tot mapcreatie",async()=>{
  const f=googleFixture({});await assert.rejects(f.ensure("events","Titel"));assert.equal(f.calls.filter(c=>c.method!=="GET"&&!c.url.startsWith("https://oauth2.googleapis.com/")).length,0);
});

for(const [actionName,field,entityType] of [
  ["generateMeetingMinutes","meeting_id","meeting"],
  ["generateSponsorReport","partner_id","partner"],
  ["generateEventDossier","event_id","event"],
  ["generateSponsorPitchdeck","partner_id","partner"],
] as const)test(`${actionName} gebruikt de dossiermapresolutie vóór documentcreatie`,async()=>{
  const entityId="11111111-1111-4111-8111-111111111111";
  const sequence:string[]=[];const destinations:string[]=[];
  const record={id:entityId,title:"TESTFIXTURE",name:"TESTFIXTURE",drive_url:null};
  const supabase={from:()=>{
    const q:Record<string,unknown>={then:(yes:(v:unknown)=>unknown)=>Promise.resolve({data:[],error:null}).then(yes)};
    for(const method of ["select","eq","is","order","gte","lt","update"])q[method]=()=>q;
    q.maybeSingle=async()=>({data:record,error:null});q.insert=async()=>({error:null});return q;
  }};
  const create=async(input:{parentId:string})=>{sequence.push("create");destinations.push(input.parentId);return{...folder,id:"generated-document",parents:[folder.id]};};
  const loaded=load("src/app/app/google-document-actions.ts",{
    "next/cache":{revalidatePath:()=>undefined},"next/navigation":{redirect:(url:string)=>{throw Error(url);}},
    "@/lib/auth-context":{requirePermission:async()=>({supabase,user:{id:"fixture-user"},membership:{organization_id:"fixture-org"}})},
    "@/lib/dossier-drive-folder":{resolveDossierDriveFolder:async(input:{entityType:string;entityId:string;organizationId:string})=>{
      assert.equal(input.entityType,entityType);assert.equal(input.entityId,entityId);assert.equal(input.organizationId,"fixture-org");sequence.push("resolve");return folder;
    }},
    "@/lib/google-workspace":{createDocumentFromGoogleTemplate:create,createPresentationFromGoogleTemplate:create,getGoogleDriveDocumentMetadata:async()=>{sequence.push("observe");return {...folder,version:"42",modifiedTime:"2026-10-05T12:00:00Z",checkedAt:"2026-10-05T12:00:01Z"};}},
  },{Intl});
  const form=new Map([[field,entityId],["period_start","2025-01-01"],["period_end","2026-01-01"],["period_label","TESTFIXTURE"]]);
  await assert.rejects((loaded[actionName] as(f:unknown)=>Promise<void>)(form),/succes=(document|pitchdeck)$/);
  assert.deepEqual(sequence,["resolve","create","observe"]);assert.deepEqual(destinations,[folder.id]);
});
