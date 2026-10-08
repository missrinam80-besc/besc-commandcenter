import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { hasPermission } from "../src/lib/permissions.ts";
import { canManageExpenses, canSubmitExpense } from "../src/lib/expense-permissions.ts";
import { eventFinancialTotals } from "../src/lib/event-finance.ts";
import { registrationCounts } from "../src/lib/event-registrations.ts";

const event="10000000-0000-4000-8000-000000000001", item="20000000-0000-4000-8000-000000000001";
function fixture(file:string,role="admin",finance_role="none",saved=true,eventAvailable=true) {
 const writes:{table:string;kind:string;value:unknown}[]=[],filters:unknown[][]=[],invalidations:string[]=[];
 const membership={role,finance_role,organization_id:"fixture-org"};
 const supabase={from:(table:string)=>{
  const q:Record<string,unknown>={};
  for(const method of ["eq","select","is"])q[method]=(...args:unknown[])=>{filters.push([table,method,...args]);return q;};
  for(const method of ["insert","update","delete","upsert"])q[method]=(value:unknown)=>{writes.push({table,kind:method,value});return q;};
  const result=()=>({data:table==="events"?(eventAvailable?{id:event}:null):saved?{id:item,event_id:event}:null,error:null});
  q.maybeSingle=async()=>result();q.single=async()=>result();return q;
 }};
 const context={supabase,membership,user:{id:"fixture-user"}};
 const overrides:Record<string,unknown>={
  "next/navigation":{redirect:(url:string)=>{throw Error(url);}},"next/cache":{revalidatePath:(url:string)=>invalidations.push(url)},
  "@/lib/permissions":{hasPermission},"@/lib/expense-permissions":{canManageExpenses,canSubmitExpense},
  "@/lib/auth-context":{requireActiveMembership:async()=>context,requirePermission:async(cap:string,fallback:string)=>{if(!hasPermission(membership,cap as never))throw Error(fallback);return context;}},
 };
 const require=createRequire(import.meta.url),compiled={exports:{} as Record<string,(form:FormData)=>Promise<void>>};
 runInNewContext(ts.transpileModule(readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:compiled,exports:compiled.exports,FormData,require:(key:string)=>key in overrides?overrides[key]:require(key)});
 return {writes,filters,invalidations,run:async(mode:string,values:Record<string,string>)=>{const fd=new FormData();for(const[k,v]of Object.entries(values))fd.set(k,v);try{await compiled.exports[mode](fd);return "returned";}catch(error){return(error as Error).message;}}};
}
test("inschrijvingsinstellingen bewaren onbekende capaciteit en vereisen een veilige externe URL",async()=>{
 const file="src/app/app/events/[id]/registration-actions.ts";
 const invalid:Record<string,string>[]=[{mode:"external",external_url:""},{mode:"external",external_url:"javascript:alert(1)"},{mode:"invalid"},{mode:"none",capacity:"0"},{mode:"internal",capacity:"1.5"}];
 for(const values of invalid) {
  const f=fixture(file);assert.match(await f.run("saveRegistrationSettings",{event_id:event,...values}),/fout=inschrijving-/);assert.equal(f.writes.length,0);
 }
 const f=fixture(file);assert.match(await f.run("saveRegistrationSettings",{event_id:event,mode:"internal",capacity:""}),/succes=/);
 assert.equal((f.writes[0].value as Record<string,unknown>).capacity,null);
 const denied=fixture(file,"volunteer");assert.match(await denied.run("saveRegistrationSettings",{event_id:event,mode:"none"}),/geen-toegang/);assert.equal(denied.writes.length,0);
});
test("deelnemers CRUD is begrensd en nul getroffen rijen worden niet als opgeslagen gemeld",async()=>{
 const file="src/app/app/events/[id]/registration-actions.ts",values={event_id:event,id:item,name:"TESTFIXTURE naam",quantity:"2",status:"registered"};
 for(const mode of ["saveEventRegistration","deleteEventRegistration"]){
  const f=fixture(file,"member");assert.match(await f.run(mode,values),/succes=/);for(const key of ["organization_id","event_id","id"])assert.ok(f.filters.some(filter=>filter[2]===key));
  const missing=fixture(file,"member","none",false);assert.match(await missing.run(mode,values),/fout=/);assert.equal(missing.invalidations.length,0);
  const denied=fixture(file,"volunteer");assert.match(await denied.run(mode,values),/geen-toegang/);assert.equal(denied.writes.length,0);
 }
 for(const quantity of ["0","-1","1.5","1001"]){const f=fixture(file);assert.match(await f.run("saveEventRegistration",{...values,quantity}),/fout=/);assert.equal(f.writes.length,0);}
});
test("eventfinanciën gebruiken bestaande bevoegdheden, relaties en een gecontroleerde terugkeer",async()=>{
 const file="src/app/app/financien/actions.ts";
 for(const[mode,extra]of [["saveBudget",{name:"TESTFIXTURE budget",category:"event",status:"draft",planned_amount:"10"}],["saveIncome",{title:"TESTFIXTURE inkomst",income_type:"ticketing",status:"expected",amount:"10"}],["saveExpense",{title:"TESTFIXTURE kost",category:"event",status:"requested",amount:"10"}]] as const){
  const values={...extra,event_id:event,return_event:event};
  const f=fixture(file);assert.match(await f.run(mode,values),new RegExp(`/app/events/${event}\\?tab=financien&succes=`));
  assert.equal((f.writes[0].value as Record<string,unknown>).event_id,event);assert.ok(f.invalidations.includes(`/app/events/${event}`));
  const unavailable=fixture(file,"admin","none",true,false);assert.match(await unavailable.run(mode,values),/fout=/);assert.equal(unavailable.writes.length,0);
  const forged=fixture(file);assert.match(await forged.run(mode,{...values,return_event:item}),/fout=/);assert.equal(forged.writes.length,0);
  const missing=fixture(file,"admin","none",false);assert.match(await missing.run(mode,{...values,id:item}),/fout=/);assert.equal(missing.invalidations.length,0);
  const denied=fixture(file,"volunteer");assert.match(await denied.run(mode,values),mode==="saveExpense"?/succes=/:/geen-toegang/);assert.equal(denied.writes.length,mode==="saveExpense"?1:0);
 }
 const paid=fixture(file,"volunteer");assert.match(await paid.run("saveExpense",{event_id:event,return_event:event,title:"TESTFIXTURE",category:"event",status:"paid",amount:"10"}),/fout=/);assert.equal(paid.writes.length,0);
});
test("budgetruimte, betaalde kosten en inkomsten worden afzonderlijk berekend; onbekend budget blijft onbekend",()=>{
 const row=(status:string,amount:number)=>({id:status,title:status,status,amount});
 const totals=eventFinancialTotals([{id:"b",name:"budget",status:"active",planned_amount:100},{id:"r",name:"afgewezen",status:"rejected",planned_amount:1000}], [row("requested",20),row("paid",30),row("reimbursed",10),row("cancelled",500)], [row("expected",40),row("invoiced",50),row("received",60),row("archived",500)]);
 assert.deepEqual(totals,{planned:100,committed:60,paid:40,expected:90,received:60,available:40,result:20});
 assert.equal(eventFinancialTotals([],[],[]).available,null);
 assert.equal(eventFinancialTotals([{id:"b",name:"nul",status:"draft",planned_amount:0}],[],[]).available,0);
 assert.deepEqual(registrationCounts(["registered","attended","waitlist","cancelled"].map(status=>({id:status,name:status,status:status as never,quantity:2,notes:null}))),{reserved:4,waiting:2,attended:2});
});
