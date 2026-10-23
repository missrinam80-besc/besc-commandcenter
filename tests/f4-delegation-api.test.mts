import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {handleDelegationRequest} from '../src/lib/f4-delegation-api.ts';
import {delegationOwnSchema,delegatedProfileSchema} from '../src/lib/delegation-contract.ts';
const id='11111111-1111-4111-8111-111111111111',key='TESTFIXTURE delegation server key';
const state={schema_version:'besc-delegation-own-v1',lease_id:id,delegations:[],proposals:[]};
const headers={Authorization:'Bearer fixture.test.token','X-BESC-Publication-Key':key};
test('Delegation API: default off, no administrative writes, no private extra fields or another delegation',async()=>{
 let calls=0;const d={config:{enabled:false,siteId:id,keyHash:createHash('sha256').update(key).digest('hex')},verify:async()=>true,rpc:async()=>{calls++;return state}};
 const req=()=>new Request('https://example.invalid',{headers});assert.equal((await handleDelegationRequest(req(),[],d)).status,404);assert.equal(calls,0);d.config.enabled=true;
 const post=new Request('https://example.invalid',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({operation:'delegation.assign',data:{},request_id:id})});assert.equal((await handleDelegationRequest(post,['workflow'],d)).status,400);assert.equal(calls,0);
 assert.equal((await handleDelegationRequest(req(),['delegations',id],d)).status,503);
 assert(!delegationOwnSchema.safeParse({...state,contracts:['PRIVATE']}).success);
 for(const url of ['bad','javascript:alert(1)','https://example.invalid/?token=SECRET','https://127.0.0.1/','https://server.internal/','https://example.invalid/private/file'])assert(!delegatedProfileSchema.safeParse({name:'TESTFIXTURE',description:'TESTFIXTURE',website_url:url}).success,url);
});
