import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {handleSiteContentRequest} from '../src/lib/f4-content-api.ts';
import {pagePayloadSchema,migrationRecordSchema} from '../src/lib/site-content-contract.ts';
const id='11111111-1111-4111-8111-111111111111',key='TESTFIXTURE static content server key',headers={Authorization:'Bearer fixture.test.token','X-BESC-Publication-Key':key};
const p={slug:'testfixture',locale:'nl-BE',title:'TESTFIXTURE',summary:'TESTFIXTURE',body:{format:'plain_text',value:'TESTFIXTURE'},navigation:true,links:[],hero:null,schema_version:'besc-platform-publication-v1',type:'page',public_id:id,revision:1,published_at:'2026-10-24T06:00:00Z',valid_until:null};
test('Content API: closed flags, strict public fields, exact source queries and private media recheck',async()=>{
 let calls=0;let raw:unknown=[p];const d={config:{enabled:false,siteId:id,keyHash:createHash('sha256').update(key).digest('hex')},verify:async()=>true,rpc:async()=>{calls++;return raw},bytes:async()=>new Uint8Array([1,2,3])};const req=(q='')=>new Request('https://example.invalid'+q,{headers});
 assert.equal((await handleSiteContentRequest(req(),['publications','pages'],d)).status,404);assert.equal(calls,0);d.config.enabled=true;raw=[{...p,proof_document_id:id}];assert.equal((await handleSiteContentRequest(req(),['publications','pages'],d)).status,503);
 raw={schema_version:'besc-legacy-resolution-v1',public_id:id,revision:1,status:307,target_path:'https://evil.invalid'};assert.equal((await handleSiteContentRequest(req('?host=www.belgianstreamerscommunity.be&path=%2Foude&query='),['legacy','resolve'],d)).status,503);
 const before=calls;assert.equal((await handleSiteContentRequest(req('?host=www.belgianstreamerscommunity.be&path=%2Foude&query=token%3DPRIVATE'),['legacy','resolve'],d)).status,400);assert.equal(calls,before);
 let reads=0;d.rpc=async()=>++reads===1?{path:'PRIVATE/file.png',sha256:createHash('sha256').update(new Uint8Array([1,2,3])).digest('hex'),mime:'image/png',bytes:3}:null;const r=await handleSiteContentRequest(req(),['publications','pages','media',id],d);assert.equal(r.status,404);assert(!(await r.text()).includes('PRIVATE'));
 assert(!pagePayloadSchema.safeParse({...p,slug:'login'}).success);
});
test('Content review package: all historical records retained with hashes, blocked concepts and original source error',()=>{
 const bundle=JSON.parse(readFileSync(new URL('../src/lib/site-content-bundle.json',import.meta.url),'utf8')),mapping=JSON.parse(readFileSync(new URL('../docs/f4/content-migration-register.json',import.meta.url),'utf8'));assert.equal(bundle.records.length,98);assert.equal(bundle.candidates.length,3);assert.equal(bundle.source_errors.length,1);assert.equal(bundle.current_site_crawled,false);assert.equal(bundle.live_changes,false);assert.equal(bundle.source_snapshot_hash,mapping.source_sha256_lf);
 assert.deepEqual(bundle.records.map((r:{record_id:string})=>r.record_id),mapping.records.map((r:{id:string})=>r.id));for(const r of bundle.records)migrationRecordSchema.parse(r);for(const c of bundle.candidates){pagePayloadSchema.parse(c.payload);assert.equal(c.current_facts_verified,false);assert.equal(c.rights_verified,false);assert.equal(c.payload.navigation,false);}assert.equal(readFileSync(new URL('../src/lib/site-content-bundle.json',import.meta.url),'utf8'),readFileSync(new URL('../docs/f4/content-review-package.json',import.meta.url),'utf8'));
});
