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
  runInNewContext(ts.transpileModule(readFileSync(new URL("../src/app/app/events/[id]/material-actions.ts",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {module:compiled,exports:compiled.exports,FormData,require:(key:string)=>key in overrides?overrides[key]:require(key)});
  return {writes,filters,invalidations,run:async(values:Record<string,string>={},mode="saveEventMaterial")=>{
    const form=new FormData();for(const [key,value]of Object.entries({event_id:eventId,name:"TESTFIXTURE statief",quantity:"2",source:"borrowed",status:"needed",...values}))form.set(key,value);
    try{await compiled.exports[mode](form);return "returned";}catch(error){return (error as Error).message;}
  }};
}

test("eventbeheerders kunnen materiaal toevoegen, bewerken en van de eventlijst verwijderen",async()=>{
  for(const role of ["admin","board","member"])for(const mode of ["create","edit","delete"]){
    const f=fixture(role);assert.match(await f.run(mode==="create"?{}:{id:itemId},mode==="delete"?"deleteEventMaterial":"saveEventMaterial"),/succes=materiaal-/);
    assert.equal(f.writes.length,1);assert.equal(f.writes[0].table,"event_materials");assert.equal(f.invalidations.length,1);
    if(mode!=="create")for(const key of ["organization_id","event_id","id"])assert.ok(f.filters.some(filter=>filter[2]===key));
  }
});
test("vrijwilliger zonder bevoegdheid kan niet schrijven; expliciete Events-bevoegdheid blijft werken",async()=>{
  for(const mode of ["saveEventMaterial","deleteEventMaterial"]){const f=fixture("volunteer");assert.match(await f.run({id:itemId},mode),/geen-toegang/);assert.equal(f.writes.length,0);}
  const f=fixture("volunteer",true,false,["manageEvents"]);assert.match(await f.run(),/succes=materiaal-opgeslagen/);
});
test("ongeldige aantallen, namen, onbestaande tijden en omgekeerde retourtijd schrijven niets",async()=>{
  const cases:Record<string,string>[]=[{quantity:"0"},{quantity:"-1"},{quantity:"1.5"},{name:" "},{pickup_at:"ongeldig"},{pickup_at:"2026-03-29T02:30"},{pickup_at:"2026-10-08T14:00",return_at:"2026-10-08T13:00"}];
  for(const values of cases){
    const f=fixture();assert.match(await f.run(values),/fout=materiaal-velden/);assert.equal(f.writes.length,0);assert.equal(f.invalidations.length,0);
  }
});
test("nul gewijzigde rijen en databasefouten melden geen succes en veranderen geen inventaris",async()=>{
  for(const error of [false,true])for(const mode of ["saveEventMaterial","deleteEventMaterial"]){
    const f=fixture("member",false,error);assert.match(await f.run({id:itemId},mode),/fout=materiaal-/);assert.equal(f.invalidations.length,0);assert.ok(f.writes.every(write=>write.table==="event_materials"));
  }
});
test("registeritem kan zonder dubbele naam worden gekoppeld en Brusselse tijden worden omgezet",async()=>{
  const f=fixture();assert.match(await f.run({asset_id:itemId,name:"",pickup_at:"2026-10-08T14:00"}),/succes=/);
  const data=f.writes[0].value as Record<string,unknown>;assert.equal(data.asset_id,itemId);assert.equal(data.pickup_at,"2026-10-08T12:00:00.000Z");assert.equal(data.organization_id,"fixture-org");
});
