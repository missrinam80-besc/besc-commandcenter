import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {readFileSync} from "node:fs";
import {editorLoader} from "./helpers/editor-loader.mts";
import {PGlite} from "@electric-sql/pglite";
import {choiceFixture,agendaChoice} from "./helpers/choice-fixture.mjs";
const org="11111111-1111-4111-8111-111111111111";
const load=editorLoader();
const choices=load("src/lib/dossier-choices.ts") as {dossierChoiceSets:()=>{key:string;editable:boolean}[];choiceValue:(s:string)=>string};
const draft=load("src/lib/dossier-editor-draft.ts") as {validateEditorIssues:(b:unknown,c:undefined,v:Record<string,string[]>)=>{field?:string}[]};

test("Alle vijftien indelingen inclusief agendasoorten zijn beheerbaar; werkstroomkeuzes blijven beschermd",()=>{
 const sets=choices.dossierChoiceSets();assert.equal(sets.filter(set=>set.editable).length,15);
 for(const key of ["events.event_type","expenses.category","administrative_documents.document_type","event_schedule_items.kind"])assert.ok(sets.find(set=>set.key===key)?.editable);
 for(const key of ["events.status","expenses.status","tasks.priority","event_schedule_items.status","google_resource_links.resource_type","social_post_variants.platform"])assert.equal(sets.find(set=>set.key===key)?.editable,false,key);
 const sql=readFileSync("supabase/migrations/20261009074806_managed_dossier_choices.sql","utf8");
 const catalog=JSON.parse(sql.match(/select '(.*)'::jsonb \$\$/)![1].replaceAll("''","'"));
 assert.equal(JSON.stringify([...catalog.map((set:{key:string})=>set.key),agendaChoice.key].sort()),JSON.stringify(sets.filter(set=>set.editable).map(set=>set.key).sort()));
});
test("Een nieuwe categorie wordt toegelaten en een verdwenen keuze gericht geweigerd",()=>{
 const bundle={kind:"event",root:{id:org,new:false,values:{event_type:"nieuw_type"},base:{id:org,title:"TESTFIXTURE",event_type:"community"}},parts:[]};
 assert.equal(draft.validateEditorIssues(bundle,undefined,{"events.event_type":["nieuw_type"]}).length,0);
 assert.equal(draft.validateEditorIssues(bundle,undefined,{"events.event_type":[]})[0].field,"event_type");
 assert.equal(choices.choiceValue(" Café / LAN "),"cafe_lan");
});
test("De fiche toont de beheerde benaming in het keuzeveld",()=>{
 const modules=editorLoader({"next/navigation":{useRouter:()=>({push(){},refresh(){}})}});
 const Editor=modules("src/components/dossier-editor.tsx").DossierEditor as React.ComponentType<Record<string,unknown>>;
 const html=renderToStaticMarkup(React.createElement(Editor,{kind:"event",id:org,mode:"edit",cancelHref:"/app",record:{id:org,title:"TESTFIXTURE",event_type:"nieuw_type"},options:{"choices:events.event_type":[{id:"nieuw_type",label:"Nieuwe evoluerende eventvorm"}]},permissions:{}}));
 assert.match(html,/<option value="nieuw_type" selected="">Nieuwe evoluerende eventvorm<\/option>/);
});
test("Het agendaformulier gebruikt beheerde benamingen en voegt verwijderde soorten niet opnieuw toe",()=>{
 const modules=editorLoader({"@/app/app/events/[id]/schedule-actions":{saveEventSchedule:()=>{}},"@/components/searchable-person-picker":{SearchablePersonPicker:()=>null}});
 const Form=modules("src/components/event-schedule-form.tsx").EventScheduleForm as React.ComponentType<Record<string,unknown>>;
 const html=renderToStaticMarkup(React.createElement(Form,{eventId:org,people:[],kinds:{program:"Hernoemd programma",test_kind:"Nieuwe soort"}}));
 assert.match(html,/<option value="program" selected="">Hernoemd programma<\/option>/);assert.match(html,/<option value="test_kind">Nieuwe soort<\/option>/);
 assert.doesNotMatch(html,/<option value="stream"|<option value="shift"|<option value="runbook"/);
});

function actionLoader(result:{data:unknown;error:unknown}){
 const calls:unknown[][]=[];
 const q={insert:(...args:unknown[])=>{calls.push(["insert",...args]);return q;},update:(...args:unknown[])=>{calls.push(["update",...args]);return q;},delete:()=>q,eq:(...args:unknown[])=>{calls.push(["eq",...args]);return q;},select:()=>q,maybeSingle:async()=>result};
 const modules=editorLoader({"next/navigation":{redirect:(href:string)=>{throw Error(href);}},"next/cache":{revalidatePath:()=>{}},"@/lib/auth-context":{requirePermission:async(capability:string)=>{assert.equal(capability,"manageUsers");return {membership:{organization_id:org},supabase:{from:()=>q}};}}});
 return {calls,actions:modules("src/app/app/beheer/keuzevelden/actions.ts") as {saveChoice:(f:FormData)=>Promise<void>;deleteChoice:(f:FormData)=>Promise<void>}};
}
function form(fields:Record<string,string>){const f=new FormData();for(const [k,v] of Object.entries(fields))f.set(k,v);return f;}
test("Een gebruikte optie geeft de specifieke beveiligingsmelding, ook na een verouderde gebruiksteller",async()=>{
 const {actions,calls}=actionLoader({data:null,error:{message:"choice_in_use",code:"23503"}});
 await assert.rejects(actions.deleteChoice(form({set_key:"events.event_type",value:"nieuw_type"})),/fout=in-gebruik/);
 assert.ok(calls.some(c=>JSON.stringify(c)===JSON.stringify(["eq","organization_id",org])));
});
test("Alleen bevestigde wijzigingen melden succes; beschermde lijsten zijn niet wijzigbaar",async()=>{
 const {actions}=actionLoader({data:null,error:null});
 await assert.rejects(actions.deleteChoice(form({set_key:"events.event_type",value:"nieuw_type"})),/fout=niet-beschikbaar/);
 await assert.rejects(actions.saveChoice(form({set_key:"events.status",label:"BAD",position:"0"})),/fout=velden/);
 const success=actionLoader({data:{value:"nieuwe_vorm"},error:null});
 await assert.rejects(success.actions.saveChoice(form({set_key:"events.event_type",label:"Nieuwe vorm",position:"4"})),/succes=opgeslagen/);
});
test("Gebruik op de beheerpagina blokkeert verwijderen en toont uitleg",async()=>{
 const Shell=({children}:React.PropsWithChildren)=>React.createElement("main",null,children);
 const Button=({message,...props}:React.ButtonHTMLAttributes<HTMLButtonElement>&{message:string})=>{void message;return React.createElement("button",props)};
 const q={select:()=>q,eq:()=>q,order:()=>q,then:(resolve:(result:unknown)=>unknown)=>Promise.resolve({data:[{set_key:"events.event_type",value:"nieuw_type",label:"TESTFIXTURE gebruikt",position:1,is_default:false}],error:null}).then(resolve)};
 const modules=editorLoader({"./keuzevelden.css":{},"@/components/app-shell":{AppShell:Shell},"@/components/confirm-submit-button":{ConfirmSubmitButton:Button},"@/lib/auth-context":{requirePermission:async()=>({membership:{organization_id:org},supabase:{from:()=>q,rpc:async()=>({data:[{set_key:"events.event_type",value:"nieuw_type",usage_count:2}],error:null})}})}});
 const Page=modules("src/app/app/beheer/keuzevelden/page.tsx").default as (p:unknown)=>Promise<React.ReactNode>;
 const html=renderToStaticMarkup(await Page({searchParams:Promise.resolve({lijst:"events.event_type"})}));
 assert.match(html,/In gebruik in 2 fiche/);assert.match(html,/<button disabled="" class="danger-button" aria-describedby="choice-usage-[^"]+">Verwijderen<\/button>/);
 assert.match(html,/Werkstroomkeuzes/);
});
test("Een mislukte gebruikscontrole blokkeert alle beheerwijzigingen",async()=>{
 const Shell=({children}:React.PropsWithChildren)=>React.createElement("main",null,children);
 const modules=editorLoader({"./keuzevelden.css":{},"@/components/app-shell":{AppShell:Shell},"@/components/confirm-submit-button":{ConfirmSubmitButton:()=>null},"@/lib/dossier-choices-server":{loadManagedChoices:async()=>[]},"@/lib/auth-context":{requirePermission:async()=>({membership:{organization_id:org},supabase:{rpc:async()=>({data:null,error:{message:"unavailable"}})}})}});
 const Page=modules("src/app/app/beheer/keuzevelden/page.tsx").default as (p:unknown)=>Promise<React.ReactNode>;
 const html=renderToStaticMarkup(await Page({searchParams:Promise.resolve({lijst:"events.event_type"})}));
 assert.match(html,/Er kan niets worden gewijzigd/);assert.doesNotMatch(html,/Optie toevoegen|>Opslaan<|>Verwijderen</);
});
test("De echte SQL-migratie beveiligt rechten, gekoppelde en gearchiveerde opties",async()=>{
 const sql=readFileSync("supabase/migrations/20261009074806_managed_dossier_choices.sql","utf8");
 const catalog=JSON.parse(sql.match(/select '(.*)'::jsonb \$\$/)![1].replaceAll("''","'"));
 const db=new PGlite();
 try{
  await db.exec("create role anon;create role authenticated;"+choiceFixture([...catalog,agendaChoice])+sql);
  await db.exec(readFileSync("supabase/migrations/20261009095014_managed_agenda_types.sql","utf8"));
  const actual=await db.query<{key:string}>("select v->>'key' as key from jsonb_array_elements(private.dossier_choice_catalog()) v");
  assert.equal(JSON.stringify(actual.rows.map(row=>row.key).sort()),JSON.stringify(choices.dossierChoiceSets().filter(set=>set.editable).map(set=>set.key).sort()));
  await db.exec(readFileSync("tests/dossier-choices.test.sql","utf8"));
 }finally{await db.close();}
});
