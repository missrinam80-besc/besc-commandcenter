import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
const require=createRequire(import.meta.url);
const id="10000000-0000-4000-8000-000000000001",org="20000000-0000-4000-8000-000000000001",candidate="30000000-0000-4000-8000-000000000002";
type DbResult={data:Record<string,unknown>|null;error:{message:string}|null};
type Query={select:()=>Query;eq:(k:string,v:unknown)=>Query;is:(k:string,v:unknown)=>Query;update:()=>Query;insert:()=>Query;maybeSingle:()=>Promise<DbResult>;then:(resolve:(value:DbResult)=>unknown)=>Promise<unknown>};
type Actions=Record<string,(form:FormData)=>Promise<unknown>>;
function fixture(mode="ok"){
 const writes:string[]=[],invalidations:string[]=[],filters:string[]=[];
 const supabase={from(table:string){let mutation=false;const q:Query={
 select(){return q;},eq(k:string,v:unknown){filters.push(`${table}:${k}:${v}`);return q;},is(k:string,v:unknown){filters.push(`${table}:${k}:${v}`);return q;},
 update(){mutation=true;writes.push(table);return q;},insert(){writes.push(table);return q;},
 maybeSingle(){return Promise.resolve({data:table==="tasks"?(mutation?(mode==="zero"?null:{id}):(mode==="missing"?null:{id,title:"Fixture",project_id:null})):null,error:mutation&&mode==="error"?{message:"failed"}:null});},
 then(resolve:(value:DbResult)=>unknown){return Promise.resolve({data:null,error:null}).then(resolve);}};return q;},
 rpc(name:string,args:Record<string,unknown>){writes.push(`rpc:${name}`);assert.equal(args.p_organization_id,org);assert.equal(args.p_task_id,id);return Promise.resolve({data:mode==="zero"?null:id,error:mode==="error"?{message:"failed"}:null});}};
 function load(file:string){const m={exports:{} as Actions};runInNewContext(ts.transpileModule(readFileSync(new URL(`../${file}`,import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,FormData,Date,require:(name:string)=>{
 if(name==="next/navigation")return{redirect:(url:string)=>{throw Error(url);}};
 if(name==="next/cache")return{revalidatePath:(p:string)=>invalidations.push(p)};
 if(name==="@/lib/auth-context")return{requireActiveMembership:async()=>({supabase,user:{id},membership:{organization_id:org}})};
 if(name==="@/lib/format")return{localDateTimeToIso:()=>null};
 if(name==="@/lib/supabase/configured")return{isSupabaseConfigured:()=>true};
 if(name==="@/lib/dossier-relations")return{dossierEntityTypes:["task","project"]};
 if(name==="@/lib/project-outcomes")return{projectOutcomeShape:{}};
 return require(name);}});return m.exports;}
 const details=load("src/app/app/taken/[id]/actions.ts"),core=load("src/app/app/actions.ts");
 const form=(values:Record<string,unknown>)=>{const f=new FormData();Object.entries(values).forEach(([k,v])=>f.set(k,String(v)));return f;};
 return{writes,invalidations,filters,details,core,form};
}
for(const mode of ["zero","error"]){
 test(`Taakupdate, status en verwijdering melden geen succes bij ${mode}`,async()=>{
 for(const action of ["updateTaskDetails","deleteTask","updateTaskStatus"]){const f=fixture(mode);
 const values=action==="deleteTask"?{id,confirmation:"VERWIJDER"}:{id,title:"Fixture",status:"done",priority:"normal",project_id:""};
 await assert.rejects((action==="updateTaskStatus"?f.core:f.details)[action](f.form(values)),/fout=(opslaan|verwijderen)/);
 assert.deepEqual(f.invalidations,[]);assert.equal(f.writes.includes("activity_events"),false);assert(f.filters.includes(`tasks:organization_id:${org}`));assert(f.filters.includes("tasks:deleted_at:null"));}
 });
 test(`Toewijzing produceert geen melding of activiteit bij ${mode}`,async()=>{const f=fixture(mode);
 await assert.rejects(f.details.setTaskAssignee(f.form({task_id:id,user_id:candidate})),/fout=toewijzen/);
 assert.deepEqual(f.writes,["rpc:replace_task_assignee"]);assert.deepEqual(f.invalidations,[]);});
}
test("Ontbrekende taak stopt voor opslaan of toewijzen",async()=>{for(const action of ["updateTaskDetails","setTaskAssignee"]){const f=fixture("missing");await assert.rejects(f.details[action](f.form({id,task_id:id,user_id:candidate,title:"Fixture",status:"done",priority:"normal",project_id:""})),/fout=/);assert.deepEqual(f.writes,[]);}});
test("Geslaagde toewijzing en leegmaken worden pas na RPC geregistreerd",async()=>{for(const user_id of [candidate,""]){const f=fixture();await assert.rejects(f.details.setTaskAssignee(f.form({task_id:id,user_id})),/succes=toegewezen/);assert.equal(f.writes[0],"rpc:replace_task_assignee");assert(f.writes.includes("activity_events"));assert(f.invalidations.includes("/app/taken"));}});
test("Geslaagde taakupdate, status en verwijdering behouden succesroute",async()=>{for(const action of ["updateTaskDetails","deleteTask","updateTaskStatus"]){const f=fixture();const values=action==="deleteTask"?{id,confirmation:"VERWIJDER"}:{id,title:"Fixture",status:"done",priority:"normal",project_id:""};try{await(action==="updateTaskStatus"?f.core:f.details)[action](f.form(values));}catch(e){assert(!String(e).includes("fout="));}assert(f.invalidations.includes("/app/taken"));if(action!=="updateTaskStatus")assert(f.writes.includes("activity_events"));}});

