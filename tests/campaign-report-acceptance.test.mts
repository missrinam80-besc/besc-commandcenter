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
import {pilotSelectionFromQuery} from '../src/lib/campaign-pilot-selection.ts';
const native=createRequire(import.meta.url);
const campaign='10000000-0000-4000-8000-000000000001',revision='10000000-0000-4000-8000-000000000002';
const query={metric:'views',definition:'views.v1',semantics:'period',first_start:'2030-01-01T01:00',first_end:'2030-01-02T01:00',second_start:'2030-01-02T01:00',second_end:'2030-01-03T01:00',freshness:'8760',source:'export'};
const asOf='2030-01-04T00:00:00Z';
function fixture():pilot.PilotState&{as_of:string}{
 const selection=pilotSelectionFromQuery(query,asOf)!;const posts=['zero','known','candidate'].map((id,i)=>({id,participant_id:'person',platform:'youtube',external_id:'fixture000'+i,canonical_url:'https://www.youtube.com/watch?v=fixture000'+i,revision:2,status:i===2?'candidate':'verified',availability:'available',checked_at:null}));
 const measurements:pilot.PilotMeasurement[]=[];
 for(const [key,values]of [['first',[0,100,9999]],['second',[10,140,9999]]] as const)for(let i=0;i<posts.length;i++)measurements.push({id:key+posts[i].id,contribution_id:posts[i].id,revision:2,metric:'views',definition:'views.v1',unit:'count',semantics:'period',period_start:selection[key].start,period_end:selection[key].end,measured_at:selection[key].end,fetched_at:'2030-01-03T01:00:00Z',value:values[i],quality:'known',source_kind:'export',source_reference:'TESTFIXTURE - NIET PUBLICEREN - '+key+'-'+posts[i].id});
 return{synthetic:true,campaign_id:campaign,as_of:asOf,chair:false,editor:false,reviewer:false,reader:true,access:[],policies:[],participants:[],posts,measurements};
}
function setup(options:{state?:ReturnType<typeof fixture>;snapshot?:ReturnType<typeof fixture>;enabled?:boolean;formEnabled?:boolean;user?:boolean;member?:boolean;rpcError?:boolean}={}){
 const calls:{name:string;args:Record<string,unknown>}[]=[];const state=options.state??fixture();
 const membershipQuery={select:()=>membershipQuery,eq:()=>membershipQuery,limit:()=>membershipQuery,maybeSingle:async()=>({data:options.member===false?null:{organization_id:'actual-membership-org'},error:null})};
 const supabase={auth:{getUser:async()=>({data:{user:options.user===false?null:{id:'actual-user'}}})},from:(table:string)=>{assert.equal(table,'organization_members');return membershipQuery;},rpc:async(name:string,args:Record<string,unknown>)=>{calls.push({name,args});assert(['f3_campaign_state','f3_report_revision'].includes(name),'No mutation/provider RPC');return{data:name==='f3_report_revision'?(options.snapshot??state):state,error:options.rpcError?{code:'42501'}:null};}};
 const mocks:Record<string,unknown>={
  '@/lib/campaign-pilot':{...pilot,campaignWorkflowEnabled:(synthetic?:boolean)=>options.enabled!==false&&(synthetic===undefined||options.formEnabled!==false)},
  '@/lib/campaign-pilot-selection':{pilotSelectionFromQuery},'@/lib/supabase/server':{createClient:async()=>supabase},
  '@/lib/auth-context':{requireActiveMembership:async()=>({supabase,membership:{organization_id:'actual-membership-org'}})},
  '@/components/app-shell':{AppShell:({children}:{children:React.ReactNode})=>React.createElement('main',{},children)},
  'next/link':{default:({href,children}:{href:string;children:React.ReactNode})=>React.createElement('a',{href},children)},
 };
 function load(file:string){const compiled={exports:{} as Record<string,unknown>};const code=ts.transpileModule(readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;runInNewContext(code,{module:compiled,exports:compiled.exports,URL,URLSearchParams,Response,Request,Date,Intl,process:{env:{}},fetch:()=>{throw Error('Provider access is forbidden')},require:(key:string)=>key.endsWith('.css')?{}:key in mocks?mocks[key]:native(key)});return compiled.exports;}
 const GET=load('src/app/app/campagnes/[id]/proef/rapport/export/route.ts').GET as (request:Request,props:unknown)=>Promise<Response>;
 const Page=load('src/app/app/campagnes/[id]/proef/rapport/page.tsx').default as (props:unknown)=>Promise<React.ReactNode>;
 const csv=(q:Record<string,string>=query)=>GET(new Request('https://fixture.invalid/export?'+new URLSearchParams(q)),{params:Promise.resolve({id:campaign})});
 const html=async(q:Record<string,string>=query)=>renderToStaticMarkup(await Page({params:Promise.resolve({id:campaign}),searchParams:Promise.resolve(q)}));
 return{csv,html,GET,calls,state};
}
test('CA06: actual HTML and CSV retain zero, canonical source, definition, units and exact windows',async()=>{
 const f=setup(),response=await f.csv(),csv=await response.text(),html=await f.html();assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.match(response.headers.get('content-type')??'',/text\/csv/);assert.match(response.headers.get('content-disposition')??'',/attachment/);
 assert(csv.includes('"first","2030-01-01T00:00:00.000Z","2030-01-02T00:00:00.000Z","views","views.v1","period","2","2"'));assert(csv.includes('"first","https://www.youtube.com/watch?v=fixture0000","0","known","export","TESTFIXTURE - NIET PUBLICEREN - first-zero","firstzero"'));assert(!csv.includes('9999'));assert(html.includes('Periodewaarde: 100'));assert(html.includes('Periodewaarde: 150'));assert(html.includes('50.00%'));assert(html.includes('TESTFIXTURE - NIET PUBLICEREN - first-zero'));assert(html.includes('2 van 2 geverifieerde bijdragen gemeten'));assert(!html.includes('9999'));
});
test('CA06: export link preserves full selection and frozen report id',async()=>{
 const q={...query,revisie:revision,benchmark:'manual',engagement:'likes_comments',engagement_definition:'engagement.v1',denominator:'views',denominator_definition:'views.v1'};const f=setup();const dom=new JSDOM(await f.html(q)).window.document;const href=[...dom.querySelectorAll('a')].find(a=>a.textContent==='CSV downloaden')!.getAttribute('href')!;const selected=new URL('https://fixture.invalid'+href);for(const [key,value]of Object.entries(q))assert.equal(selected.searchParams.get(key),value);assert.equal(f.calls[0].name,'f3_report_revision');assert.equal(f.calls[0].args.p_report_id,revision);
});
test('CA06: partial coverage remains explicit and blocks the period comparison',async()=>{
 const s=fixture();s.measurements.find(m=>m.id==='secondknown')!.value=null;s.measurements.find(m=>m.id==='secondknown')!.quality='missing';const f=setup({state:s}),csv=await(await f.csv()).text(),html=await f.html();assert(csv.includes('"second","https://www.youtube.com/watch?v=fixture0001","Onbekend","missing"'));assert(html.includes('gedeeltelijke dekking'));assert(html.includes('Procentueel: Niet berekenbaar'));assert(!html.includes('50.00%'));
});
test('CA06: source selection excludes newer official observations from an export-only report',async()=>{
 const s=fixture();s.measurements.push({...s.measurements[0],id:'official-later',value:9000,source_kind:'official_api',fetched_at:'2030-01-03T02:00:00Z',source_reference:'Other official source'});const f=setup({state:s});const csv=await(await f.csv()).text();assert(!csv.includes('9000'));assert(!csv.includes('Other official source'));assert(csv.includes('first-zero'));
});
test('CA06: frozen export reads the exact revision rather than current changed measurements',async()=>{
 const frozen=fixture(),current=fixture();current.measurements[0].value=9000;const f=setup({state:current,snapshot:frozen});const csv=await(await f.csv({...query,revisie:revision})).text();assert(!csv.includes('9000'));assert.equal(f.calls[0].name,'f3_report_revision');assert.equal(f.calls[0].args.p_organization_id,'actual-membership-org');assert.equal(f.calls[0].args.p_campaign_id,campaign);
});
test('CA06: session/permission revoked at download is rechecked instead of trusting a rendered link',async()=>{
 const allowed=setup();const dom=new JSDOM(await allowed.html()).window.document;const href=[...dom.querySelectorAll('a')].find(a=>a.textContent==='CSV downloaden')!.getAttribute('href')!;const denied=setup({rpcError:true});const response=await denied.GET(new Request('https://fixture.invalid'+href),{params:Promise.resolve({id:campaign})});assert.equal(response.status,403);assert.equal(await response.text(),'{"error":"not_available"}');assert.equal(response.headers.get('cache-control'),'no-store');
});
for(const [options,status]of [[{enabled:false},404],[{user:false},401],[{member:false},403],[{rpcError:true},403],[{formEnabled:false},404]] as const)test('CA06: export refuses disabled or unauthorized context '+JSON.stringify(options),async()=>{const f=setup(options);const response=await f.csv();assert.equal(response.status,status);assert.equal(await response.text(),'{"error":"not_available"}');if('enabled'in options||'user'in options||'member'in options)assert.equal(f.calls.length,0);});
test('CA06: current reader flag is required by both HTML and download',async()=>{const s=fixture();s.reader=false;const f=setup({state:s});assert.equal((await f.csv()).status,403);assert((await f.html()).includes('actuele toegang ontbreekt'));});
for(const patch of [{freshness:'0'},{first_end:query.first_start},{second_start:query.first_start},{second_end:'2031-01-01T01:00'},{source:'scrape'},{semantics:'invented'},{definition:''}])test('CA06: invalid definition/source/window prevents report and export '+JSON.stringify(patch),async()=>{const q={...query,...patch};const f=setup();assert.equal((await f.csv(q)).status,400);assert((await f.html(q)).includes('Kies een definitie en twee niet-overlappende vensters'));});
test('CA06: duplicate or unexpected query fields are rejected before private state read',async()=>{
 for(const extra of ['&source=manual','&unknown=1','&revisie='+revision+'&revisie='+revision]){const f=setup();const response=await f.GET(new Request('https://fixture.invalid/export?'+new URLSearchParams(query)+extra),{params:Promise.resolve({id:campaign})});assert.equal(response.status,400);assert.equal(f.calls.length,0);}
});
test('CA06: report CSV quotes formulas and preserves multiline source evidence',async()=>{
 const s=fixture();s.measurements[0].source_reference='=TESTFIXTURE("quote")\nsecond line';const f=setup({state:s});const csv=await(await f.csv()).text();assert(csv.includes('"\'=TESTFIXTURE(""quote"")\nsecond line"'));assert((await f.html()).includes('=TESTFIXTURE(&quot;quote&quot;)'));
});
test('CA06: cumulative snapshots have per-post changes and no campaign period sum',async()=>{
 const s=fixture();for(const m of s.measurements){m.semantics='cumulative';m.measured_at=new Date(Date.parse(m.period_start)+3600000).toISOString();}const f=setup({state:s}),q={...query,semantics:'cumulative'};const csv=await(await f.csv(q)).text();assert(csv.includes('"counter_delta","https://www.youtube.com/watch?v=fixture0000","10"'));assert(csv.includes('"counter_delta","https://www.youtube.com/watch?v=fixture0001","40"'));assert((await f.html(q)).includes('Campagneoptelsom niet van toepassing'));
});
