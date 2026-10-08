import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {editorLoader} from "./helpers/editor-loader.mts";

for(const role of ["admin","board","member","volunteer"])test(`Inventaris bewaart afzonderlijke beheeracties voor ${role}`,async()=>{
 const row={id:"11111111-1111-4111-8111-111111111111",name:"TESTFIXTURE materiaal",asset_type:"hardware",status:"active"};
 const query={select:()=>query,eq:()=>query,is:()=>query,order:()=>query,then:(resolve:(v:unknown)=>unknown)=>Promise.resolve({data:[row],error:null}).then(resolve)};
 const read=editorLoader({
  "@/components/dossier-editor-gate":{dossierEditorGate:async()=>null},
  "@/components/app-shell":{AppShell:({children}:React.PropsWithChildren)=>React.createElement("div",null,children)},
  "@/components/confirm-submit-button":{ConfirmSubmitButton:({children,...props}:React.PropsWithChildren<Record<string,unknown>>)=>React.createElement("button",props,children)},
  "@/lib/auth-context":{requireActiveMembership:async()=>({supabase:{from:()=>query},membership:{organization_id:"fixture-org",role}})},
  "./actions":{removeAsset:()=>{}},
  "next/link":{__esModule:true,default:({children,...props}:React.PropsWithChildren<Record<string,unknown>>)=>React.createElement("a",props,children)},
 });
 const Page=read("src/app/app/materialen/page.tsx").default as (props:unknown)=>Promise<React.ReactNode>;
 const html=renderToStaticMarkup(await Page({searchParams:Promise.resolve({fout:"opslaan",bewerken:row.id})}));
 assert.match(html,/De actie is mislukt/);assert.match(html,/TESTFIXTURE materiaal/);
 const manager=role==="admin"||role==="board";
 assert.equal(html.includes('name="mode" value="archive"'),manager);
 assert.equal(html.includes('name="mode" value="delete"'),manager);
 assert.equal(html.includes(`href="?bewerken=${row.id}"`),manager);
 assert.doesNotMatch(html,/Nieuw materiaal of resource|Materiaal of resource bewerken/);
});
