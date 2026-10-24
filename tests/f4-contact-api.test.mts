import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {handleIntakeRequest} from '../src/lib/f4-intake-api.ts';
const id='11111111-1111-4111-8111-111111111111',key='TESTFIXTURE contact server key never live',headers={Authorization:'Bearer fixture.test.token','X-BESC-Publication-Key':key,'Content-Type':'application/json'};
test('Contact API: independent switch, hidden closed forms, strict payload and bounded Unicode message',async()=>{
 let calls=0;const form={id,category:'general_contact',title:'TESTFIXTURE',version:1,notice_version:'TEST-v1',notice_body:'TESTFIXTURE privacytext',legal_basis:'TESTFIXTURE',retention_policy:'TESTFIXTURE',closes_at:'2027-01-01T12:00:00Z'},own={schema_version:'besc-intake-own-v1',lease_id:id,forms:[form],applications:[]};
 const deps={config:{enabled:true,siteId:id,keyHash:createHash('sha256').update(key).digest('hex'),contactEnabled:false},verify:async()=>true,rpc:async(_token:string,name:string)=>{calls++;return name==='f4_intake_me'?own:{id}}};
 const input={operation:'application.submit',request_id:id,data:{form_id:id,notice_version:'TEST-v1',notice_acknowledged:true,payload:{subject:'TESTFIXTURE',message:'TESTFIXTURE'}}};const request=(body:unknown)=>new Request('https://example.invalid',{method:'POST',headers,body:JSON.stringify(body)});
 assert.equal((await handleIntakeRequest(request(input),['workflow'],deps)).status,404);assert.equal(calls,0);const filtered=await handleIntakeRequest(new Request('https://example.invalid',{headers}),[],deps);assert.equal((await filtered.json()).forms.length,0);
 deps.config.contactEnabled=true;const large={...input,data:{...input.data,payload:{subject:'TESTFIXTURE',message:'漢'.repeat(4000)}}};assert.equal((await handleIntakeRequest(request(large),['workflow'],deps)).status,200);
 const invalid={...input,data:{...input.data,payload:{...input.data.payload,email:'PRIVATE@example.invalid'}}};const before=calls;assert.equal((await handleIntakeRequest(request(invalid),['workflow'],deps)).status,400);assert.equal(calls,before);
 const administrative={operation:'contact.configure',request_id:id,data:{form_id:id,enabled:true,expected_version:0,reason:'TESTFIXTURE'}};assert.equal((await handleIntakeRequest(request(administrative),['workflow'],deps)).status,400);
});
