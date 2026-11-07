import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {JSDOM} from 'jsdom';
import * as pilot from '../src/lib/campaign-pilot.ts';
const native=createRequire(import.meta.url);
const campaign='10000000-0000-4000-8000-000000000001',post='10000000-0000-4000-8000-000000000002',actor='10000000-0000-4000-8000-000000000003';
function load(file:string,mocks:Record<string,unknown>){const compiled={exports:{} as Record<string,unknown>};const code=ts.transpileModule(readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;runInNewContext(code,{module:compiled,exports:compiled.exports,process:{env:{}},require:(key:string)=>key.endsWith('.css')?{}:key in mocks?mocks[key]:native(key)});return compiled.exports;}
const link=({href,children}:{href:string;children:React.ReactNode})=>React.createElement('a',{href},children);
const Panel=load('src/components/campaign-pilot-panel.tsx',{'next/link':{default:link},'@/app/app/campagnes/[id]/proef/actions':{runCampaignPilot:async()=>{},runCampaignTwitch:async()=>{}}}).CampaignPilotPanel as React.ComponentType<Record<string,unknown>>;
const state:pilot.PilotState={synthetic:true,campaign_id:campaign,chair:false,editor:false,reviewer:false,reader:true,policies:[],access:[],participants:[],measurements:[],posts:[{id:post,participant_id:actor,canonical_url:'https://www.youtube.com/watch?v=abcdefghijk',external_id:'abcdefghijk',revision:3,status:'rejected',availability:'unknown',checked_at:null}]};
const item={request_id:actor,reviewer_id:actor,reviewer_name:'TESTFIXTURE reviewer',reviewed_at:'2026-11-07T01:00:00Z',from_revision:2,to_revision:3,decision:'rejected',availability:'unknown',reason:'TESTFIXTURE <script>private()</script>\nExact reason'};
const history={post_id:post,items:[item],has_more:false,next_before_revision:null};
async function render(query:Record<string,string>={},options:{history?:unknown;historyError?:boolean;state?:unknown;enabled?:boolean}={}){
 const calls:{name:string;args:Record<string,unknown>}[]=[];
 const supabase={rpc:async(name:string,args:Record<string,unknown>)=>{calls.push({name,args});return name==='f3_campaign_state'?{data:options.state===undefined?state:options.state,error:null}:name==='f1_capabilities'?{data:{chair:false},error:null}:{data:options.history===undefined?history:options.history,error:options.historyError?{code:'42501'}:null};},from:()=>{throw Error('Unexpected broad table read')}};
 const Page=load('src/app/app/campagnes/[id]/proef/page.tsx',{
  '@/components/app-shell':{AppShell:({children}:{children:React.ReactNode})=>React.createElement('main',{},children)},
  '@/components/f5-campaign-tools':{F5CampaignTools:()=>null},'@/components/f1-feedback':{F1Feedback:()=>null},
  '@/components/campaign-pilot-panel':{CampaignPilotPanel:Panel,PilotForm:()=>null},
  '@/lib/auth-context':{requireActiveMembership:async()=>({supabase,membership:{organization_id:'actual-membership-org'}})},
  '@/lib/campaign-pilot':{...pilot,campaignWorkflowEnabled:()=>options.enabled!==false},
 }).default as (p:unknown)=>Promise<React.ReactNode>;
 const html=renderToStaticMarkup(await Page({params:Promise.resolve({id:campaign}),searchParams:Promise.resolve(query)}));return{html,dom:new JSDOM(html).window.document,calls};
}
test('CA02 history UI: no selected contribution performs no history query and keeps source links',async()=>{const s=await render();assert.equal(s.calls.filter(x=>x.name==='f3_review_history').length,0);assert.equal(s.dom.querySelector('#beoordelingshistorie'),null);assert(s.dom.querySelector(`a[href*="bijdrage=${post}"]`));});
test('CA02 history UI: selected source uses membership org, shows exact escaped reason and Brussels time',async()=>{
 const s=await render({bijdrage:post});const call=s.calls.find(x=>x.name==='f3_review_history')!;assert.equal(call.args.p_organization_id,'actual-membership-org');assert.equal(call.args.p_campaign_id,campaign);assert.equal(call.args.p_contribution_id,post);assert.equal(call.args.p_before_revision,null);const section=s.dom.querySelector('#beoordelingshistorie')!;assert(section.textContent?.includes('Afgewezen'));assert(section.textContent?.includes('versie 2 → 3'));assert(section.textContent?.includes(item.reason));assert(section.textContent?.includes('02:00'));assert.equal(section.querySelector('script'),null);assert.equal(section.querySelector('form'),null);assert.equal(section.querySelector('time')?.getAttribute('datetime'),item.reviewed_at);
});
test('CA02 history UI: empty successful response is distinguished from unavailable history',async()=>{const s=await render({bijdrage:post},{history:{...history,items:[]}});assert(s.html.includes('Nog geen beoordelingen binnen deze deelname.'));assert(!s.html.includes('kan niet worden geladen'));});
for(const cursor of ['0','-1','1e2','Infinity','2147483648',''])test('CA02 history UI: invalid cursor never queries private history '+cursor,async()=>{const s=await render({bijdrage:post,voor_revisie:cursor});assert(!s.calls.some(x=>x.name==='f3_review_history'));assert(s.html.includes('kan niet worden geladen'));});
test('CA02 history UI: another or removed contribution has no history query or data',async()=>{for(const id of [actor,'forged']){const s=await render({bijdrage:id});assert(!s.calls.some(x=>x.name==='f3_review_history'));assert(s.html.includes('kan niet worden geladen'));assert(!s.html.includes(item.reason));}});
for(const data of [null,{}, {...history,post_id:actor},{...history,items:[{...item,reviewed_at:'bad-date'}]},{...history,items:[{...item,decision:'published'}]},{...history,items:[{...item,to_revision:8}]},{...history,has_more:true,next_before_revision:2},{...history,items:[{...item,payload:'SECRET'}]}])test('CA02 history UI: malformed response is unavailable rather than empty or rendered '+JSON.stringify(data),async()=>{const s=await render({bijdrage:post},{history:data});assert(s.html.includes('kan niet worden geladen'));assert(!s.html.includes('Nog geen beoordelingen'));assert(!s.html.includes('Exact reason'));});
test('CA02 history UI: denied RPC does not expose a returned payload or imply empty history',async()=>{const s=await render({bijdrage:post},{historyError:true});assert(s.html.includes('kan niet worden geladen'));assert(!s.html.includes('Exact reason'));});
test('CA02 history UI: older page link uses server cursor and exact contribution',async()=>{
 const items=Array.from({length:25},(_,i)=>({...item,request_id:`10000000-0000-4000-8000-${String(i+10).padStart(12,'0')}`,from_revision:29-i,to_revision:30-i}));const s=await render({bijdrage:post,voor_revisie:'30'},{history:{...history,items,has_more:true,next_before_revision:5}});assert.equal(s.calls.find(x=>x.name==='f3_review_history')?.args.p_before_revision,30);const section=s.dom.querySelector('#beoordelingshistorie')!;assert.equal(section.querySelectorAll('li').length,25);assert.equal([...section.querySelectorAll('a')].find(a=>a.textContent==='Oudere beoordelingen')?.getAttribute('href'),`/app/campagnes/${campaign}/proef?bijdrage=${post}&voor_revisie=5#beoordelingshistorie`);
});
test('CA02 history UI: disabled workflow and missing state never reach history RPC',async()=>{for(const options of [{enabled:false},{state:null},{state:{synthetic:'true'}}]){const s=await render({bijdrage:post},options);assert(!s.calls.some(x=>x.name==='f3_review_history'));}});
