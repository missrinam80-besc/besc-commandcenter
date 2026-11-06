import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const native=createRequire(import.meta.url);
function load(path:string,mocks:Record<string,unknown>){
 const mod={exports:{} as Record<string,(value:never)=>Promise<unknown>>};
 runInNewContext(ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module:mod,exports:mod.exports,Date,require:(name:string)=>name in mocks?mocks[name]:native(name)});return mod.exports;
}
test('personal social preference, label and filter render alongside existing notification options',async()=>{
 const preferences={social_sync_notifications:false,deadline_notifications:true,follow_up_notifications:true,assignment_notifications:true,daily_digest:true,weekly_digest:true,reminder_days:[1,3,7]};
 const rows=[{id:'social',type:'social_sync',title:'TESTFIXTURE social',body:'Controleer de integratielogs.',href:'/app/integraties/logs',severity:'warning',created_at:new Date().toISOString(),read_at:null},{id:'task',type:'assignment',title:'TESTFIXTURE task',created_at:new Date().toISOString(),severity:'info'}];
 const supabase={rpc:async()=>({error:null}),from:(table:string)=>{const result={data:table==='notifications'?rows:preferences,error:null};const q={select:()=>q,eq:()=>q,order:()=>q,limit:async()=>result,maybeSingle:async()=>result};return q;}};
 const page=load('src/app/app/meldingen/page.tsx',{
  'next/link':{default:({href,children}:{href:string;children:React.ReactNode})=>React.createElement('a',{href},children)},
  '@/components/app-shell':{AppShell:({children}:{children:React.ReactNode})=>React.createElement('main',null,children)},
  '@/lib/auth-context':{requireActiveMembership:async()=>({supabase,user:{id:'actor'},membership:{organization_id:'org'}})},
  './actions':{markAllRead:()=>{},markNotificationRead:()=>{},saveNotificationPreferences:()=>{}},
 }).default;
 const html=renderToStaticMarkup(await page({searchParams:Promise.resolve({instellingen:'1',filter:'social_sync'})} as never) as React.ReactNode);
 assert.match(html,/name="social_sync_notifications"/);assert.doesNotMatch(html,/<input[^>]*checked=""[^>]*name="social_sync_notifications"/);assert.match(html,/Deadlinewaarschuwingen/);assert.match(html,/TESTFIXTURE social/);assert.doesNotMatch(html,/TESTFIXTURE task/);assert.match(html,/href="\/app\/integraties\/logs"/);
});
test('preference save is personal and preserves other submitted preferences when social warnings are off',async()=>{
 let saved:Record<string,unknown>|undefined;
 const actions=load('src/app/app/meldingen/actions.ts',{
  'next/cache':{revalidatePath:()=>{}},'next/navigation':{redirect:(path:string)=>{throw Error(path);}},
  '@/lib/auth-context':{requireActiveMembership:async()=>({user:{id:'actor'},membership:{organization_id:'org'},supabase:{from:()=>({upsert:async(value:Record<string,unknown>)=>{saved=value;return {error:null};}})}})},
 });
 const fd=new FormData();for(const field of ['deadline_notifications','follow_up_notifications','assignment_notifications','daily_digest','weekly_digest'])fd.set(field,'on');fd.append('reminder_days','3');
 await assert.rejects(actions.saveNotificationPreferences(fd as never),/succes=voorkeuren/);assert.equal(saved?.user_id,'actor');assert.equal(saved?.organization_id,'org');assert.equal(saved?.social_sync_notifications,false);assert.equal(saved?.deadline_notifications,true);assert.equal(saved?.follow_up_notifications,true);
});
