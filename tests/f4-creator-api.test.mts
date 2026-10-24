import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {handleCreatorRequest} from '../src/lib/f4-api.ts';
import {creatorPublicationSchema,parseCreatorOperation,safeCreatorLink} from '../src/lib/f4-contract.ts';
const id='11111111-1111-4111-8111-111111111111',key='TESTFIXTURE-private-server-key-for-contracts';
const profile={schema_version:'besc-platform-publication-v1',type:'creator',public_id:id,revision:1,slug:'testfixture-creator',locale:'nl-BE',display_name:'TESTFIXTURE — NIET PUBLICEREN',published_at:'2026-10-23T12:00:00Z',valid_until:null};
const headers={Authorization:'Bearer fixture.token.test','X-BESC-Publication-Key':key};
const deps=(rpc:Parameters<typeof handleCreatorRequest>[2]['rpc'])=>({config:{enabled:true,siteId:id,keyHash:createHash('sha256').update(key).digest('hex')},verify:async()=>true,rpc,bytes:async()=>new Uint8Array()});

test('F4 contract: omitted unselected fields valid, private fields and unsafe links rejected',()=>{
 assert(creatorPublicationSchema.safeParse(profile).success);assert(!creatorPublicationSchema.safeParse({...profile,email:'private@example.invalid'}).success);
 assert(safeCreatorLink('twitch','https://www.twitch.tv/testfixture'));for(const url of ['https://twitch.tv.evil.test/testfixture','https://twitch.tv@login.evil.test/a','https://www.twitch.tv/testfixture?token=private','https://www.twitch.tv/login','http://www.twitch.tv/testfixture'])assert(!safeCreatorLink('twitch',url));
 assert(!parseCreatorOperation('consent.give',{purpose_id:id,scope:{fields:['display_name']},accepted:false}).success);
});
test('F4 API: closed switch does not contact Auth or database',async()=>{
 let calls=0;const d=deps(async()=>{calls++;return []});d.config.enabled=false;
 const r=await handleCreatorRequest(new Request('https://cc.example/api',{headers}),['publications','creators'],d);assert.equal(r.status,404);assert.equal(calls,0);
});
test('F4 API: public cursor binds site/locale/filters; no private DTO extras',async()=>{
 const seen:Record<string,unknown>[]=[];const d=deps(async(_t,_name,args)=>{seen.push(args);return [profile]});
 const one=await handleCreatorRequest(new Request('https://cc.example/api?limit=1&platform=twitch',{headers}),['publications','creators'],d);assert.equal(one.status,200);assert.match(one.headers.get('cache-control')??'',/no-store/);const body=await one.json();assert(body.next_cursor);
 const two=await handleCreatorRequest(new Request('https://cc.example/api?limit=1&platform=twitch&cursor='+encodeURIComponent(body.next_cursor),{headers}),['publications','creators'],d);assert.equal(two.status,200);assert.equal(seen[1].p_before_id,id);
 const forged=await handleCreatorRequest(new Request('https://cc.example/api?platform=kick&cursor='+encodeURIComponent(body.next_cursor),{headers}),['publications','creators'],d);assert.equal(forged.status,400);
 const leaked=await handleCreatorRequest(new Request('https://cc.example/api',{headers}),['publications','creators'],deps(async()=>[{...profile,user_id:'not-public'}]));assert.equal(leaked.status,503);assert(!(await leaked.text()).includes('not-public'));
});
test('F4 own API: chair commands and oversized writes cannot use own endpoint',async()=>{
 let calls=0;const d=deps(async()=>{calls++;return {id}});
 const ownHeaders={...headers,'Content-Type':'application/json'};
 const bad=await handleCreatorRequest(new Request('https://cc.example/api',{method:'POST',headers:ownHeaders,body:JSON.stringify({operation:'site.configure',data:{own_enabled:true,read_enabled:true,reason:'Not an own operation'},request_id:id})}),['workflow'],d);assert.equal(bad.status,400);assert.equal(calls,0);
 const huge=await handleCreatorRequest(new Request('https://cc.example/api',{method:'POST',headers:ownHeaders,body:'x'.repeat(21000)}),['workflow'],d);assert.equal(huge.status,413);assert.equal(calls,0);
 const good=await handleCreatorRequest(new Request('https://cc.example/api',{method:'POST',headers:ownHeaders,body:JSON.stringify({operation:'consent.withdraw',data:{id,reason:'TESTFIXTURE'},request_id:id})}),['workflow'],d);assert.equal(good.status,200);assert.equal(calls,1);
});
test('F4 API: revoked session and database denial are sanitized',async()=>{
 const d=deps(async()=>{throw Object.assign(new Error('private cause never returned'),{status:403})});
 const r=await handleCreatorRequest(new Request('https://cc.example/api',{headers}),['me'],d);assert.equal(r.status,403);assert(!(await r.text()).includes('private cause'));
 d.verify=async()=>false;const denied=await handleCreatorRequest(new Request('https://cc.example/api',{headers}),['me'],d);assert.equal(denied.status,401);
});
test('F4 media: rights checked after bytes, revoked pixels never returned',async()=>{
 const pixels=Buffer.from('TESTFIXTURE pixels');let checks=0;
 const d=deps(async()=>++checks===1?{path:'private/path.png',mime:'image/png',bytes:pixels.length,sha256:createHash('sha256').update(pixels).digest('hex')}:null);d.bytes=async()=>new Uint8Array(pixels);
 const r=await handleCreatorRequest(new Request('https://cc.example/api',{headers}),['publications','media',id],d);assert.equal(r.status,404);assert(!(await r.text()).includes('pixels'));
});
