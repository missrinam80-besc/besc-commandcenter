import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { hasPermission } from "../src/lib/permissions.ts";
import { formatDateTimeLocal, localDateTimeToIso } from "../src/lib/format.ts";

const eventId="10000000-0000-4000-8000-000000000001", itemId="20000000-0000-4000-8000-000000000001";
function fixture(role="member", saved=true, error=false, capabilities:string[]=[]) {
  const writes:{table:string;kind:string;value:unknown}[]=[],filters:unknown[][]=[],invalidations:string[]=[];
  const supabase={from:(table:string)=>{
    const q:Record<string,unknown>={};
    for(const method of ["eq","select"])q[method]=(...args:unknown[])=>{filters.push([table,method,...args]);return q;};
    for(const method of ["insert","update","delete"])q[method]=(value:unknown)=>{writes.push({table,kind:method,value});return q;};
    q.maybeSingle=async()=>({data:saved?{id:itemId}:null,error:error?{message:"fixture failure"}:null});return q;
  }};
  const overrides:Record<string,unknown>={
    "next/navigation":{redirect:(url:string)=>{throw Error(url);}},
    "next/cache":{revalidatePath:(url:string)=>invalidations.push(url)},
    "@/lib/format":{formatDateTimeLocal,localDateTimeToIso},
    "@/lib/auth-context":{requirePermission:async(cap:string,fallback:string)=>{
      assert.equal(cap,"manageEvents");if(!hasPermission({role,capabilities,finance_role:"none"},"manageEvents"))throw Error(fallback);
      return {supabase,membership:{organization_id:"fixture-org"},user:{id:"fixture-user"}};
    }},
  };
  const require=createRequire(import.meta.url),compiled={exports:{} as Record<string,(form:FormData)=>Promise<void>>};
  runInNewContext(ts.transpileModule(readFileSync(new URL("../src/app/app/events/[id]/giveaway-actions.ts",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {module:compiled,exports:compiled.exports,FormData,require:(key:string)=>key in overrides?overrides[key]:require(key)});
  return {writes,filters,invalidations,run:async(values:Record<string,string>={},mode="saveEventGiveaway")=>{
    const form=new FormData();for(const [key,value]of Object.entries({event_id:eventId,name:"TESTFIXTURE giveaway",quantity_planned:"10",source:"supplied",status:"needed",...values}))form.set(key,value);
    try{await compiled.exports[mode](form);return "returned";}catch(error){return (error as Error).message;}
  }};
}

test("giveaways CRUD vereist Events-bevoegdheid en beperkt updates tot organisatie, event en item",async()=>{
 for(const role of ["admin","board","member"])for(const mode of ["create","edit","delete"]){const f=fixture(role);assert.match(await f.run(mode==="create"?{}:{id:itemId},mode==="delete"?"deleteEventGiveaway":"saveEventGiveaway"),/succes=giveaway-/);assert.equal(f.writes.length,1);assert.equal(f.writes[0].table,"event_giveaways");if(mode!=="create")for(const key of ["organization_id","event_id","id"])assert.ok(f.filters.some(filter=>filter[2]===key));}
 for(const mode of ["saveEventGiveaway","deleteEventGiveaway"]){const f=fixture("volunteer");assert.match(await f.run({id:itemId},mode),/geen-toegang/);assert.equal(f.writes.length,0);}
 const f=fixture("volunteer",true,false,["manageEvents"]);assert.match(await f.run(),/succes=giveaway-/);
});
test("lege tellingen blijven onbekend; bevestigde nullen blijven nul en ontvangen kan gepland overschrijden",async()=>{
 const unknown=fixture();assert.match(await unknown.run({quantity_received:"",quantity_distributed:""}),/succes=/);const u=unknown.writes[0].value as Record<string,unknown>;assert.equal(u.quantity_received,null);assert.equal(u.quantity_distributed,null);
 const zero=fixture();assert.match(await zero.run({quantity_received:"0",quantity_distributed:"0"}),/succes=/);const z=zero.writes[0].value as Record<string,unknown>;assert.equal(z.quantity_received,0);assert.equal(z.quantity_distributed,0);
 const over=fixture();assert.match(await over.run({quantity_received:"20",quantity_distributed:"15",person_id:itemId}),/succes=/);const v=over.writes[0].value as Record<string,unknown>;assert.equal(v.responsible_person_id,itemId);assert.ok(!("person_id" in v));
});
test("ongeldige aantallen, teveel uitgedeeld en ongekende ontvangst schrijven niets",async()=>{
 const cases:Record<string,string>[]=[{quantity_planned:"0"},{quantity_received:"-1"},{quantity_distributed:"1.5"},{quantity_planned:"100001"},{quantity_received:"abc"},{name:" "},{source:"invalid"},{status:"invalid"},{person_id:"invalid"},{quantity_received:"3",quantity_distributed:"4"},{quantity_distributed:"1"}];
 for(const values of cases){const f=fixture();assert.match(await f.run(values),/fout=giveaway-velden/);assert.equal(f.writes.length,0);assert.equal(f.invalidations.length,0);}
});
test("nul gewijzigde rijen en databasefouten melden geen succes of wijzigingen aan andere registers",async()=>{
 for(const error of [false,true])for(const mode of ["saveEventGiveaway","deleteEventGiveaway"]){const f=fixture("member",false,error);assert.match(await f.run({id:itemId},mode),/fout=giveaway-/);assert.equal(f.invalidations.length,0);assert.ok(f.writes.every(w=>w.table==="event_giveaways"));}
});
