import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import ts from 'typescript';
import type {CreatorYouTubeAccount as Component} from '../src/components/creator-youtube-account.tsx';
const native=createRequire(import.meta.url),modules=new Map<string,unknown>();
function load(name:string):unknown{
 if(modules.has(name))return modules.get(name);const compiled={exports:{}};const source=readFileSync(new URL('../src/components/'+name+'.tsx',import.meta.url),'utf8');
 runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{module:compiled,exports:compiled.exports,URL,fetch:()=>{throw Error('No ambient network');},FormData:function(form:HTMLFormElement){return new FormData(form as never);},setInterval,clearInterval,window:new Proxy({},{get:(_target,key)=>Reflect.get(globalThis.window,key)}),require:(key:string)=>key==='./creator-youtube-connect'?load('creator-youtube-connect'):native(key)});modules.set(name,compiled.exports);return compiled.exports;
}
const {CreatorYouTubeAccount}=load('creator-youtube-account') as {CreatorYouTubeAccount:typeof Component};
const cleanups:(()=>Promise<void>)[]=[];
afterEach(async()=>{for(const undo of cleanups.splice(0).reverse())await undo();});
const link='00000000-0000-4000-8000-000000000001',channel='UC'+'A'.repeat(22),video='abcdefghijk';
const consent={purpose:'TESTFIXTURE - NIET PUBLICEREN',channel_id:channel,video_ids:[video],start_date:'2026-11-01',end_date:'2026-11-06',valid_until:'2030-01-01T00:00:00Z',retain_until:'2030-02-01T00:00:00Z'};
async function mount(options:{empty?:boolean;fail?:boolean;status?:'pending'|'active'|'revoked';provider?:string;pending?:boolean;expired?:boolean;samples?:unknown[];next?:string}={}){
 const dom=new JSDOM('<!doctype html><main id="root"></main>',{url:'https://creator.fixture.invalid/app/account?creator_youtube=completed&link=FOREIGN'}),saved=new Map<string,PropertyDescriptor|undefined>();
 for(const [key,value]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,FormData:dom.window.FormData,IS_REACT_ACT_ENVIRONMENT:true})){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});}
 const calls:{url:string;input?:Record<string,unknown>}[]=[],destinations:string[]=[];
 const detail={id:link,channel_id:channel,status:options.status??'active',provider_revocation:options.provider??'none',consent:{...consent,...(options.expired?{valid_until:'2026-01-01T00:00:00Z'}:{})},samples:options.samples??[]};
 const summary={id:link,channel_id:channel,status:detail.status,provider_revocation:detail.provider_revocation,valid_until:detail.consent.valid_until,retain_until:consent.retain_until};
 const transport=async(url:string,init:RequestInit)=>{
  const input=init.body?JSON.parse(String(init.body)):undefined;calls.push({url,input});
  if(options.fail)return Response.json({status:'not_confirmed'},{status:400});
  if(input){if(input.action==='start')return Response.json({status:'prepared',link,authorizationUrl:'https://accounts.google.com/o/oauth2/v2/auth?state=MOCK'});if(input.action==='prepare-refresh')return Response.json({status:'prepared'});if(input.action==='refresh')return Response.json({status:'completed'});if(input.action==='collect')return Response.json({status:'collected'});if(input.action==='disconnect')return Response.json({status:'disconnected',provider:'complete'});return Response.json({status:'cancelled',provider:'none',exchangeNotStarted:true});}
  const pending=options.pending?{link,kind:'authorize',status:'pending',expires:Date.now()+300000,provider:null}:null;
  return Response.json({status:'ready',...(url.includes('?link=')?{link:detail}:{account:{links:options.empty?[]:[summary],next_after:options.next??null}}),pending});
 };
 const root=createRoot(dom.window.document.getElementById('root')!);cleanups.push(async()=>{await act(async()=>root.unmount());dom.window.close();for(const [key,value]of saved){if(value)Object.defineProperty(globalThis,key,value);else Reflect.deleteProperty(globalThis,key);}});
 await act(async()=>root.render(React.createElement(CreatorYouTubeAccount,{transport,navigate:url=>destinations.push(url)})));
 const flush=async()=>{await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});};await flush();
 const button=(text:string)=>[...dom.window.document.querySelectorAll('button')].find(v=>v.textContent===text);
 const click=async(text:string)=>{const b=button(text);assert(b,'Missing '+text);await act(async()=>b.click());await flush();};
 return{dom,calls,destinations,button,click,flush,text:()=>dom.window.document.body.textContent??''};
}

test('CA03 account UI: actual owner read controls connection; callback query parameters supply no authority',async()=>{const a=await mount({empty:true});assert(!a.text().includes('Je kanaal is gekoppeld.'));assert(!a.button('Statistieken ophalen'));assert.deepEqual(a.calls.map(v=>v.url),['/api/creator-youtube']);assert(a.button('Toestemming controleren'));});

test('CA03 account UI: zero and missing metrics retain their meaning, units and dates',async()=>{const a=await mount({samples:[{video_id:video,metric:'views',unit:'count',value:0,quality:'known',start_date:'2026-11-01',end_date:'2026-11-06',measured_at:'2026-11-07T10:00:00Z'},{video_id:video,metric:'estimatedMinutesWatched',unit:'minutes',value:null,quality:'missing',start_date:'2026-11-01',end_date:'2026-11-06',measured_at:'2026-11-07T10:00:00Z'}]});assert(a.text().includes('Je kanaal is gekoppeld.'));const cells=[...a.dom.window.document.querySelectorAll('tbody td')].map(v=>v.textContent);assert(cells.includes('0'));assert(cells.includes('Ontbreekt'));assert(cells.includes('minuten'));assert(a.text().includes('2026-11-07T10:00:00Z'));});

test('CA03 account UI: refresh uses two requests, collect and disconnect use selected owner link only',async()=>{const a=await mount();await a.click('Toegang vernieuwen');assert.deepEqual(a.calls.filter(v=>v.input).map(v=>v.input?.action),['prepare-refresh','refresh']);assert.equal(a.calls.find(v=>v.input?.action==='prepare-refresh')?.input?.link,link);await a.click('Statistieken ophalen');await a.click('Koppeling intrekken');assert(a.calls.filter(v=>['collect','disconnect'].includes(String(v.input?.action))).every(v=>v.input?.link===link));assert(a.text().includes('Koppeling ingetrokken.'));});

test('CA03 account UI: confirmed pending request exposes recovery/cancel and blocks starting another request',async()=>{const a=await mount({status:'pending',pending:true});assert(a.button('Aanvraag herstellen'));assert(a.button('Aanvraag annuleren'));assert(!a.button('Toestemming controleren'));await a.click('Aanvraag annuleren');assert.equal(a.calls.at(-1)?.input?.action,'cancel');assert(a.text().includes('afgesloten zonder tokenwisseling'));});

test('CA03 account UI: missing browser proof and unavailable owner status cannot release mutation controls',async()=>{const a=await mount({status:'pending'});assert(a.text().includes('geen herstelbewijs'));assert(a.button('Toestemming geven en naar Google')?.disabled);const b=await mount({fail:true});assert(b.text().includes('niet worden bevestigd'));assert(!b.button('Statistieken ophalen'));assert(!b.button('Toestemming controleren'));});

test('CA03 account UI: pending provider revocation and expired consent do not look connected or offer collection',async()=>{const a=await mount({status:'revoked',provider:'pending'});assert(a.button('Intrekking opnieuw controleren'));assert(!a.button('Toestemming geven en naar Google'));assert(!a.button('Statistieken ophalen'));const b=await mount({expired:true});assert(!b.button('Statistieken ophalen'));assert(b.text().includes('termijn is verstreken'));assert(b.button('Intrekking opnieuw controleren'));});

test('CA03 account UI: new scope requires explicit fields and a separate consent checkbox before navigation',async()=>{
 const a=await mount({empty:true}),form=a.dom.window.document.querySelector('form')!;const fields={purpose:'TESTFIXTURE - NIET PUBLICEREN',channel,videos:video,start:'2026-11-01',end:'2026-11-06',valid:'2030-01-01T12:00',retain:'2030-02-01T12:00'};
 for(const [name,value]of Object.entries(fields))(form.elements.namedItem(name) as HTMLInputElement).value=value;
 await act(async()=>form.dispatchEvent(new a.dom.window.Event('submit',{bubbles:true,cancelable:true})));await a.flush();assert(a.button('Toestemming geven en naar Google')?.disabled);assert.equal(a.calls.filter(v=>v.input).length,0);
 const checkbox=a.dom.window.document.querySelector('input[type=checkbox]') as HTMLInputElement;await act(async()=>checkbox.click());await a.click('Toestemming geven en naar Google');assert.equal(a.calls.at(-1)?.input?.action,'start');assert.equal((a.calls.at(-1)?.input?.consent as {accepted:boolean}).accepted,true);assert.equal(a.destinations.length,1);assert(a.destinations[0].startsWith('https://accounts.google.com/'));
});


test('CA03 account UI: browser recovery takes precedence over an empty ordinary revocation retry',async()=>{const a=await mount({status:'revoked',provider:'pending',pending:true});assert(a.button('Aanvraag herstellen'));assert(a.button('Aanvraag annuleren'));assert(!a.button('Intrekking opnieuw controleren'));await a.click('Aanvraag herstellen');assert.equal(a.calls.at(-1)?.input?.action,'recover');});
