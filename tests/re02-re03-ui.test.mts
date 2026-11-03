import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {JSDOM} from 'jsdom';
import * as permissions from '../src/lib/permissions.ts';
const require=createRequire(import.meta.url),id='20000000-0000-4000-8000-000000000002';
async function page(name:'verdienen'|'overgang',state:unknown,detail:unknown=null,role='admin',enabled=true){
 const output=ts.transpileModule(readFileSync(new URL(`../src/app/app/bucks/${name}/page.tsx`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const exports:Record<string,unknown>={},calls:string[]=[];
 const mock=(n:string)=>{
  if(n==='next/link')return {__esModule:true,default:({children,...props}:{children:React.ReactNode})=>React.createElement('a',props,children)};
  if(n==='next/navigation')return {redirect(url:string){throw Error(url);}};
  if(n==='@/components/app-shell')return {AppShell:({children}:{children:React.ReactNode})=>React.createElement(React.Fragment,null,children)};
  if(n==='@/lib/permissions')return permissions;
  if(n==='@/lib/auth-context')return {async requireActiveMembership(){return {membership:{organization_id:id,role,finance_role:'none'},supabase:{async rpc(_:string,args:{op:string}){calls.push(args.op);return {data:args.op==='read'?detail:state,error:null};}}};}};
  if(n==='./actions')return {saveEarning:async()=>{},saveTransfer:async()=>{}};
  if(n.endsWith('.css'))return {};
  return require(n);
 };
 runInNewContext(output,{exports,require:mock,process:{env:{BESC_REWARDS_EARNING_ADMIN_ENABLED:String(enabled),BESC_REWARDS_TRANSFER_ENABLED:String(enabled)}}});
 const el=await(exports.default as(p:object)=>Promise<React.ReactElement>)({searchParams:Promise.resolve(detail?{batch:id}:{})});
 const dom=new JSDOM(renderToStaticMarkup(el));return{dom,doc:dom.window.document,calls};
}
test('RE02 page: disabled management reads nothing; members never reach manager data',async()=>{
 const p=await page('verdienen',null,null,'admin',false);try{assert.deepEqual(p.calls,[]);assert.equal(p.doc.querySelector('form'),null);}finally{p.dom.window.close();}
 await assert.rejects(page('verdienen',{},null,'member'),/rewards_forbidden/);
});
test('RE02 page: explicit version-bound approvals, editable Twitch concepts, no invented rates',async()=>{
 const r={kind:'text',guild_id:'1067893182387474432',version:3,enabled:false,xp:1,bucks:2,daily_xp:10,daily_bucks:20,cooldown_seconds:60};
 const p=await page('verdienen',{discord:[r],twitch:[]});try{
 assert.equal(p.doc.querySelectorAll('input[name="op"][value="discord_activation"]').length,1);
 assert.equal(p.doc.querySelectorAll('input[name="op"][value="twitch_save"]').length,1);
 assert.equal(p.doc.querySelector('input[name="xp"]')?.getAttribute('value'),null);
 assert.equal(p.doc.querySelector('input[name="version"]')?.getAttribute('value'),'3');
 }finally{p.dom.window.close();}
});
test('RE03 page: immutable plan shows differences and all three required confirmations',async()=>{
 const p=await page('overgang',{batches:[]},{id,status:'prepared',plan_sha256:'a'.repeat(64),export_sha256:'b'.repeat(64),original_sha256:'c'.repeat(64),broadcaster_id:'555',cutoff:'2026-11-03T12:00:00Z',plan:[{twitch_user_id:'102',user_id:id,before:'80',target:'100',difference:'20',xp:'50',reserved:'10'}]});try{
 assert.deepEqual(p.calls,['state','read']);for(const name of ['confirmed','source_stopped','cutoff_confirmed'])assert.equal(p.doc.querySelector(`input[name="${name}"]`)?.hasAttribute('required'),true);
 assert.equal(p.doc.querySelector('table tbody tr')?.querySelectorAll('td')[3].textContent,'20');assert.match(p.doc.body.textContent??'',new RegExp('c'.repeat(64)));
 }finally{p.dom.window.close();}
});
