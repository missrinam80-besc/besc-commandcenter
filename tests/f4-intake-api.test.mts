import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {handleIntakeRequest} from '../src/lib/f4-intake-api.ts';
import {intakeOwnSchema,parseIntakeOperation} from '../src/lib/f4-intake-contract.ts';
const id='11111111-1111-4111-8111-111111111111',key='TESTFIXTURE-private-intake-server-key';
const headers={Authorization:'Bearer fixture.test.token','X-BESC-Publication-Key':key,'Content-Type':'application/json'};
const deps=(rpc:Parameters<typeof handleIntakeRequest>[2]['rpc'])=>({config:{enabled:true,siteId:id,keyHash:createHash('sha256').update(key).digest('hex')},verify:async()=>true,rpc});
test('Intake switch and own-operation boundary prevent handler grants and unbounded requests',async()=>{
 let calls=0;const d=deps(async()=>{calls++;return {id}});d.config.enabled=false;assert.equal((await handleIntakeRequest(new Request('https://example.invalid',{headers}),[],d)).status,404);assert.equal(calls,0);d.config.enabled=true;
 const submit=(body:unknown)=>handleIntakeRequest(new Request('https://example.invalid',{method:'POST',headers,body:JSON.stringify(body)}),['workflow'],d);
 assert.equal((await submit({operation:'handler.assign',data:{},request_id:id})).status,400);
 assert.equal((await submit({operation:'application.submit',data:{form_id:id,notice_version:'v1',notice_acknowledged:false,payload:{organization_name:'TESTFIXTURE',requested_roles:['esports'],message:'TESTFIXTURE'}},request_id:id})).status,400);
 assert.equal((await submit({payload:'a'.repeat(13000)})).status,413);assert.equal(calls,0);
 assert.equal((await submit({operation:'application.withdraw',data:{id,expected_version:1},request_id:id})).status,200);assert.equal(calls,1);
});
test('Own intake schema rejects internal notes, unexpected actor keys and other receipt IDs',async()=>{
 const own={schema_version:'besc-intake-own-v1',lease_id:id,forms:[],applications:[]};assert(intakeOwnSchema.safeParse(own).success);assert(!intakeOwnSchema.safeParse({...own,internal_note:'secret'}).success);
 const r=await handleIntakeRequest(new Request('https://example.invalid',{headers}),[],deps(async()=>({...own,internal_note:'TESTFIXTURE secret'})));assert.equal(r.status,503);assert(!(await r.text()).includes('secret'));
 assert(!parseIntakeOperation('application.submit',{form_id:id,notice_version:'v1',notice_acknowledged:true,payload:{organization_name:'TESTFIXTURE',requested_roles:['esports'],message:'TESTFIXTURE',actor_id:id}}).success);
});
