import * as contactTabHelpers from "../src/lib/contact-dossier-tabs.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { hasPermission } from "../src/lib/permissions.ts";
import { toPersonPickerOptions } from "../src/lib/person-picker.ts";
const require=((native) => (name: string) => name === "@/lib/contact-dossier-tabs" ? contactTabHelpers : native(name))(createRequire(import.meta.url));
function load(path:string, overrides:Record<string,unknown>){
 const compiled={exports:{} as Record<string,unknown>};
 const code=ts.transpileModule(readFileSync(new URL(`../${path}`,import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 runInNewContext(code,{module:compiled,exports:compiled.exports,FormData,Date,URLSearchParams,require:(key:string)=>key==="@/components/dossier-editor-gate"?{dossierEditorGate:async()=>null}:key in overrides?overrides[key]:require(key)});return compiled.exports;
}
const id="11111111-1111-4111-8111-111111111111";
const actions=["create","edit","add","toggle","update","delete","join","remove","archive","restore","softdelete"];
function fixture(role:string,caps:string[]=[],saved=true,failed=false,parent=true,candidate=true,existing:Record<string,unknown>={status:"planned"}){
 const writes:{table:string;value:unknown}[]=[],invalidations:string[]=[],filters:unknown[]=[];
 const supabase={from:(table:string)=>{
  let writing=false;const q:Record<string,unknown>={};
  for(const key of ["eq","is","select"])q[key]=(...args:unknown[])=>{filters.push([table,key,...args]);return q;};
  for(const key of ["insert","update","upsert","delete"])q[key]=(value:unknown)=>{writing=true;writes.push({table,value});return q;};
  const result=()=>({data:writing?(saved?{id}:null):table==="projects"?(parent?{id,...existing}:null):table==="organization_members"?(candidate?{user_id:id}:null):null,error:writing&&failed?{message:"fixture"}:null});
  q.single=q.maybeSingle=async()=>result();q.then=(resolve:(value:unknown)=>unknown)=>Promise.resolve(result()).then(resolve);return q;
 }};
 const overrides:Record<string,unknown>={
  "next/cache":{revalidatePath:(p:string)=>invalidations.push(p)},"next/navigation":{redirect:(p:string)=>{throw Error(p);}},
  "@/lib/auth-context":{requirePermission:async(cap:"manageProjects",fallback:string)=>{assert.equal(cap,"manageProjects");if(!hasPermission({role,finance_role:"none",capabilities:caps},cap))throw Error(fallback);return {supabase,user:{id},membership:{organization_id:"fixture-org",role}};}},
  "@/lib/project-outcomes":load("src/lib/project-outcomes.ts",{}),
  "@/lib/google-workspace":{},"@/lib/supabase/configured":{isSupabaseConfigured:()=>true},"@/lib/dossier-relations":{dossierEntityTypes:["project","task"]},"@/lib/format":{localDateTimeToIso:()=>null},
 };
 overrides["@/lib/record-lifecycle"]=load("src/lib/record-lifecycle.ts",{});
 const detail=load("src/app/app/projecten/[id]/actions.ts",overrides),base=load("src/app/app/actions.ts",overrides),lifecycle=load("src/app/app/lifecycle-actions.ts",overrides);
 return {writes,invalidations,filters,run:async(mode:string,values:Record<string,string>={})=>{
  const form=new FormData();for(const [k,v]of Object.entries({id,project_id:id,user_id:id,title:"TESTFIXTURE",priority:"normal",status:"planned",is_done:"true",enabled:mode==="join"?"true":"false",entity:"project",action:mode==="softdelete"?"delete":mode,confirmation:"VERWIJDER"}))form.set(k,v);
  for(const [key,value] of Object.entries(values))form.set(key,value);
  const names:Record<string,string>={edit:"updateProject",add:"addMilestone",toggle:"toggleMilestone",update:"updateMilestone",delete:"deleteMilestone",join:"setProjectMember",remove:"setProjectMember"};
  const fn=mode==="create"?base.createProject:names[mode]?detail[names[mode]]:lifecycle.changeRecordLifecycle;
  try{await(fn as(f:FormData)=>Promise<void>)(form);return "returned";}catch(e){return (e as Error).message;}
 }};
}
for(const c of [{role:"admin",caps:[]},{role:"board",caps:[]},{role:"member",caps:[]},{role:"volunteer",caps:["manageProjects"]}])test(`Projectacties toegestaan voor ${c.role} ${c.caps.join()}`,async()=>{
 for(const mode of actions){const f=fixture(c.role,c.caps);assert.doesNotMatch(await f.run(mode),/fout=/,mode);assert.ok(f.writes.length,mode);assert.ok(f.invalidations.length,mode);}
});
test("Vrijwilliger zonder Project-bevoegdheid heeft geen schrijfacties",async()=>{for(const mode of actions){const f=fixture("volunteer");assert.match(await f.run(mode),/fout=/);assert.equal(f.writes.length,0);assert.equal(f.invalidations.length,0);}});
for(const failed of [false,true])test(`Geen succes, activiteit of invalidatie bij ${failed?"databasefout":"nul gewijzigde rijen"}`,async()=>{for(const mode of actions){const f=fixture("member",[],false,failed);assert.match(await f.run(mode),/fout=/,mode);assert.equal(f.invalidations.length,0);assert.ok(!f.writes.some(w=>w.table==="activity_events"));}});
test("Mijlpalen en teamacties weigeren een ontbrekend, verwijderd of organisatievreemd project",async()=>{for(const mode of ["add","toggle","update","delete","join","remove"]){const f=fixture("member",[],true,false,false);assert.match(await f.run(mode),/fout=project/);assert.equal(f.writes.length,0);assert.ok(f.filters.some(v=>JSON.stringify(v).includes('"deleted_at"')));assert.ok(f.filters.some(v=>JSON.stringify(v).includes('"organization_id"')));}});
test("Projectteam toevoegen weigert een niet-actieve of niet-zichtbare organisatiekandidaat",async()=>{const f=fixture("member",[],true,false,true,false);assert.match(await f.run("join"),/fout=team/);assert.equal(f.writes.length,0);assert.equal(f.invalidations.length,0);});

test("Projectwijzigingen en mijlpaalformulieren keren terug naar het geselecteerde tabblad",async()=>{
 for(const mode of ["edit","update","delete"]){
  const tab=mode==="edit"?"financien":"planning";
  assert.match(await fixture("member").run(mode,{dossier_tab:tab}),new RegExp(`succes=.*&tab=${tab}$`));
  assert.match(await fixture("member",[],false,true).run(mode,{dossier_tab:tab}),new RegExp(`fout=.*&tab=${tab}$`));
 }
 assert.doesNotMatch(await fixture("member").run("edit",{dossier_tab:"account"}),/&tab=/);
});

test("Projectscherm en directe bewerklink respecteren rollen voor team en mijlpalen",async()=>{
 for(const c of [{role:"admin",caps:[],allowed:true},{role:"board",caps:[],allowed:true},{role:"member",caps:[],allowed:true},{role:"volunteer",caps:[],allowed:false},{role:"volunteer",caps:["manageProjects"],allowed:true}]){
  const supabase={from:(table:string)=>{const q:Record<string,unknown>={};for(const k of ["select","eq","is","order","limit","neq"])q[k]=()=>q;
   const data=table==="projects"?{id,title:"TESTFIXTURE",status:"planned",priority:"normal"}:table==="project_milestones"?[{id,title:"TESTFIXTURE mijlpaal",is_done:false}]:table==="organization_members"?[{user_id:id,profiles:{display_name:"TESTFIXTURE persoon"}}]:[];
   q.maybeSingle=async()=>({data:table==="projects"?data:null});q.then=(resolve:(v:unknown)=>unknown)=>Promise.resolve({data}).then(resolve);return q;}};
  const noop=()=>null,stubs:Record<string,unknown>={"@/lib/project-outcomes":load("src/lib/project-outcomes.ts",{}),"next/link":{default:({children,...props}:React.PropsWithChildren<Record<string,unknown>>)=>React.createElement("a",props,children)},"next/navigation":{notFound:()=>{throw Error("404");}},"@/lib/auth-context":{requireActiveMembership:async()=>({supabase,membership:{role:c.role,finance_role:"none",capabilities:c.caps,organization_id:"fixture-org"}})},"@/lib/permissions":{hasPermission},"@/lib/format":{formatDate:()=>"",formatDateTime:()=>"",formatDateTimeLocal:()=>""},"@/lib/dossier-relations":{loadDossierConnections:async()=>({links:[],documents:[],relationships:[]}),loadRelationOptions:async()=>[]}};
  const src=readFileSync(new URL("../src/app/app/projecten/[id]/page.tsx",import.meta.url),"utf8");
  for(const match of src.matchAll(/import \{([^}]+)\} from "(@\/components\/[^"]+)"/g)){const exports:Record<string,unknown>={};for(const name of match[1].split(',').map(n=>n.trim()))exports[name]=({children}:React.PropsWithChildren)=>React.createElement('section',null,children);stubs[match[2]]=exports;}
  for(const key of ["../../actions","../../operations/actions","../../taken/[id]/actions","./actions"])stubs[key]=new Proxy({},{get:()=>noop});
  stubs["@/lib/person-picker"]={toPersonPickerOptions};
  const page=load("src/app/app/projecten/[id]/page.tsx",stubs).default as(p:unknown)=>Promise<React.ReactNode>;
  const html=renderToStaticMarkup(await page({params:Promise.resolve({id}),searchParams:Promise.resolve({bewerken:"1",mijlpaal:id})}));
  assert.equal(html.includes('name="title"'),c.allowed,`${c.role} direct form`);
  assert.equal(html.includes('aria-label="TESTFIXTURE mijlpaal afronden"'),c.allowed);
  const teamHtml=renderToStaticMarkup(await page({params:Promise.resolve({id}),searchParams:Promise.resolve({tab:"team"})}));
  assert.equal(teamHtml.includes('class="member-on"')||teamHtml.includes('>Toevoegen</button>'),c.allowed);
 }
});

const completedOutcomes={goal:"TESTFIXTURE doel",deliverables:"TESTFIXTURE oplevering",acceptance_criteria:"TESTFIXTURE criterium",closure_evaluation:"TESTFIXTURE uitkomst met bron en vervolgactie"};
test("Nieuwe projectafsluiting vereist doel, resultaten, criteria en evaluatie zonder statusmutatie bij ontbrekende info",async()=>{
 for(const key of Object.keys(completedOutcomes)){
  const f=fixture("member");const values={...completedOutcomes,status:"done",[key]:" \n\t "};
  assert.match(await f.run("edit",values),/bewerken=1&fout=afsluiting/);assert.equal(f.writes.length,0);assert.equal(f.invalidations.length,0);
 }
});
test("Volledige afsluiting slaat de vier velden op na expliciete statuskeuze",async()=>{
 const f=fixture("member");assert.match(await f.run("edit",{...completedOutcomes,status:"done"}),/succes=project/);
 const written=f.writes.find(w=>w.table==="projects")!.value as Record<string,unknown>;
 for(const [key,value]of Object.entries(completedOutcomes))assert.equal(written[key],value);
 assert.equal(written.status,"done");
});
test("Historisch afgerond project blijft bewerkbaar zonder verzonnen uitkomst",async()=>{
 const f=fixture("member",[],true,false,true,true,{status:"done"});assert.match(await f.run("edit",{status:"done"}),/succes=project/);
 const written=f.writes.find(w=>w.table==="projects")!.value as Record<string,unknown>;
 assert.equal(written.goal,undefined);assert.equal(written.closure_evaluation,undefined);
});
test("Ontbrekende formuliervelden behouden bestaande afsluitinformatie",async()=>{
 const f=fixture("member",[],true,false,true,true,{status:"active",...completedOutcomes});assert.match(await f.run("edit",{status:"done"}),/succes=project/);
 const written=f.writes.find(w=>w.table==="projects")!.value as Record<string,unknown>;assert.equal(written.acceptance_criteria,undefined);
});
test("Project aanmaken bewaart afzonderlijke doel- en oplevervelden",async()=>{
 const f=fixture("member");assert.match(await f.run("create",completedOutcomes),/succes=aangemaakt/);
 const written=f.writes.find(w=>w.table==="projects")!.value as Record<string,unknown>;assert.equal(written.goal,completedOutcomes.goal);assert.equal(written.status,"planned");
});

test("Projectformulieren bewaren vier afzonderlijke velden en vragen geen evaluatie bij aanmaken",()=>{
 const component=load("src/components/project-outcome-fields.tsx",{
  "@/lib/project-outcomes":load("src/lib/project-outcomes.ts",{}),
  "@/components/markdown-field":{MarkdownField:({name,label,defaultValue}: {name:string;label:string;defaultValue?:string|null})=>React.createElement("label",null,label,React.createElement("textarea",{name,defaultValue:defaultValue??""}))},
 }).ProjectOutcomeFields as React.ComponentType<{project?:Record<string,string>;evaluation?:boolean}>;
 const edit=renderToStaticMarkup(React.createElement(component,{project:completedOutcomes}));
 for(const [key,value]of Object.entries(completedOutcomes)){assert.ok(edit.includes(`name="${key}"`));assert.ok(edit.includes(value));}
 const create=renderToStaticMarkup(React.createElement(component,{evaluation:false}));
 assert.ok(create.includes('name="goal"'));assert.ok(create.includes('name="deliverables"'));assert.ok(create.includes('name="acceptance_criteria"'));assert.ok(!create.includes('name="closure_evaluation"'));
});
