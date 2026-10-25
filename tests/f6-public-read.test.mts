import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {handlePublicWebsiteRequest} from '../src/lib/f6-public-api.ts';
import {publicWebsiteOperations} from '../src/lib/f6-public-contract.ts';
const id='11111111-1111-4111-8111-111111111111',key='TESTFIXTURE-NEVER-USE-THIS-KEY-LIVE-0001';
const config={enabled:true,channelId:id,keyHash:createHash('sha256').update(key).digest('hex')};
const news={schema_version:'besc-website-publication-v1',type:'news',public_id:id,revision:1,slug:'testfixture',locale:'nl-BE',title:'TESTFIXTURE',summary:'TESTFIXTURE',body:{format:'sanitized_html',value:'<p>TESTFIXTURE</p>'},media:[],published_at:'2026-10-25T08:00:00Z'};
function request(path:string,secret=key){return new Request('https://cc.example.invalid/api/v1/public-website/'+path,{headers:{'X-BESC-Publication-Key':secret,Authorization:'Bearer browser-token-must-not-be-used'}});}

test('Public read is default closed and rejects keys or private routes without reaching data',async()=>{
 let calls=0;const deps={config,rpc:async()=>{calls++;return [];},bytes:async()=>new Uint8Array(),rateLimit:()=>true};
 assert.equal((await handlePublicWebsiteRequest(request('news'),['news'],{...deps,config:{...config,enabled:false}})).status,404);
 assert.equal((await handlePublicWebsiteRequest(request('news','wrong'),['news'],deps)).status,401);
 for(const path of ['intake','representation','account','tickets','creators'])assert.equal((await handlePublicWebsiteRequest(request(path),[path],deps)).status,404);
 assert.equal(calls,0);
});

test('Only the channel-bound safe news projection is returned, with no private metadata or caching',async()=>{
 let args:Record<string,unknown>|undefined;
 const result=await handlePublicWebsiteRequest(request('news'),['news'],{config,rpc:async(name,data)=>{assert.equal(name,'f6_public_read');args=data;return [news];},bytes:async()=>new Uint8Array(),rateLimit:()=>true});
 assert.equal(result.status,200);const body=await result.json();assert.equal(body.items.length,1);assert.equal(args?.p_channel_id,id);assert.equal(args?.p_kind,'news');assert.equal(args?.p_server_key,key);assert(!JSON.stringify(body).includes(key));assert.match(result.headers.get('Cache-Control')??'',/no-store/);
 const invalid=await handlePublicWebsiteRequest(request('news'),['news'],{config,rpc:async()=>[{...news,internal_notes:'must not be public'}],bytes:async()=>new Uint8Array(),rateLimit:()=>true});assert.equal(invalid.status,503);assert(!(await invalid.text()).includes('must not be public'));
});

test('Page reads use the separate safe page contract and reject unsafe queries or mismatched locales',async()=>{
 const page={schema_version:'besc-platform-publication-v1',type:'page',public_id:id,revision:1,published_at:'2026-10-25T08:00:00Z',valid_until:null,slug:'home',locale:'nl-BE',title:'TESTFIXTURE',summary:'TESTFIXTURE',body:{format:'plain_text',value:'TESTFIXTURE'},navigation:false,links:[],hero:null};
 const deps={config,rpc:async(name:string,args:Record<string,unknown>)=>{assert.equal(name,'f6_public_read');assert.equal(args.p_kind,'page');return [page];},bytes:async()=>new Uint8Array(),rateLimit:()=>true};
 assert.equal((await handlePublicWebsiteRequest(request('pages/home'),['pages','home'],deps)).status,200);
 assert.equal((await handlePublicWebsiteRequest(request('pages/home?search=secret'),['pages','home'],deps)).status,400);
 assert.equal((await handlePublicWebsiteRequest(request('pages/home?locale=fr-BE'),['pages','home'],deps)).status,503);
});

test('Media withdrawal or changed metadata during download prevents delivery',async()=>{
 const bytes=new Uint8Array([1,2,3]);const locator={path:id+'/'+id+'.png',mime:'image/png',bytes:3,sha256:createHash('sha256').update(bytes).digest('hex')};
 for(const changed of [null,{...locator,path:id+'/22222222-2222-4222-8222-222222222222.png'}]){
  let checks=0;const result=await handlePublicWebsiteRequest(request('media/'+id),['media',id],{config,rpc:async(name)=>{assert.equal(name,'f6_public_media');return ++checks===1?locator:changed;},bytes:async()=>bytes,rateLimit:()=>true});assert.equal(result.status,404);assert.equal(checks,2);
 }
 let checks=0;const valid=await handlePublicWebsiteRequest(request('media/'+id),['media',id],{config,rpc:async()=>{checks++;return locator;},bytes:async()=>bytes,rateLimit:()=>true});assert.equal(valid.status,200);assert.equal(checks,2);
});

test('Rate and write bounds remain enforced; administrative inputs cannot smuggle actor or rights fields',async()=>{
 const deps={config,rpc:async()=>{throw Error('must not read');},bytes:async()=>new Uint8Array(),rateLimit:()=>false};
 assert.equal((await handlePublicWebsiteRequest(request('news'),['news'],deps)).status,429);
 const write=new Request('https://cc.example.invalid/api/v1/public-website/news',{method:'POST'});assert.equal((await handlePublicWebsiteRequest(write,['news'],deps)).status,405);
 const valid={channel_id:id,expected_version:1,enabled:true,reason:'TESTFIXTURE'};assert(publicWebsiteOperations['channel.state'].safeParse(valid).success);assert(!publicWebsiteOperations['channel.state'].safeParse({...valid,actor:id}).success);assert(!publicWebsiteOperations['channel.state'].safeParse({...valid,expected_version:0}).success);
});
