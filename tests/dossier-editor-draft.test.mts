import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {runInNewContext} from "node:vm";
import ts from "typescript";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import * as format from "../src/lib/format.ts";
const native=createRequire(import.meta.url),cache:Record<string,Record<string,unknown>>={};
function load(file:string):Record<string,unknown>{
 if(cache[file])return cache[file];
 const compiled={exports:{} as Record<string,unknown>};
 const require=(name:string):unknown=>name==="./rich-text-field"?load("src/components/rich-text-field.tsx"):name==="./dossier-workspace"?{DossierWorkspace:()=>null}:name==="next/navigation"?{useRouter:()=>({push(){},refresh(){}})}:name==="@/lib/format"?format:name.endsWith(".json")?native(new URL(`../src/lib/${name.replace('./','')}`,import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,"$1")):name.startsWith("@/lib/")?load(`src/lib/${name.slice(6)}.ts`):name.startsWith("./")?load(`src/lib/${name.slice(2)}.ts`):native(name);
 runInNewContext(ts.transpileModule(readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{module:compiled,exports:compiled.exports,require,URL});
 return cache[file]=compiled.exports;
}
const catalog=load("src/lib/dossier-editor-catalog.ts").dossierEditorCatalog as Record<string,{table:string;tabs:{id:string}[];collections:{table:string;tab:string}[]}>;
type Row={localId:string;id:string;values:Record<string,unknown>;base:Record<string,unknown>|null;deleted:boolean};
type Draft={kind:string;id:string;values:Record<string,unknown>;base:Record<string,unknown>|null;parts:Record<string,Row[]>};
type Change={id:string;new:boolean;values:Record<string,unknown>;base:Record<string,unknown>|null;delete?:boolean;collection?:string};
type Bundle={kind:string;root:Change;parts:Change[]};
const library=load("src/lib/dossier-editor-draft.ts") as unknown as {createDossierDraft:(kind:string,id:string,record:Record<string,unknown>|null,parts?:Record<string,Record<string,unknown>[]>)=>Draft;buildEditorBundle:(draft:Draft)=>Bundle;validateEditorBundle:(bundle:Bundle)=>string[];editorHasChanges:(draft:Draft)=>boolean};
const id="11111111-1111-4111-8111-111111111111",child="22222222-2222-4222-8222-222222222222";
test("Eventeditor toont datum en optionele tijd eenmaal en koppelt de ondergrenzen",()=>{
 const Component=load("src/components/dossier-editor.tsx").DossierEditor as React.ComponentType<Record<string,unknown>>;
 const html=renderToStaticMarkup(React.createElement(Component,{kind:"event",id,record:{id,title:"TESTFIXTURE",start_date:"2026-10-08",end_date:"2026-10-08",start_at:"2026-10-08T10:30:00+00:00",end_at:"2026-10-08T11:30:00+00:00"},mode:"edit",cancelHref:"/app",permissions:{}}));
 assert.equal((html.match(/type="date"/g)||[]).length,2);
 assert.equal((html.match(/type="time"/g)||[]).length,2);
 assert.doesNotMatch(html,/type="datetime-local"/);
 assert.match(html,/type="date" min="2026-10-08"/);
 assert.match(html,/type="time" min="12:30"/);
});
test("Eventdatum wijzigen verplaatst de tijd mee; wissen behoudt datum zonder verzonnen tijd",()=>{
 const draft=library.createDossierDraft("event",id,{id,title:"TESTFIXTURE",start_date:"2026-10-08",start_at:"2026-10-08T10:30:25+00:00",end_date:null,end_at:null});
 assert.equal(library.editorHasChanges(draft),false);
 draft.values.start_date="2026-10-09";
 let bundle=library.buildEditorBundle(draft);
 assert.equal(bundle.root.values.start_at,"2026-10-09T10:30:00.000Z");
 assert.equal(library.validateEditorBundle(bundle).length,0);
 draft.values.start_time="";bundle=library.buildEditorBundle(draft);
 assert.equal(bundle.root.values.start_at,null);assert.equal(bundle.root.values.start_date,"2026-10-09");
 assert.equal(library.validateEditorBundle(bundle).length,0);
});
test("Gezamenlijke eventopslag weigert vroege einddatum, vroeg uur en ongeldige zomertijd",()=>{
 for(const input of [
  {start_date:"2026-10-09",end_date:"2026-10-08"},
  {start_date:"2026-10-09",end_date:"2026-10-09",start_time:"18:00",end_time:"17:00"},
  {start_date:"2026-03-29",start_time:"02:30"},
  {start_date:"2026-02-30"},
  {start_time:"12:00"},
 ]){
  const draft=library.createDossierDraft("event",id,null);Object.assign(draft.values,{title:"TESTFIXTURE"},input);
  assert.ok(library.validateEditorBundle(library.buildEditorBundle(draft)).length,JSON.stringify(input));
 }
 const draft=library.createDossierDraft("event",id,null);Object.assign(draft.values,{title:"TESTFIXTURE",start_date:"2026-10-08",end_date:"2026-10-09",start_time:"23:00",end_time:"01:00"});
 assert.equal(library.validateEditorBundle(library.buildEditorBundle(draft)).length,0);
});
test("Servervalidatie weigert directe ongeldige datumvolgorde en tegenstrijdige datums",()=>{
 const draft=library.createDossierDraft("event",id,{id,title:"TESTFIXTURE",start_date:"2026-10-09",end_date:"2026-10-10",start_at:null,end_at:null});
 const bundle=library.buildEditorBundle(draft);bundle.root.values={end_date:"2026-10-08"};
 assert.ok(library.validateEditorBundle(bundle).some(message=>message.includes("Einddatum")));
 bundle.root.values={start_date:"2026-10-08",start_at:"2026-10-09T10:00:00Z"};
 assert.ok(library.validateEditorBundle(bundle).some(message=>message.includes("dezelfde dag")));
});
test("Bestaande aanmaak- en bewerklinks openen de gezamenlijke editor met dossiercontext",async()=>{
 const gate=load("src/components/dossier-editor-gate.tsx").dossierEditorGate as (props:unknown)=>Promise<React.ReactElement<{kind:string;id?:string;preset:Record<string,unknown>;context?:{id:string;type:string}}>|null>;
 assert.equal(await gate({kind:"event",id,query:{}}),null);
 assert.equal(await gate({kind:"event",id,query:{bewerken:"1",fout:"opslaan"}}),null);
 const edit=await gate({kind:"event",id,query:{bewerken:"1"}});assert.equal(edit?.props.id,id);assert.equal(edit?.props.kind,"event");
 const task=await gate({kind:"event",id,query:{nieuw:"taak"}});assert.equal(task?.props.kind,"task");assert.equal(task?.props.id,undefined);assert.equal(task?.props.context?.id,id);assert.equal(task?.props.context?.type,"event");
 assert.equal((await gate({kind:"event",id,query:{schema:"nieuw",tab:"planning"}}))?.props.kind,"event");
 assert.equal(await gate({kind:"knowledge",query:{nieuw:"categorie"}}),null);
 const campaign=await gate({kind:"project",id,query:{nieuw:"campagne"}});
 assert.equal(campaign?.props.kind,"campaign");assert.equal(campaign?.props.preset.project_id,id);assert.equal(campaign?.props.context?.id,id);
 assert.equal((await gate({group:"finance",query:{nieuw:"kost"}}))?.props.kind,"expense");
 assert.equal((await gate({group:"administration",query:{bewerken:id,fiche:"member"}}))?.props.id,id);
});
test("Contextkoppelingen bij aanmaak zijn nieuwe onderdelen in dezelfde bundel",()=>{
 const draft=library.createDossierDraft("task",id,null,{record_relationships:[{id:child,source_id:id,source_type:"task",target_id:child,target_type:"event",relationship_type:"related"}]});draft.values.title="TESTFIXTURE contexttaak";
 const bundle=library.buildEditorBundle(draft);assert.equal(bundle.parts[0].new,true);assert.equal(bundle.parts[0].base,null);assert.equal(library.validateEditorBundle(bundle).length,0);
});
test("Editorbundel bewaart alleen gewijzigde fichevelden en gewijzigde onderdelen",()=>{
 const draft=library.createDossierDraft("project",id,{id,title:"TESTFIXTURE",status:"planned",description:"bestaand",updated_at:"2026-10-08T00:00:00Z"},{project_milestones:[{id:child,title:"TESTFIXTURE mijlpaal",is_done:false}]});
 assert.equal(library.editorHasChanges(draft),false);
 draft.values.title="TESTFIXTURE gewijzigd";draft.values.organization_id="aanval";draft.parts.project_milestones[0].values.is_done=true;
 const bundle=library.buildEditorBundle(draft);
 assert.deepEqual(Object.keys(bundle.root.values),["title"]);assert.equal(bundle.root.values.title,"TESTFIXTURE gewijzigd");
 assert.equal(bundle.parts.length,1);assert.equal(bundle.parts[0].values.is_done,true);assert.ok(bundle.root.base?.updated_at);
 assert.equal(library.validateEditorBundle(bundle).length,0);
});
test("Toevoegingen en verwijderingen blijven in de draft; ongedaan maken raakt geen database",()=>{
 const draft=library.createDossierDraft("event",id,{id,title:"TESTFIXTURE event"},{event_materials:[{id:child,name:"TESTFIXTURE materiaal",quantity:1}]});
 draft.parts.event_materials[0].deleted=true;
 assert.equal(library.buildEditorBundle(draft).parts[0].delete,true);
 draft.parts.event_materials[0].deleted=false;
 assert.equal(library.buildEditorBundle(draft).parts.length,0);
 draft.parts.event_materials.push({localId:"nieuw",id:child,values:{name:"TESTFIXTURE nieuw",quantity:1},base:null,deleted:true});
 assert.equal(library.buildEditorBundle(draft).parts.length,0);
});
test("Wirevalidatie weigert auditvelden, onbekende onderdelen en dubbel opgenomen rijen",()=>{
 const draft=library.createDossierDraft("project",id,{id,title:"TESTFIXTURE"});
 const bundle=library.buildEditorBundle(draft);bundle.root.values.created_by=child;
 assert.ok(library.validateEditorBundle(bundle).length);
 bundle.root.values={};bundle.parts=[{id:child,new:true,values:{},base:null,collection:"organization_members"}];
 assert.ok(library.validateEditorBundle(bundle).length);
 bundle.parts=[{id:child,new:true,values:{title:"TESTFIXTURE"},base:null,collection:"project_milestones"},{id:child,new:true,values:{title:"TESTFIXTURE"},base:null,collection:"project_milestones"}];
 assert.ok(library.validateEditorBundle(bundle).some(p=>p.includes("tweemaal")));
});
test("Nieuwe communityrollen krijgen hun echte sleutel, met alle overige profielvelden behouden",()=>{
 const draft=library.createDossierDraft("community",id,{id,display_name:"TESTFIXTURE",email:"fixture@example.com"});
 draft.parts.community_person_roles=[{localId:"nieuw",id:"",values:{role:"volunteer"},base:null,deleted:false}];
 const bundle=library.buildEditorBundle(draft);assert.equal(bundle.parts[0].id,"volunteer");assert.equal(Object.keys(bundle.root.values).length,0);
});
test("Alle 22 editors hebben één formulier, één opslaanknop en bereikbare panelen; opslag is niet geactiveerd",()=>{
 const Component=load("src/components/dossier-editor.tsx").DossierEditor as React.ComponentType<Record<string,unknown>>;
 assert.equal(Object.keys(catalog).length,22);
 for(const [kind,cfg]of Object.entries(catalog)){
  for(const part of cfg.collections)assert.ok(cfg.tabs.some(tab=>tab.id===part.tab),`${kind}.${part.table}`);
  const html=renderToStaticMarkup(React.createElement(Component,{kind,id,mode:"create",cancelHref:"/app",permissions:{}}));
  assert.equal((html.match(/<form /g)||[]).length,1,kind);assert.equal((html.match(/type="submit"/g)||[]).length,1,kind);
  assert.match(html,/type="submit" disabled=""/);assert.equal((html.match(/role="tabpanel"/g)||[]).length,cfg.tabs.length,kind);
 }
});
