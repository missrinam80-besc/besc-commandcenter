import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {editorLoader} from "./helpers/editor-loader.mts";

for(const role of ["admin","board","member","volunteer"])test(`Inventaris respecteert rechten voor paginabrede selectieacties voor ${role}`,async()=>{
 const row={id:"11111111-1111-4111-8111-111111111111",name:"TESTFIXTURE materiaal",asset_type:"hardware",status:"active"};
 const query={select:()=>query,eq:()=>query,is:()=>query,order:()=>query,then:(resolve:(v:unknown)=>unknown)=>Promise.resolve({data:[row],error:null}).then(resolve)};
 const overrides:Record<string,unknown>={
  "@/components/dossier-editor-gate":{dossierEditorGate:async()=>null},
  "@/components/app-shell":{AppShell:({children}:React.PropsWithChildren)=>React.createElement("div",null,children)},
  "@/components/confirm-submit-button":{ConfirmSubmitButton:({children,...props}:React.PropsWithChildren<Record<string,unknown>>)=>React.createElement("button",props,children)},
  "@/lib/auth-context":{requireActiveMembership:async()=>({supabase:{from:()=>query,rpc:async()=>({data:[],error:null})},membership:{organization_id:"fixture-org",role}})},
  "./materials.css":{},
  "next/navigation":{useRouter:()=>({push(){},refresh(){}})},
  "@/app/app/materialen/actions":{bulkAssetAction:()=>{}},
  "next/link":{__esModule:true,default:({children,...props}:React.PropsWithChildren<Record<string,unknown>>)=>React.createElement("a",props,children)},
 };
 const read=editorLoader(overrides);overrides["@/components/materials-inventory"]=read("src/components/materials-inventory.tsx");
 const Page=read("src/app/app/materialen/page.tsx").default as (props:unknown)=>Promise<React.ReactNode>;
 const html=renderToStaticMarkup(await Page({searchParams:Promise.resolve({fout:"opslaan",bewerken:row.id})}));
 assert.match(html,/De actie is mislukt/);assert.match(html,/TESTFIXTURE materiaal/);
 const manager=role==="admin"||role==="board";
 assert.equal(html.includes('aria-label="Alle getoonde materialen selecteren"'),manager);
 assert.equal(html.includes("Archiveren</button>"),manager);
 assert.equal(html.includes("Verwijderen</button>"),manager);
 assert.doesNotMatch(html,/<details|<summary/);
 assert.doesNotMatch(html,/Nieuw materiaal of resource|Materiaal of resource bewerken/);
});
