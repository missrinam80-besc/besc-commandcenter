import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {runInNewContext} from "node:vm";
import ts from "typescript";
import {editorLoader} from "./helpers/editor-loader.mts";
const org="10000000-0000-4000-8000-000000000001",user="20000000-0000-4000-8000-000000000001",id="30000000-0000-4000-8000-000000000001";
const png=new Uint8Array([137,80,78,71,13,10,26,10,1,2,3,4]);
function fixture(mode="ok"){
 const calls:{name:string;args:Record<string,unknown>}[]=[],storage:string[]=[],invalidations:string[]=[];
 const supabase={
  rpc:async(name:string,args:Record<string,unknown>)=>{calls.push({name,args});return {data:id,error:mode==="prepare-fail"&&name==="prepare_expense_intake"?{code:"40001"}:mode==="finish-fail"&&name==="finish_expense_intake"?{code:"fixture"}:null};},
  storage:{from:(bucket:string)=>{
   assert.equal(bucket,"expense-proofs");
   return {upload:async(path:string)=>{storage.push(path);return {error:mode==="lost-upload"?{message:"fixture"}:null};},download:async()=>({data:new Blob([png],{type:"image/png"}),error:null})};
  }}
 };
 const dependencies:Record<string,unknown>={
  "next/cache":{revalidatePath:(s:string)=>invalidations.push(s)},
  "@/lib/expense-intake":editorLoader()("src/lib/expense-intake.ts"),
  "@/lib/auth-context":{requirePermission:async(cap:string)=>{assert.equal(cap,"submitExpenses");return {membership:{organization_id:org},user:{id:user},supabase};}}
 };
 const native=createRequire(import.meta.url),compiled={exports:{} as {submitExpenseIntake:(f:FormData)=>Promise<{ok:boolean;message:string}>}};
 runInNewContext(ts.transpileModule(readFileSync("src/app/app/financien/intake-actions.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:compiled,exports:compiled.exports,File,Uint8Array,require:(key:string)=>key in dependencies?dependencies[key]:native(key)});
 const form=(file?:File)=>{const f=new FormData();for(const [k,v] of Object.entries({id,title:"TESTFIXTURE kost",amount:"12.25",expense_date:"2026-10-14",supplier:"TESTFIXTURE",invoice_number:"BON",claimant_name:"TESTFIXTURE",notes:"Toelichting",event_id:""}))f.set(k,v);if(file)f.set("proof",file);return f;};
 return {calls,storage,invalidations,form,submit:compiled.exports.submitExpenseIntake};
}
test("indienen zonder bewijs gaat naar inbox-RPC, nooit rechtstreeks naar expenses",async()=>{const f=fixture();assert.equal((await f.submit(f.form())).ok,true);assert.deepEqual(f.calls.map(c=>c.name),["prepare_expense_intake","finish_expense_intake"]);assert.equal(f.storage.length,0);assert.ok(f.invalidations.includes("/app/inbox"));});
test("bewijsupload bewaart actor/org-pad en herstelt een verloren uploadantwoord",async()=>{for(const mode of ["ok","lost-upload"]){const f=fixture(mode);assert.equal((await f.submit(f.form(new File([png],"TESTFIXTURE.png",{type:"image/png"})))).ok,true);assert.equal(f.storage[0],`${org}/${user}/${id}/proof.png`);assert.equal(f.calls[1].name,"finish_expense_intake");}});
test("verkeerd bestand, bestand boven 5 MB en ongeldige velden schrijven niets",async()=>{for(const file of [new File(["html"],"bad.png",{type:"image/png"}),new File([png],"bad.svg",{type:"image/svg+xml"}),new File([new Uint8Array(5242881)],"big.png",{type:"image/png"})]){const f=fixture();assert.equal((await f.submit(f.form(file))).ok,false);assert.equal(f.calls.length,0);}const f=fixture(),form=f.form();form.set("amount","-1");assert.equal((await f.submit(form)).ok,false);assert.equal(f.calls.length,0);});
test("conflict en finalisatiefout melden geen succes en wissen geen onzekere upload",async()=>{for(const mode of ["prepare-fail","finish-fail"]){const f=fixture(mode);assert.equal((await f.submit(f.form(new File([png],"TESTFIXTURE.png",{type:"image/png"})))).ok,false);assert.equal(f.invalidations.length,0);}});
