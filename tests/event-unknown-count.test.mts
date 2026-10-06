import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
const require=createRequire(import.meta.url);
const id="11111111-1111-4111-8111-111111111111";
const timingModule={exports:{} as Record<string,unknown>};
runInNewContext(ts.transpileModule(readFileSync(new URL("../src/lib/format.ts",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:timingModule,exports:timingModule.exports,Date,Intl});
function fixture(update=false) {
  const writes:Record<string,unknown>[]=[];const filters:unknown[][]=[];
  let calendarCalls=0;
  const supabase={from:(table:string)=>{
    const q:Record<string,unknown>={then:(yes:(v:unknown)=>unknown)=>Promise.resolve({error:null}).then(yes)};
    for(const method of ["select","eq","is"])q[method]=(...args:unknown[])=>{filters.push([table,method,...args]);return q;};
    for(const method of ["insert","update"])q[method]=(row:Record<string,unknown>)=>{writes.push(row);return q;};
    q.maybeSingle=q.single=async()=>({data:{id},error:null});return q;
  }};
  const source=readFileSync(new URL("../src/app/app/events/actions.ts",import.meta.url),"utf8");
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  const compiled={exports:{} as Record<string,unknown>};
  const overrides:Record<string,unknown>={
    "next/cache":{revalidatePath:()=>undefined},"next/navigation":{redirect:(url:string)=>{throw Error(url);}},
    "@/lib/auth-context":{requirePermission:async()=>({supabase,user:{id:"fixture-owner"},membership:{role:"admin",organization_id:"fixture-org"}})},
    "@/lib/format":timingModule.exports,"@/lib/linked-calendar-sync":{syncLinkedEvent:async()=>{calendarCalls++;}},
  };
  runInNewContext(code,{module:compiled,exports:compiled.exports,require:(key:string)=>key in overrides?overrides[key]:require(key),Date});
  return {writes,filters,calendarCalls:()=>calendarCalls,run:(value?:string)=>{
    const form=new Map([["title","TESTFIXTURE — NIET PUBLICEREN"],["event_type","lan"],["status","completed"],["priority","normal"],["role_besc","participant"]]);
    if(update)form.set("id",id);if(value!==undefined)form.set("expected_attendees",value);
    return (compiled.exports.saveEvent as(f:unknown)=>Promise<void>)(form);
  }};
}
for(const value of [undefined,"","   "])test("Nieuw event bewaart leeg of afwezig deelnemersaantal als null",async()=>{
  const f=fixture();await assert.rejects(f.run(value),/succes=1$/);assert.equal(f.writes[0].expected_attendees,null);
  assert.equal(f.writes[0].status,"completed");assert.equal(f.writes[0].role_besc,"participant");assert.equal(f.calendarCalls(),0);
});
for(const [input,expected] of [["0",0],["25",25]] as const)test("Expliciet deelnemersaantal blijft behouden",async()=>{
  const f=fixture();await assert.rejects(f.run(input),/succes=1$/);assert.equal(f.writes[0].expected_attendees,expected);
});
for(const value of ["-1","1.5","onbekend"])test("Ongeldig deelnemersaantal leidt niet tot een recordwrite",async()=>{
  const f=fixture();await assert.rejects(f.run(value),/fout=velden$/);assert.equal(f.writes.length,0);assert.equal(f.calendarCalls(),0);
});
for(const [input,expected] of [["",null],["0",0]] as const)test("Update onderscheidt onbekend van nul en behoudt organisatiefilter",async()=>{
  const f=fixture(true);await assert.rejects(f.run(input),/succes=1$/);assert.equal(f.writes[0].expected_attendees,expected);
  assert.ok(f.filters.some(r=>r[1]==="eq"&&r[2]==="organization_id"&&r[3]==="fixture-org"));
  assert.equal(f.calendarCalls(),1);
});
