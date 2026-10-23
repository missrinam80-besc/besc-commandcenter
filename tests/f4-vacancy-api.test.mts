import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {handleVacancyRequest} from '../src/lib/f4-vacancy-api.ts';
const id='11111111-1111-4111-8111-111111111111',key='TESTFIXTURE-private-vacancy-server-key';
const v={schema_version:'besc-platform-publication-v1',type:'vacancy',public_id:id,revision:1,slug:'testfixture-vacancy',locale:'nl-BE',title:'TESTFIXTURE',role_label:'TESTFIXTURE',summary:'TESTFIXTURE',body:{format:'plain_text',value:'TESTFIXTURE'},location_label:'TESTFIXTURE',availability_label:'TESTFIXTURE',closes_at:'2027-01-01T12:00:00Z',published_at:'2026-10-23T12:00:00Z',valid_until:null};
const headers={Authorization:'Bearer fixture.test.token','X-BESC-Publication-Key':key};
test('Vacancy API: closed gate, private-field rejection and filter-bound cursor',async()=>{
 let calls=0;const d={config:{enabled:false,siteId:id,keyHash:createHash('sha256').update(key).digest('hex')},verify:async()=>true,rpc:async()=>{calls++;return [v]}};
 const req=(query='')=>new Request('https://example.invalid'+query,{headers}),path=['publications','vacancies'];
 assert.equal((await handleVacancyRequest(req(),path,d)).status,404);assert.equal(calls,0);d.config.enabled=true;
 const r=await handleVacancyRequest(req('?limit=1&search=test'),path,d);assert.equal(r.status,200);const body=await r.json();assert(body.next_cursor);
 assert.equal((await handleVacancyRequest(req('?search=other&cursor='+encodeURIComponent(body.next_cursor)),path,d)).status,400);
 d.rpc=async()=>[{...v,motivation:'PRIVATE'}];const denied=await handleVacancyRequest(req(),path,d);assert.equal(denied.status,503);assert(!(await denied.text()).includes('PRIVATE'));
});
