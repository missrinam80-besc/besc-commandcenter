import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { hasPermission } from "../src/lib/permissions.ts";
import { formatDateTimeLocal, localDateTimeToIso } from "../src/lib/format.ts";

const eventId="10000000-0000-4000-8000-000000000001", itemId="20000000-0000-4000-8000-000000000001";
function fixture(role="member", saved=true, error=false, capabilities:string[]=[],choicesFail=false) {
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
    "@/lib/dossier-choices-server":{loadManagedChoices:async()=>{if(choicesFail)throw Error("fixture failure");return ["program","stream","runbook","shift","custom_kind"].map(value=>({set_key:"event_schedule_items.kind",value}));}},
    "@/lib/auth-context":{requirePermission:async(cap:string,fallback:string)=>{
      assert.equal(cap,"manageEvents");if(!hasPermission({role,capabilities,finance_role:"none"},"manageEvents"))throw Error(fallback);
      return {supabase,membership:{organization_id:"fixture-org"},user:{id:"fixture-user"}};
    }},
  };
  const require=createRequire(import.meta.url),compiled={exports:{} as Record<string,(form:FormData)=>Promise<void>>};
  runInNewContext(ts.transpileModule(readFileSync(new URL("../src/app/app/events/[id]/schedule-actions.ts",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {module:compiled,exports:compiled.exports,FormData,require:(key:string)=>key in overrides?overrides[key]:require(key)});
  return {writes,filters,invalidations,run:async(values:Record<string,string>={},mode="saveEventSchedule")=>{
    const form=new FormData();for(const [key,value]of Object.entries({event_id:eventId,title:"TESTFIXTURE stream",kind:"stream",status:"draft",...values}))form.set(key,value);
    try{await compiled.exports[mode](form);return "returned";}catch(error){return (error as Error).message;}
  }};
}

test("schema beheert CRUD uitsluitend met Events-bevoegdheid en scope",async()=>{
 for(const role of ["admin","board","member"]) for(const mode of ["create","edit","delete"]){const f=fixture(role);assert.match(await f.run(mode==="create"?{}:{id:itemId},mode==="delete"?"deleteEventSchedule":"saveEventSchedule"),/succes=schema-/);assert.equal(f.writes.length,1);assert.equal(f.writes[0].table,"event_schedule_items");if(mode!=="create") for(const key of ["organization_id","event_id","id"])assert.ok(f.filters.some(filter=>filter[2]===key));}
 for(const mode of ["saveEventSchedule","deleteEventSchedule"]){const f=fixture("volunteer");assert.match(await f.run({id:itemId},mode),/geen-toegang/);assert.equal(f.writes.length,0);}
 const f=fixture("volunteer",true,false,["manageEvents"]);assert.match(await f.run(),/succes=schema-/);
});
test("ongeldige titel, type, status, persoon en tijden schrijven niets",async()=>{
 const cases:Record<string,string>[]=[{title:" "},{kind:"bad value"},{status:"unknown"},{person_id:"invalid"},{starts_at:"invalid"},{starts_at:"2026-03-29T02:30"},{ends_at:"2026-10-08T13:00"},{starts_at:"2026-10-08T14:00",ends_at:"2026-10-08T14:00"},{starts_at:"2026-10-08T14:00",ends_at:"2026-10-08T13:00"}];for(const values of cases){const f=fixture();assert.match(await f.run(values),/fout=schema-velden/);assert.equal(f.writes.length,0);}
});
test("Een beheerde nieuwe soort slaat op; onbekende of niet-controleerbare soorten schrijven niets",async()=>{
 const f=fixture();assert.match(await f.run({kind:"custom_kind"}),/succes=schema-opgeslagen/);assert.equal((f.writes[0].value as Record<string,unknown>).kind,"custom_kind");
 const missing=fixture();assert.match(await missing.run({kind:"unknown"}),/fout=schema-soort/);assert.equal(missing.writes.length,0);
 const broken=fixture("member",true,false,[],true);assert.match(await broken.run(),/fout=schema-soorten/);assert.equal(broken.writes.length,0);
});
test("nachtshift en ongetimed draaiboek slaan op zonder Calendar of dossierrollen te wijzigen",async()=>{
 const f=fixture();assert.match(await f.run({kind:"shift",starts_at:"2026-10-08T23:00",ends_at:"2026-10-09T03:00",person_id:itemId}),/succes=/);const data=f.writes[0].value as Record<string,unknown>;assert.equal(data.starts_at,"2026-10-08T21:00:00.000Z");assert.equal(data.ends_at,"2026-10-09T01:00:00.000Z");assert.equal(data.person_id,itemId);
 const g=fixture();assert.match(await g.run({kind:"runbook"}),/succes=/);assert.equal((g.writes[0].value as Record<string,unknown>).starts_at,null);assert.ok(g.writes.every(w=>w.table==="event_schedule_items"));
});
test("nul rijen en fouten melden geen succes bij opslaan of verwijderen",async()=>{
 for(const mode of ["saveEventSchedule","deleteEventSchedule"])for(const error of [false,true]){const f=fixture("member",false,error);assert.match(await f.run({id:itemId},mode),/fout=schema-/);assert.equal(f.invalidations.length,0);}
});
