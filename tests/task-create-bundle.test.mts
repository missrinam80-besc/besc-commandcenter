import * as contactTabHelpers from "../src/lib/contact-dossier-tabs.ts";
import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {runInNewContext} from "node:vm";
import ts from "typescript";
const require=((native) => (name: string) => name === "@/lib/contact-dossier-tabs" ? contactTabHelpers : native(name))(createRequire(import.meta.url));
const org="20000000-0000-4000-8000-000000000001",id="30000000-0000-4000-8000-000000000001";
function fixture(data:unknown=id,error:unknown=null){const calls:Record<string,unknown>[]=[],invalidations:string[]=[];const supabase={from(){throw Error("Unexpected separate write");},rpc(name:string,args:Record<string,unknown>){assert.equal(name,"create_task_bundle");calls.push(args);return Promise.resolve({data,error});}};
 const m={exports:{} as Record<string,(f:FormData)=>Promise<unknown>>};
 runInNewContext(ts.transpileModule(readFileSync(new URL('../src/app/app/actions.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,FormData,Date,require:(name:string)=>{
      if (name === "@/lib/contact-dossier-tabs") return contactTabHelpers;
 if(name==='next/navigation')return{redirect:(url:string)=>{throw Error(url);}};
 if(name==='next/cache')return{revalidatePath:(p:string)=>invalidations.push(p)};
 if(name==='@/lib/auth-context')return{requireActiveMembership:async()=>({supabase,membership:{organization_id:org}})};
 if(name==='@/lib/supabase/configured')return{isSupabaseConfigured:()=>true};
 if(name==='@/lib/format')return{localDateTimeToIso:()=>null};
 if(name==='@/lib/dossier-relations')return{dossierEntityTypes:['project','event','campaign','content','partner','community_person','task']};
 if(name==='@/lib/project-outcomes')return{projectOutcomeShape:{}};return require(name);}});
 const run=(values:Record<string,unknown>={})=>{const f=new FormData();Object.entries({title:'Fixture',...values}).forEach(([k,v])=>f.set(k,String(v)));return m.exports.createTask(f);};return{run,calls,invalidations};}
test('Taakbundel gebruikt één RPC met verantwoordelijke, checklist en context',async()=>{const f=fixture();await assert.rejects(f.run({assignee_id:id,project_id:id,checklist:'- Eerste\n\n* Tweede',context_entity_type:'event',context_entity_id:id,return_to:`/app/events/${id}`}),/succes=taak-aangemaakt/);assert.equal(f.calls.length,1);assert.deepEqual(Array.from(f.calls[0].p_checklist as string[]),['Eerste','Tweede']);assert.equal(f.calls[0].p_assignee_id,id);assert.equal(f.calls[0].p_organization_id,org);assert.equal(f.calls[0].p_context_entity_type,'event');assert.equal(f.calls[0].p_context_entity_id,id);assert(f.invalidations.includes(`/app/projecten/${id}`));});
test('Mislukte of ontbrekende bundel geeft geen succes of verversing',async()=>{for(const [data,error] of [[null,null],[id,{message:'failed'}],['invalid-id',null]]){const f=fixture(data,error);await assert.rejects(f.run(),/fout=opslaan/);assert.deepEqual(f.invalidations,[]);}});
test('Ongeldige checklist en onvolledige context stoppen vóór opslag',async()=>{for(const values of [{checklist:'x'.repeat(241)},{context_entity_type:'event'},{context_entity_id:id}]){const f=fixture();await assert.rejects(f.run(values),/fout=velden/);assert.deepEqual(f.calls,[]);}});
test('Aanmaak zonder extra velden behoudt defaults en bestaande taakcontextgedrag',async()=>{const f=fixture();await assert.rejects(f.run({title:'',context_entity_type:'task',context_entity_id:id}),/succes=taak-aangemaakt/);assert.equal(f.calls[0].p_title,'Naamloze taak');assert.equal(f.calls[0].p_priority,'normal');assert.equal(f.calls[0].p_project_id,null);assert.equal(f.calls[0].p_assignee_id,null);assert.equal(f.calls[0].p_context_entity_type,null);assert.equal(f.calls[0].p_context_entity_id,null);});
