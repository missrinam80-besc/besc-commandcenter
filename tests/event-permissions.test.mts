import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { hasPermission } from "../src/lib/permissions.ts";
const require=createRequire(import.meta.url);
const id="11111111-1111-4111-8111-111111111111";
const timingModule={exports:{} as Record<string,unknown>};
runInNewContext(ts.transpileModule(readFileSync(new URL("../src/lib/format.ts",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:timingModule,exports:timingModule.exports,Date,Intl});
function fixture(role="member", capabilities:string[]=[], update=false, saved=true) {
  const writes:Record<string,unknown>[]=[];const filters:unknown[][]=[];
  let calendarCalls=0;
  const supabase={from:(table:string)=>{
    const q:Record<string,unknown>={then:(yes:(v:unknown)=>unknown)=>Promise.resolve({error:null}).then(yes)};
    for(const method of ["select","eq","is"])q[method]=(...args:unknown[])=>{filters.push([table,method,...args]);return q;};
    for(const method of ["insert","update"])q[method]=(row:Record<string,unknown>)=>{writes.push(row);return q;};
    q.maybeSingle=q.single=async()=>({data:saved?{id}:null,error:null});return q;
  }};
  const source=readFileSync(new URL("../src/app/app/events/actions.ts",import.meta.url),"utf8");
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  const compiled={exports:{} as Record<string,unknown>};
  const overrides:Record<string,unknown>={
    "next/cache":{revalidatePath:()=>undefined},"next/navigation":{redirect:(url:string)=>{throw Error(url);}},
    "@/lib/auth-context":{requirePermission:async(cap:string)=>{
      assert.equal(cap,"manageEvents");
      if(!hasPermission({role,capabilities,finance_role:"none"},cap))throw Error("denied");
      return {supabase,user:{id:"fixture-owner"},membership:{role,organization_id:"fixture-org"}};
    }},
    "@/lib/format":timingModule.exports,"@/lib/linked-calendar-sync":{syncLinkedEvent:async()=>{calendarCalls++;}},
  };
  runInNewContext(code,{module:compiled,exports:compiled.exports,require:(key:string)=>key in overrides?overrides[key]:require(key),Date});
  return {writes,filters,calendarCalls:()=>calendarCalls,run:(value?:string, cancel=false)=>{
    const form=new Map([["title","TESTFIXTURE — NIET PUBLICEREN"],["event_type","lan"],["status","completed"],["priority","normal"],["role_besc","participant"]]);
    if(update)form.set("id",id);if(value!==undefined)form.set("expected_attendees",value);
    return ((cancel?compiled.exports.cancelEvent:compiled.exports.saveEvent) as(f:unknown)=>Promise<void>)(form);
  }};
}

for(const role of ["admin","board","member"])test(`${role} kan events aanmaken, bewerken en annuleren`,async()=>{
 for(const mode of ["create","edit","cancel"]){
  const f=fixture(role,[],mode!=="create");
  await assert.rejects(f.run(undefined,mode==="cancel"),/succes=/);
  assert.equal(f.writes.length,1);
 }
});
test("Vrijwilliger zonder Events-bevoegdheid kan geen enkele eventmutatie uitvoeren",async()=>{
 for(const mode of ["create","edit","cancel"]){
  const f=fixture("volunteer",[],mode!=="create");
  await assert.rejects(f.run(undefined,mode==="cancel"),/denied/);
  assert.equal(f.writes.length,0);assert.equal(f.calendarCalls(),0);
 }
});
test("Vrijwilliger met expliciete Events-bevoegdheid kan bewerken",async()=>{
 const f=fixture("volunteer",["manageEvents"],true);
 await assert.rejects(f.run(),/succes=1/);assert.equal(f.writes.length,1);
});
for(const cancel of [false,true])test("Geen gewijzigde rij geeft geen succes of kalendermutatie",async()=>{
 const f=fixture("member",[],true,false);
 await assert.rejects(f.run(undefined,cancel),/fout=opslaan/);assert.equal(f.calendarCalls(),0);
});
