import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {runInNewContext} from "node:vm";
import ts from "typescript";
import {PGlite} from "@electric-sql/pglite";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {editorLoader} from "./helpers/editor-loader.mts";
const org="11111111-1111-4111-8111-111111111111",other="22222222-2222-4222-8222-222222222222",one="33333333-3333-4333-8333-333333333333",two="44444444-4444-4444-8444-444444444444",foreign="55555555-5555-4555-8555-555555555555",admin="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const library=editorLoader()("src/lib/asset-bulk.ts");
const schema=library.assetBulkSchema as {safeParse:(v:unknown)=>{success:boolean}};
test("Bulkvalidatie weigert lege of dubbele selectie en vereist gekozen wijzigingsvelden",()=>{
 for(const input of [{ids:[],mode:"archive"},{ids:[one,one],mode:"delete"},{ids:[one],mode:"update"},{ids:[one],mode:"update",changeStatus:true},{ids:[one],mode:"update",changeLocation:true,location:"x".repeat(301)}])assert.equal(schema.safeParse(input).success,false);
 assert.equal(schema.safeParse({ids:[one,two],mode:"update",changeLocation:true,location:""}).success,true);
});
test("De server gebruikt organisatie en RPC-resultaat; fouten melden geen succes",async()=>{
 const calls:Record<string,unknown>[]=[],paths:string[]=[];let result:{data:unknown;error:unknown}={data:2,error:null};
 const modules=editorLoader({"next/cache":{revalidatePath:(path:string)=>paths.push(path)},"next/navigation":{redirect:()=>{throw Error("redirect")}},"@/lib/auth-context":{requirePermission:async(cap:string)=>{assert.equal(cap,"manageOrganization");return {membership:{organization_id:org},supabase:{rpc:async(name:string,args:Record<string,unknown>)=>{assert.equal(name,"bulk_asset_action");calls.push(args);return result}}}}}});
 const action=modules("src/app/app/materialen/actions.ts").bulkAssetAction as (v:unknown)=>Promise<{ok:boolean;message:string}>;
 assert.equal((await action({ids:[],mode:"delete"})).ok,false);assert.equal(calls.length,0);
 const input={ids:[one,two],mode:"update",changeLocation:true,location:" Magazijn "};
 assert.equal((await action(input)).ok,true);assert.equal(calls[0].p_organization_id,org);assert.equal(calls[0].p_location,"Magazijn");assert.equal(calls[0].p_change_status,false);assert.ok(paths.includes("/app/materialen"));
 result={data:null,error:{message:"asset_selection_unavailable",code:"40001"}};const error=await action(input);assert.equal(error.ok,false);assert.match(error.message,/Er is niets gewijzigd/);
 result={data:1,error:null};assert.equal((await action(input)).ok,false);
});
test("De echte bulk-RPC bewaart andere velden en draait een onvolledige of falende bulk volledig terug",async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role authenticated;create role anon;create schema auth;create schema private;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function private.is_org_manager(o uuid) returns boolean language sql stable as $$select o='${org}'::uuid and auth.uid()='${admin}'::uuid$$;
 grant usage on schema auth,private to authenticated;
 create table assets(id uuid primary key,organization_id uuid,name text,location text,status text check(status in('planned','active','maintenance','loaned','retired','lost','archived')),notes text,deleted_at timestamptz,updated_at timestamptz default now(),check(name<>'Two' or location<>'FAIL'));
 alter table assets enable row level security;grant select,update on assets to authenticated;
 create policy read_assets on assets for select to authenticated using(organization_id='${org}');
 create policy edit_assets on assets for update to authenticated using(private.is_org_manager(organization_id)) with check(private.is_org_manager(organization_id));
 insert into assets(id,organization_id,name,location,status,notes) values('${one}','${org}','One','A','active','keep one'),('${two}','${org}','Two','B','planned','keep two'),('${foreign}','${other}','Other','X','active','secret');`);
 await db.exec(readFileSync("supabase/migrations/20261009100412_bulk_asset_actions.sql","utf8"));
 await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${admin}',false);`);
 const ids=`array['${one}','${two}']::uuid[]`,call=(args:string)=>db.query<{count:number}>(`select public.bulk_asset_action('${org}',${ids},${args}) as count`);
 assert.equal((await call("'update',true,'  Store  ',false,null")).rows[0].count,2);
 const rows=await db.query<{location:string;status:string;notes:string}>("select location,status,notes from assets order by name");assert.deepEqual(rows.rows,[{location:"Store",status:"active",notes:"keep one"},{location:"Store",status:"planned",notes:"keep two"}]);
 await assert.rejects(call("'update',true,'FAIL',false,null"));assert.equal((await db.query<{count:number}>("select count(*) as count from assets where location='Store'")).rows[0].count,2);
 await assert.rejects(db.query(`select bulk_asset_action('${org}',array['${one}','${foreign}']::uuid[],'update',true,'bad')`),/asset_selection_unavailable/);
 await assert.rejects(db.query(`select bulk_asset_action('${other}',array['${foreign}']::uuid[],'delete')`),/asset_bulk_no_access/);
 await assert.rejects(db.query(`select bulk_asset_action('${org}',array['${one}','${one}']::uuid[],'archive')`),/asset_bulk_fields/);
 await call("'update',false,null,true,'maintenance'");assert.equal((await db.query<{count:number}>("select count(*) as count from assets where location='Store' and status='maintenance'")).rows[0].count,2);
 await call("'update',true,'',true,'loaned'");assert.equal((await db.query<{count:number}>("select count(*) as count from assets where location is null and status='loaned'")).rows[0].count,2);
 await call("'archive'");assert.equal((await db.query<{count:number}>("select count(*) as count from assets where status='archived' and deleted_at is null")).rows[0].count,2);
 await db.exec(`select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);`);await assert.rejects(call("'delete'"),/asset_bulk_no_access/);
 await db.exec(`select set_config('request.jwt.claim.sub','${admin}',false);`);
 await db.query(`select bulk_asset_action('${org}',array['${two}']::uuid[],'delete')`);
 await assert.rejects(call("'update',true,'bad',false,null"),/asset_selection_unavailable/);assert.equal((await db.query<{location:string|null}>(`select location from assets where id='${one}'`)).rows[0].location,null);
 await db.query(`select bulk_asset_action('${org}',array['${one}']::uuid[],'delete')`);assert.equal((await db.query<{count:number}>("select count(*) as count from assets where deleted_at is not null")).rows[0].count,2);
 await db.exec("reset role;set role anon;");await assert.rejects(call("'delete'"),/permission denied/);
 }finally{await db.close();}
});

const rows=[{id:one,name:"TESTFIXTURE One",asset_type:"equipment",status:"active",location:"A",serial_number:null,valueLabel:"€ 10",acquiredLabel:"",ownerLabel:"Owner",relationLabel:"Event",document_url:null},{id:two,name:"TESTFIXTURE Two",asset_type:"equipment",status:"planned",location:"B",serial_number:null,valueLabel:"€ 20",acquiredLabel:"",ownerLabel:"Owner",relationLabel:"Event",document_url:null}];
test("De lijst heeft paginabrede tekstacties en selectie; kijkers krijgen geen wijzigknoppen",()=>{
 const modules=editorLoader({"next/link":{__esModule:true,default:({children,...props}:React.PropsWithChildren<Record<string,unknown>>)=>React.createElement("a",props,children)},"next/navigation":{useRouter:()=>({push(){},refresh(){}})},"@/app/app/materialen/actions":{bulkAssetAction:async()=>({ok:true,message:"done"})}});
 const Component=modules("src/components/materials-inventory.tsx").MaterialsInventory as React.ComponentType<Record<string,unknown>>;
 const html=renderToStaticMarkup(React.createElement(Component,{rows,canManage:true}));assert.match(html,/Alle getoonde materialen selecteren/);assert.match(html,/TESTFIXTURE One selecteren/);assert.match(html,/disabled=""[^>]*><svg[^]*?Bewerken/);
 assert.doesNotMatch(html,/<details|<summary/);
 const readonly=renderToStaticMarkup(React.createElement(Component,{rows,canManage:false}));assert.doesNotMatch(readonly,/type="checkbox"|Nieuw item|Archiveren|Verwijderen/);
});
test("Selectie, één fiche bewerken, bulk toepassen, bevestiging en mislukte opslag werken interactief",async()=>{
 const require=createRequire(import.meta.url),{JSDOM}=require("jsdom"),dom=new JSDOM("<!doctype html><html><body></body></html>");
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,FormData:dom.window.FormData,IS_REACT_ACT_ENVIRONMENT:true});Object.defineProperty(globalThis,"navigator",{value:dom.window.navigator,configurable:true});
 const {createRoot}=await import("react-dom/client");let result={ok:true,message:"2 items bijgewerkt."},confirm=true,refreshes=0;const writes:Record<string,unknown>[]=[],pushes:string[]=[];
 dom.window.confirm=()=>confirm;
 const overrides:Record<string,unknown>={"next/link":{__esModule:true,default:({children,...props}:React.PropsWithChildren<Record<string,unknown>>)=>React.createElement("a",props,children)},"next/navigation":{useRouter:()=>({push:(href:string)=>pushes.push(href),refresh:()=>{refreshes++;}})},"@/lib/asset-bulk":library,"@/app/app/materialen/actions":{bulkAssetAction:async(input:Record<string,unknown>)=>{writes.push(input);return result}}};
 const compiled={exports:{} as {MaterialsInventory:React.ComponentType<Record<string,unknown>>}};
 runInNewContext(ts.transpileModule(readFileSync("src/components/materials-inventory.tsx","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module:compiled,exports:compiled.exports,window:dom.window,require:(key:string)=>key in overrides?overrides[key]:require(key)});
 const node=document.createElement("div");document.body.append(node);const root=createRoot(node);
 const button=(text:string)=>[...node.querySelectorAll<HTMLButtonElement>("button")].find(b=>b.textContent===text)!;
 const click=async(element:HTMLElement)=>{await React.act(async()=>element.click());};
 try{
 await React.act(async()=>root.render(React.createElement(compiled.exports.MaterialsInventory,{rows,canManage:true})));
 assert.equal(button("Bewerken").disabled,true);await click(node.querySelector<HTMLInputElement>(`input[aria-label="TESTFIXTURE One selecteren"]`)!);assert.equal(button("Bewerken").disabled,false);await click(button("Bewerken"));assert.equal(pushes[0],`?bewerken=${one}`);
 await click(node.querySelector<HTMLInputElement>('input[aria-label="Alle getoonde materialen selecteren"]')!);assert.equal(button("Bewerken").disabled,true);assert.match(node.textContent??"",/2 geselecteerd/);
 await click(button("Locatie / status aanpassen"));assert.equal(button("Wijzigingen toepassen").disabled,true);
 await click(node.querySelector<HTMLInputElement>('#materials-bulk-form input[type="checkbox"]')!);
 await React.act(async()=>node.querySelector("form")!.dispatchEvent(new dom.window.Event("submit",{bubbles:true,cancelable:true})));
 assert.equal(writes[0].changeLocation,true);assert.equal(writes[0].location,"");assert.equal(writes[0].changeStatus,false);assert.equal((writes[0].ids as string[]).length,2);assert.equal(refreshes,1);assert.match(node.textContent??"",/0 geselecteerd/);
 await click(node.querySelector<HTMLInputElement>('input[aria-label="Alle getoonde materialen selecteren"]')!);confirm=false;await click(button("Verwijderen"));assert.equal(writes.length,1);
 confirm=true;result={ok:false,message:"TESTFIXTURE niets gewijzigd"};await click(button("Archiveren"));assert.equal(writes[1].mode,"archive");assert.match(node.textContent??"",/TESTFIXTURE niets gewijzigd/);assert.match(node.textContent??"",/2 geselecteerd/);assert.equal(refreshes,1);
 }finally{await React.act(async()=>root.unmount());node.remove();dom.window.close();}
});
