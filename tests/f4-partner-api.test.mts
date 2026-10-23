import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {handlePartnerRequest} from '../src/lib/f4-partner-api.ts';
import {partnerPublicationSchema,safePartnerWebsite} from '../src/lib/f4-partner-contract.ts';
const id='11111111-1111-4111-8111-111111111111',key='TESTFIXTURE-private-partner-server-key';
const p={schema_version:'besc-platform-publication-v1',type:'partner',public_id:id,revision:1,slug:'testfixture-partner',locale:'nl-BE',name:'TESTFIXTURE NIET PUBLICEREN',description:'TESTFIXTURE',roles:['esports'],website_url:'https://example.invalid',logo:null,published_at:'2026-10-23T12:00:00Z',valid_until:null};
const headers={Authorization:'Bearer fixture.test.token','X-BESC-Publication-Key':key};
const deps=(rpc:Parameters<typeof handlePartnerRequest>[2]['rpc'])=>({config:{enabled:true,siteId:id,keyHash:createHash('sha256').update(key).digest('hex')},verify:async()=>true,rpc,bytes:async()=>new Uint8Array()});
test('Partner API: closed gate and strict public projection; unsafe websites and private extra fields rejected',async()=>{
 let calls=0;const d=deps(async()=>{calls++;return [p]});d.config.enabled=false;assert.equal((await handlePartnerRequest(new Request('https://example.invalid',{headers}),['publications','partners'],d)).status,404);assert.equal(calls,0);
 assert(partnerPublicationSchema.safeParse(p).success);assert(!partnerPublicationSchema.safeParse({...p,email:'secret@example.invalid'}).success);
 for(const url of ['http://example.com','https://user:pass@example.com/','https://127.0.0.1/x','https://server.internal/x','https://example.com/?token=secret','https://example.com/Private/token','javascript:alert(1)'])assert(!safePartnerWebsite(url),url);
 const r=await handlePartnerRequest(new Request('https://example.invalid',{headers}),['publications','partners'],deps(async()=>[{...p,estimated_value:1000}]));assert.equal(r.status,503);assert(!(await r.text()).includes('estimated_value'));
});
test('Partner API: esports cursor cannot be replayed for another role and media rechecks current rights',async()=>{
 const d=deps(async()=>[p]);const r=await handlePartnerRequest(new Request('https://example.invalid?role=esports&limit=1',{headers}),['publications','partners'],d);assert.equal(r.status,200);const body=await r.json();assert(body.next_cursor);
 const replay=await handlePartnerRequest(new Request('https://example.invalid?role=sponsor&cursor='+encodeURIComponent(body.next_cursor),{headers}),['publications','partners'],d);assert.equal(replay.status,400);
 const bytes=new Uint8Array([1,2,3]);let reads=0;const m=deps(async()=>++reads===1?{path:'TESTFIXTURE/private.png',mime:'image/png',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}:null);m.bytes=async()=>bytes;
 const media=await handlePartnerRequest(new Request('https://example.invalid',{headers}),['publications','partners','media',id],m);assert.equal(media.status,404);assert(!(await media.text()).includes('private.png'));
});
