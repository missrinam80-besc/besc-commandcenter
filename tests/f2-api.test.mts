import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {handleF2Request,Failure} from '../src/lib/f2-api.ts';
import {f2PublicationSchema,safeRegistrationUrl} from '../src/lib/f2-contract.ts';
const key='TESTFIXTURE-server-only-key-0123456789',site='00000000-0000-4000-8000-000000000101';
const item={schema_version:'besc-website-publication-v1',type:'news',public_id:'00000000-0000-4000-8000-000000000102',revision:1,slug:'testfixture',locale:'nl-BE',title:'TESTFIXTURE — NIET PUBLICEREN',summary:'TESTFIXTURE',body:{format:'sanitized_html',value:'<p>TESTFIXTURE</p>'},media:[],published_at:'2030-01-01T10:00:00.123456Z'};
function deps(){return {config:{enabled:true,siteId:site,keyHash:createHash('sha256').update(key).digest('hex')},verify:async()=>true,read:async()=>[item],media:async()=>null,bytes:async()=>new Uint8Array(),rateLimit:()=>true};}
function request(path='news',query='',headers:Record<string,string>={}){return new Request('https://example.invalid/api/v1/publications/'+path+query,{headers:{Authorization:'Bearer fixture.jwt.token','X-BESC-Publication-Key':key,...headers}});}
test('F2 API: disabled and unauthenticated paths never call upstream',async()=>{
 const d=deps();d.read=async()=>{throw Error('must not call');};d.config.enabled=false;assert.equal((await handleF2Request(request(),['news'],d)).status,404);d.config.enabled=true;
 assert.equal((await handleF2Request(request('news','',{'X-BESC-Publication-Key':'bad'}),['news'],d)).status,401);
 assert.equal((await handleF2Request(request('news','',{Authorization:''}),['news'],d)).status,401);
 d.verify=async()=>false;assert.equal((await handleF2Request(request(),['news'],d)).status,401);
});
test('F2 API: limits, duplicate/unknown query fields, invalid types and slugs rejected',async()=>{
 for(const query of ['?limit=0','?limit=-1','?limit=51','?limit=1.5','?limit=02','?locale=xx','?locale=en&locale=nl-BE','?organization_id=private','?cursor=bad'])assert.equal((await handleF2Request(request('news',query),['news'],deps())).status,400,query);
 assert.equal((await handleF2Request(request(),['partners'],deps())).status,404);
 assert.equal((await handleF2Request(request(),['news','private/slash'],deps())).status,400);
});
test('F2 API: strict nested allowlist refuses private fields from producer',async()=>{
 for(const row of [{...item,source_id:'private'},{...item,body:{...item.body,review_note:'private'}},{...item,media:[{public_media_id:site,alt:'TESTFIXTURE',credit:'',private_path:'/secret'}]}]){
  const d={...deps(),read:async()=>[row]};const r=await handleF2Request(request(),['news'],d);assert.equal(r.status,503);assert(!(await r.text()).includes('private'));
 }
});
test('F2 API: parser refuses unsafe HTML and private URLs',()=>{
 for(const html of ['<script>alert(1)</script>','<p onclick="x">test</p>','<img src="http://localhost/">','<iframe src="https://example.invalid"></iframe>'])assert.equal(f2PublicationSchema.safeParse({...item,body:{format:'sanitized_html',value:html}}).success,false);
 assert(f2PublicationSchema.safeParse({...item,body:{format:'sanitized_html',value:'<p>test<br>regel</p>'}}).success);
 for(const url of ['http://example.com','https://localhost/x','https://127.0.0.1/x','https://a.internal/x','https://example.com/private/x','https://example.com/x?token=secret','https://user:pass@example.com/'])assert(!safeRegistrationUrl(url),url);
});
test('F2 API: cursor binds site/type/locale and preserves exact microsecond ordering',async()=>{
 const a=await handleF2Request(request('news','?limit=1'),['news'],deps());const first=await a.json();assert(first.next_cursor);
 let args:Record<string,unknown>={};const d={...deps(),read:async(_t:string,x:Record<string,unknown>)=>{args=x;return [];}};
 assert.equal((await handleF2Request(request('news','?cursor='+first.next_cursor),['news'],d)).status,200);assert.equal(args.p_before_time,item.published_at);
 assert.equal((await handleF2Request(request('events','?cursor='+first.next_cursor),['events'],d)).status,400);
 assert.equal((await handleF2Request(request('news','?locale=en&cursor='+first.next_cursor),['news'],d)).status,400);
 assert.equal((await handleF2Request(request('news','?cursor='+first.next_cursor+'x'),['news'],d)).status,400);
});
test('F2 API: revoked, forbidden and unavailable responses cannot return 304 or stale payload',async()=>{
 for(const status of [403,503]){const d={...deps(),read:async()=>{throw new Failure(status,status===403?'forbidden':'unavailable');}};const r=await handleF2Request(request('news','',{'If-None-Match':'old'}),['news','testfixture'],d);assert.equal(r.status,status);assert.match(r.headers.get('Cache-Control')! ,/no-store/);}
 const d={...deps(),read:async()=>[]};const r=await handleF2Request(request(),['news','testfixture'],d);assert.equal(r.status,404);assert(!(await r.text()).includes(item.title));
});
test('F2 API: rate limiting and media byte integrity are fail closed',async()=>{
 assert.equal((await handleF2Request(request(),['news'],{...deps(),rateLimit:()=>false})).status,429);
 const d={...deps(),media:async()=>({path:'private',sha256:'0'.repeat(64),mime:'image/webp' as const,bytes:1}),bytes:async()=>new Uint8Array([1])};assert.equal((await handleF2Request(request(),['media',site],d)).status,503);
});
