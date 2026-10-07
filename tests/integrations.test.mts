import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as definitions from '../src/lib/social-connectors.ts';
const nativeRequire = createRequire(import.meta.url);
export function fixture(role='admin') {
  const reads: Array<{table:string;organization?:string}> = [];
  const records: Record<string, unknown[]> = {
    integration_connections: [{id:'google',provider:'google_workspace',display_name:'Google Workspace',status:'connected',account_label:'TESTFIXTURE Workspace',configuration:{resources:[{type:'folder',name:'TESTFIXTURE Hoofdmap',webUrl:'https://example.invalid/source'}]}},{id:'old-ai',provider:'openai',display_name:'HIDE OLD AI',status:'configured'}],
    social_accounts: ['youtube','facebook','instagram','twitch'].map(platform=>({id:platform,platform,account_name:`TESTFIXTURE ${platform}`,status:'connected',sync_enabled:false,granted_scopes:[],sync_interval_minutes:1440,retention_days:730,quota_used_estimate:10,quota_daily_limit:10000,quota_warning_percent:80,last_sync_at:'2026-10-07T13:00:00Z'})),
    social_sync_runs:[{id:'run',social_account_id:'youtube',trigger_type:'manual',status:'succeeded',records_written:11,records_read:11,created_at:'2026-10-07T13:00:00Z'}],
  };
  const supabase={from(table:string){const read={table,organization:undefined as string|undefined};reads.push(read);const q={select(){return q},eq(key:string,value:string){if(key==='organization_id')read.organization=value;return q},is(){return q},order(){return q},limit(){return q},then(resolve:(v:unknown)=>unknown){return Promise.resolve({data:records[table]??[],error:null}).then(resolve)}};return q}};
  const cache:Record<string, unknown>={};
  function load(path:string): Record<string, unknown> {
    if(cache[path]) return cache[path] as Record<string,unknown>;
    const loaded={exports:{} as Record<string,unknown>};cache[path]=loaded.exports;
    const code=ts.transpileModule(readFileSync(new URL('../src/app/app/integraties/'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    runInNewContext(code,{exports:loaded.exports,module:loaded,URLSearchParams,Promise,Date,Intl,process,require:(name:string)=>{
      if(name==='@/lib/auth-context')return {requireActiveMembership:async()=>({supabase,membership:{role,organization_id:'org'}})};
      if(name==='@/components/app-shell')return {AppShell:({children}:{children:React.ReactNode})=>React.createElement('main',{},children)};
      if(name==='@/components/form-modal')return {FormModal:({children,title}:{children:React.ReactNode;title:string})=>React.createElement('section',{role:'dialog'},React.createElement('h2',{},title),children)};
      if(name==='@/components/confirm-submit-button')return {ConfirmSubmitButton:({children}:{children:React.ReactNode})=>React.createElement('button',{},children)};
      if(name==='next/link')return {default:({children,...props}:{children:React.ReactNode})=>React.createElement('a',props,children),__esModule:true};
      if(name==='next/cache')return {revalidatePath:()=>{}};
      if(name==='next/navigation')return {redirect:(url:string)=>{throw new Error(url)}};
      if(name==='@/lib/social-connectors')return definitions;
      if(name==='@/lib/google-workspace')return {googleWorkspaceConfiguration:()=>({configured:true,missing:[]}),googlePitchdeckConfiguration:()=>({sponsor:'template'})};
      if(name==='@/lib/google-gmail')return {googleGmailConfiguration:()=>({configured:true,sender:'test@example.invalid'})};
      if(name.startsWith('@/lib/')&&name.endsWith('-integration'))return new Proxy({},{get:()=>()=>({configured:true})});
      if(name==='./social-accounts')return load('social-accounts.tsx');
      if(name.endsWith('actions'))return new Proxy({},{get:()=>()=>{}});
      return nativeRequire(name);
    }});
    return loaded.exports;
  }
  return {reads,load};
}
export async function render(element:React.ReactNode):Promise<string> {
  async function settle(node:React.ReactNode):Promise<React.ReactNode>{
    if(Array.isArray(node))return Promise.all(node.map(settle));
    if(!React.isValidElement<{children?:React.ReactNode}>(node))return node;
    if(typeof node.type==='function'&&node.type.constructor.name==='AsyncFunction')return settle(await (node.type as unknown as (props:unknown)=>Promise<React.ReactNode>)(node.props));
    const children=await settle(node.props.children);
    return React.cloneElement(node,{},...(Array.isArray(children)?children:[children]));
  }
  return renderToStaticMarkup(await settle(element));
}
async function page(path:string,params:Record<string,string>={},role='admin'){
 const f=fixture(role);const Page=f.load(path).default as (p:unknown)=>Promise<React.ReactNode>;
 return {html:await render(await Page({searchParams:Promise.resolve(params)})),reads:f.reads};
}
test('combined overview retains accounts and OAuth controls without logs or excluded providers',async()=>{
 const {html,reads}=await page('page.tsx');
 assert.match(html,/TESTFIXTURE youtube/); assert.match(html,/TESTFIXTURE Hoofdmap/);
 assert.match(html,/\/app\/integraties\/logs/);assert.match(html,/\?nieuw=social/);
 assert.doesNotMatch(html,/HIDE OLD AI|Vercel|Claude|Geheimen blijven|FINALE ACCEPTATIE|Recente synchronisaties/);
 assert.equal(reads.some(r=>r.table==='social_sync_runs'||r.table==='social_metric_snapshots'),false);
 assert.ok(reads.every(r=>r.organization==='org'));
});
test('social create and edit forms use the unified destination, preserving account fields',async()=>{
 assert.match((await page('page.tsx',{nieuw:'social'})).html,/Social account registreren/);
 const {html}=await page('page.tsx',{account:'youtube'});assert.match(html,/Social account beheren/);assert.match(html,/name="sync_enabled"/);assert.match(html,/name="id" value="youtube"/);
 assert.doesNotMatch((await page('page.tsx',{nieuw:'integratie'})).html,/Social account registreren<\/h2>/);
});
test('legacy social URL preserves callback messages and selected accounts without a second page',async()=>{
 const Page=fixture().load('social/page.tsx').default as (p:unknown)=>Promise<unknown>;
 await assert.rejects(()=>Page({searchParams:Promise.resolve({nieuw:'1',account:'youtube',succes:'meta-sync'})}),/\/app\/integraties\?nieuw=social&account=youtube&succes=meta-sync/);
});
test('logs remain separate and accessible only to board and admin',async()=>{
 const {html,reads}=await page('logs/page.tsx'); assert.match(html,/Integratielogs/);assert.match(html,/11\/11 verwerkt/);assert.ok(reads.every(r=>r.organization==='org'));
 for(const path of ['page.tsx','logs/page.tsx']){const restricted=await page(path,{},'volunteer');assert.equal(restricted.reads.length,0);assert.match(restricted.html,/Alleen bestuur/)}
});

test('excluded AI providers cannot be submitted through the integration action',async()=>{
 const f=fixture();const save=f.load('actions.ts').saveIntegration as (form:FormData)=>Promise<unknown>;
 for(const provider of ['vercel_ai_gateway','openai','anthropic']){
  const form=new FormData();form.set('provider',provider);form.set('display_name','TESTFIXTURE');form.set('status','configured');
  await assert.rejects(()=>save(form),/\/app\/integraties\?fout=velden/);
 }
 assert.equal(f.reads.length,0);
});
