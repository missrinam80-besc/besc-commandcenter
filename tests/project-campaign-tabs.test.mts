import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {runInNewContext} from "node:vm";
import ts from "typescript";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import * as tabs from "../src/lib/contact-dossier-tabs.ts";
import * as format from "../src/lib/format.ts";
import * as outcomes from "../src/lib/project-outcomes.ts";
import {hasPermission} from "../src/lib/permissions.ts";
import {toPersonPickerOptions} from "../src/lib/person-picker.ts";

const id="11111111-1111-4111-8111-111111111111";
function load(path:string,dependencies:Record<string,unknown>){
  const require=createRequire(import.meta.url),compiled={exports:{} as Record<string,unknown>};
  runInNewContext(ts.transpileModule(readFileSync(path,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module:compiled,exports:compiled.exports,FormData,require:(name:string)=>name in dependencies?dependencies[name]:name==="@/components/dossier-editor-gate"?{dossierEditorGate:async()=>null}:require(name)});
  return compiled.exports;
}
test("Campagne-opleveringen en publicaties renderen afzonderlijk met behoud van toewijzing en links",()=>{
  const dependencies:Record<string,unknown>={
    "./markdown-field":{MarkdownContent:({children}:React.PropsWithChildren)=>React.createElement("div",null,children),MarkdownField:()=>null},"@/components/partner-contacts-panel":{},"@/lib/format":format,
    "@/app/app/operations/relation-actions":new Proxy({},{get:()=>()=>null}),
    "next/link":{default:({children,...props}:React.PropsWithChildren<Record<string,unknown>>)=>React.createElement("a",props,children)},
  };
  const Component=load("src/components/operational-sections.tsx",dependencies).CampaignSections as React.ComponentType<Record<string,unknown>>;
  const data={id,deliverables:[{id,title:"TESTFIXTURE oplevering",status:"todo",approval_status:"pending"}],social:[{id,title:"TESTFIXTURE social",platform:"Twitch",status:"review"}],content:[{id,title:"TESTFIXTURE content",status:"draft"}],people:[{id,display_name:"TESTFIXTURE creator"}]};
  const delivery=renderToStaticMarkup(React.createElement(Component,{...data,section:"deliverables"}));
  assert.match(delivery,/TESTFIXTURE oplevering/);assert.match(delivery,/name="approval_status"/);assert.match(delivery,/TESTFIXTURE creator/);
  assert.doesNotMatch(delivery,/TESTFIXTURE social|TESTFIXTURE content/);
  const publications=renderToStaticMarkup(React.createElement(Component,{...data,section:"publicaties"}));
  assert.match(publications,new RegExp(`/app/social/${id}`));assert.match(publications,new RegExp(`/app/content/${id}`));
  assert.doesNotMatch(publications,/TESTFIXTURE oplevering|name="approval_status"/);
});
test("Project- en campagnetabs normaliseren oude actielinks en weigeren vreemde returncontext",()=>{
  assert.equal(tabs.resolveContactTab("projecten",{taak:id}),"planning");
  assert.equal(tabs.resolveContactTab("projecten",{betrokkene:"nieuw"}),"team");
  assert.equal(tabs.resolveContactTab("projecten",{succes:"reactie"}),"overleg");
  assert.equal(tabs.resolveContactTab("projecten",{fout:"drive-koppelen"}),"documenten");
  assert.equal(tabs.resolveContactTab("campagnes",{nieuw:"content"}),"publicaties");
  assert.equal(tabs.resolveContactTab("campagnes",{succes:"deliverable"}),"deliverables");
  for(const selectedModule of ["projecten","campagnes"]){
    assert.equal(tabs.contactTabs(selectedModule).length,7);
    assert.equal(tabs.resolveContactTab(selectedModule,{tab:"onbekend"}),"algemeen");
    for(const tab of tabs.contactTabs(selectedModule)){
      const fd=new FormData();fd.set("dossier_tab",tab.id);
      assert.equal(tabs.appendContactTab(`/app/${selectedModule}/${id}?succes=bijgewerkt`,fd),`/app/${selectedModule}/${id}?succes=bijgewerkt&tab=${tab.id}`);
      const external=`https://example.com/app/${selectedModule}/${id}`;
      assert.equal(tabs.appendContactTab(external,fd),external);
    }
  }
  const fd=new FormData();fd.set("dossier_tab","team");
  assert.equal(tabs.appendContactTab(`/app/campagnes/${id}`,fd),`/app/campagnes/${id}`);
});

for(const selectedModule of ["projecten","campagnes"]){
  test(`${selectedModule}: render alle tabbladen met afgescheiden inhoud en routes naar de gezamenlijke editor`,async()=>{
    const source=selectedModule==="projecten"?"src/app/app/projecten/[id]/page.tsx":"src/components/operational-record-detail.tsx";
    const pass=({children}:React.PropsWithChildren)=>React.createElement("section",null,children);
    const record={id,title:"TESTFIXTURE dossier",status:"planned",priority:"normal",description:"PROJECTBESCHRIJVING",goal:"PROJECTDOEL",notes:"CAMPAGNEBRIEFING",results_summary:"CAMPAGNEEVALUATIE",channels:["Twitch"],reporting_status:"todo"};
    const supabase={from:(table:string)=>{
      const result={data:table==="project_milestones"?[{id,title:"MIJLPAAL",is_done:false}]:table==="organization_members"?[{user_id:id,status:"active",profiles:{display_name:"PROJECTACCOUNT"}}]:table==="tasks"?[{id,title:"PROJECTTAAK",status:"todo"}]:[],error:null};
      const q:Record<string,unknown>={then:(resolve:(v:unknown)=>unknown)=>Promise.resolve(result).then(resolve),maybeSingle:async()=>({data:table===(selectedModule==="projecten"?"projects":"campaigns")?record:null,error:null})};
      for(const method of ["select","eq","is","order","limit","neq"])q[method]=()=>q;
      return q;
    }};
    const dependencies:Record<string,unknown>={
      "@/lib/contact-dossier-tabs":tabs,"@/lib/format":format,"@/lib/project-outcomes":outcomes,"@/lib/permissions":{hasPermission},"@/lib/person-picker":{toPersonPickerOptions},"@/lib/community-people":{communityRoleLabels:{}},
      "@/lib/auth-context":{requireActiveMembership:async()=>({supabase,membership:{organization_id:"fixture",role:"admin",finance_role:"none",capabilities:[]}})},
      "@/lib/dossier-relations":{loadDossierConnections:async()=>({links:[],documents:[],relationships:[]}),loadRelationOptions:async()=>[]},
      "next/navigation":{notFound:()=>{throw Error("404");}},
      "next/link":{default:({children,scroll,...props}:React.PropsWithChildren<Record<string,unknown>>)=>{void scroll;return React.createElement("a",props,children);}},
      "@/app/app/operations/config":load("src/app/app/operations/config.ts",{}),
    };
    const src=readFileSync(source,"utf8");
    for(const match of src.matchAll(/import \{([^}]+)\} from "(@\/components\/[^\"]+)"/g)){
      dependencies[match[2]]=Object.fromEntries(match[1].split(",").map(n=>[n.trim(),pass]));
    }
    for(const match of src.matchAll(/from "([^\"]*actions)"/g))dependencies[match[1]]=new Proxy({},{get:()=>()=>null});
    dependencies["@/components/record-metadata"]={RecordMetadata:({items}:{items:{label:string;value:React.ReactNode}[]})=>React.createElement("dl",null,items.map(i=>React.createElement("div",{key:i.label},i.label,": ",i.value)))};
    dependencies["@/components/record-connections-panel"]={RecordConnectionsPanel:({view,queryContext}:{view:string;queryContext:string})=>React.createElement("p",null,`CONNECTIONS ${view} ${queryContext}`)};
    dependencies["@/components/people-assignments-panel"]={PeopleAssignmentsPanel:()=>React.createElement("p",null,"BETROKKENEN")};
    dependencies["@/components/financial-summary-panel"]={FinancialSummaryPanel:()=>React.createElement("p",null,"FINANCIEEL OVERZICHT")};
    dependencies["@/components/operational-sections"]={CampaignSections:({section}:{section:string})=>React.createElement("p",null,`CAMPAIGN ${section}`)};
    dependencies["@/components/operational-record-form"]={OperationalRecordForm:({record}:{record:Record<string,unknown>})=>React.createElement("p",null,`FORM ${JSON.stringify(record)}`)};
    dependencies["@/components/dossier-editor-gate"]={dossierEditorGate:async()=>null};
    const exports=load(source,dependencies),render=(exports.default||exports.OperationalRecordDetail) as (p:unknown)=>Promise<React.ReactNode>;
    for(const tab of tabs.contactTabs(selectedModule)){
      const html=renderToStaticMarkup(await render({module:selectedModule,params:Promise.resolve({id}),searchParams:Promise.resolve({tab:tab.id})}));
      assert.match(html,new RegExp(`href="\\?tab=${tab.id}" aria-current="page"`));
      for(const view of ["documents","relationships"]){const expected=view==="documents"?"documenten":"dossiers";assert.equal(html.includes(`CONNECTIONS ${view}`),tab.id===expected);}
      assert.equal(html.includes("FINANCIEEL OVERZICHT"),tab.id==="financien");
      if(selectedModule==="projecten"){
        assert.equal(html.includes("PROJECTDOEL"),tab.id==="algemeen");
        assert.equal(html.includes("PROJECTTAAK"),tab.id==="planning");
        assert.equal(html.includes("PROJECTACCOUNT</span>"),tab.id==="team");
        assert.equal(html.includes("BETROKKENEN"),tab.id==="team");
      }else{
        assert.equal(html.includes("CAMPAGNEBRIEFING"),tab.id==="algemeen");
        assert.equal(html.includes("CAMPAGNEEVALUATIE"),tab.id==="resultaten");
        assert.equal(html.includes("CAMPAIGN deliverables"),tab.id==="deliverables");
        assert.equal(html.includes("CAMPAIGN publicaties"),tab.id==="publicaties");
      }
    }
    dependencies["@/components/dossier-editor-gate"]={dossierEditorGate:async(props:Record<string,unknown>)=>{assert.equal(props.id,id);assert.equal((props.query as Record<string,string>).tab,"financien");return React.createElement("p",null,"GEZAMENLIJKE EDITOR");}};
    const editRender=load(source,dependencies);const editPage=(editRender.default||editRender.OperationalRecordDetail) as (p:unknown)=>Promise<React.ReactNode>;
    const edit=renderToStaticMarkup(await editPage({module:selectedModule,params:Promise.resolve({id}),searchParams:Promise.resolve({tab:"financien",bewerken:"1"})}));
    assert.match(edit,/GEZAMENLIJKE EDITOR/);assert.doesNotMatch(edit,/FINANCIEEL OVERZICHT|CONNECTIONS/);
  });
}

