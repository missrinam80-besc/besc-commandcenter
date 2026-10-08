import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {runInNewContext} from "node:vm";
import ts from "typescript";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {contactTabs} from "../src/lib/contact-dossier-tabs.ts";
import * as format from "../src/lib/format.ts";
import * as people from "../src/lib/community-people.ts";
import * as permissions from "../src/lib/permissions.ts";

function load(){
  const require=createRequire(import.meta.url);
  const pass=({children}:React.PropsWithChildren)=>React.createElement("section",null,children);
  const dependencies:Record<string,unknown>={
    "next/link":{default:({children,...props}:React.PropsWithChildren<React.AnchorHTMLAttributes<HTMLAnchorElement>>)=>React.createElement("a",props,children)},
    "@/lib/format":format,"@/lib/community-people":people,"@/lib/permissions":permissions,
    "@/components/markdown-field":{MarkdownContent:pass},
    "@/components/record-metadata":{RecordMetadata:({items}:{items:{label:string;value:React.ReactNode}[]})=>React.createElement("dl",null,items.map(i=>React.createElement("div",{key:i.label},i.label,": ",i.value)))},
    "@/components/record-connections-panel":{RecordConnectionsPanel:({view,queryContext}:{view:string;queryContext:string})=>React.createElement("p",null,`CONNECTIONS ${view} ${queryContext}`)},
    "@/components/operational-sections":{CommunitySections:({section}:{section:string})=>React.createElement("p",null,`COMMUNITY ${section}`),PartnerSections:({section}:{section:string})=>React.createElement("p",null,`SPONSOR ${section}`)},
    "@/components/approval-panel":{ApprovalPanel:()=>React.createElement("p",null,"Goedkeuring sponsorafspraak")},
    "@/components/sponsor-document-tools":{SponsorDocumentTools:()=>React.createElement("p",null,"Sponsorrapport")},
  };
  const compiled={exports:{} as {ContactDossierPanels:(props:Record<string,unknown>)=>Promise<React.ReactNode>}};
  runInNewContext(ts.transpileModule(readFileSync("src/components/contact-dossier-panels.tsx","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module:compiled,exports:compiled.exports,require:(name:string)=>name in dependencies?dependencies[name]:require(name)});
  return compiled.exports.ContactDossierPanels;
}
for(const selectedModule of ["sponsors","community"]){
  test(`${selectedModule}: ieder tabblad toont uitsluitend zijn eigen informatie en documenten blijven apart`,async()=>{
    const render=load(),calls:string[]=[];
    const base={module:selectedModule,record:{id:"fixture",name:"Bedrijf",display_name:"Persoon",email:"fixture@example.com",notes:"Notities",onboarding_status:"in_progress",status:"onboarding",account_user_id:"account",skills:["Techniek"],drive_url:"https://drive.google.com/fixture"},
      org:"fixture-org",canManage:true,isAdmin:false,query:{},connections:{links:[],documents:[],relationships:[]},options:[],roles:["volunteer","streamteam"],contacts:[],interactions:[],onboarding:[{id:"step",completed:true}],assignments:[],events:[],projects:[],campaigns:[],people:[],accountError:false,loadError:false,
      accounts:[{id:"account",label:"TESTFIXTURE account",status:"pending",role:"volunteer",finance_role:"none"}],
      supabase:{from(table:string){calls.push(table);const result={data:table==="partner_contacts"?[{id:"crm",role_title:"Vertegenwoordiger",is_primary:true,partners:{id:"company",name:"Sponsorbedrijf",deleted_at:null}},{id:"deleted",partners:{id:"old",name:"Verwijderd sponsorbedrijf",deleted_at:"2026-10-01"}}]:[],error:null};const builder:Record<string,unknown>={then:(resolve:(v:unknown)=>unknown)=>Promise.resolve(result).then(resolve)};for(const method of ["select","eq","is","order"])builder[method]=()=>builder;return builder;}},
    };
    for(const tab of contactTabs(selectedModule)){
      const html=renderToStaticMarkup(await render({...base,tab:tab.id}));
      assert.ok(html.length>0);
      if(tab.id==="documenten")assert.match(html,/CONNECTIONS documents tab=documenten/);else assert.doesNotMatch(html,/CONNECTIONS documents/);
      if(tab.id==="dossiers")assert.match(html,/CONNECTIONS relationships tab=dossiers/);else assert.doesNotMatch(html,/CONNECTIONS relationships/);
      if(selectedModule==="community"&&tab.id==="account"){
        assert.match(html,/In afwachting/);assert.match(html,/Alleen Admin/);assert.doesNotMatch(html,/Rechten en portaaltoegang beheren/);
        assert.ok(!calls.includes("portal_access"));
      }
      if(selectedModule==="community"&&tab.id==="dossiers"){
        assert.match(html,/Sponsorbedrijf/);assert.match(html,/Vertegenwoordiger/);assert.match(html,/Primair aanspreekpunt/);assert.doesNotMatch(html,/Verwijderd sponsorbedrijf/);
      }
      if(selectedModule==="community"&&tab.id==="profiel")assert.match(html,/Techniek/);
      if(selectedModule==="sponsors"&&tab.id==="samenwerking")assert.match(html,/Goedkeuring sponsorafspraak/);
    }
    const error=renderToStaticMarkup(await render({...base,tab:"algemeen",loadError:true}));assert.match(error,/role="alert"/);assert.doesNotMatch(error,/Contactgegevens|Bedrijfsgegevens/);
  });
}
