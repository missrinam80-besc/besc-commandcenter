import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const source=readFileSync(new URL('../ops/monitoring/upload.cjs',import.meta.url),'utf8');
const packet={organization_id:'999b6af9-479c-4082-b9d8-fa0a78aefac5',target:'web',observed_at:new Date().toISOString(),snapshot:{metrics:{disk_free_kib:1000000},checks:[{code:'disk',level:'warning'}]}};
function run(mode='ok',bot=false,url='https://fixture.supabase.co'){
 const fake=`globalThis.fetch=async(url,init)=>{if(init.redirect!=='error'||init.headers.apikey!=='TESTFIXTURE-service-secret'||init.headers.Authorization!=='Bearer TESTFIXTURE-service-secret')throw Error('unexpected_headers');const payload=JSON.parse(init.body);if(JSON.stringify(payload).includes('TESTFIXTURE-service-secret'))throw Error('credential_in_payload');if(${JSON.stringify(mode)}==='network')throw Error('PRIVATE_RESPONSE');return {ok:${JSON.stringify(mode)}!=='denied',json:async()=>String(url).endsWith('ops_database_snapshot')?{metrics:{db_bytes:100},checks:[{code:'database',level:'ok'}]}:{target:payload.p_target,status:'ok',recorded:true}};};`;
 const body=bot?{...packet,bot:{...packet,target:'bot'}}:packet;
 return spawnSync(process.execPath,['-e',fake+source],{input:JSON.stringify(body),encoding:'utf8',env:{...process.env,SUPABASE_URL_SERVER:url,SUPABASE_SECRET_KEY:'TESTFIXTURE-service-secret'},timeout:10000});
}
test('OP01 uploader runs with Node built-ins and uploads only typed web/database status',()=>{const r=run();assert.equal(r.status,0,r.stderr);const result=JSON.parse(r.stdout);assert.deepEqual(result.targets.map((x:{target:string})=>x.target),['web','database']);assert(!r.stdout.includes('TESTFIXTURE-service-secret'));});
test('OP01 uploader accepts the matching fixed bot-probe packet without sharing a service credential',()=>{const r=run('ok',true);assert.equal(r.status,0,r.stderr);assert.deepEqual(JSON.parse(r.stdout).targets.map((x:{target:string})=>x.target),['web','database','bot']);});
test('OP01 upload failures and invalid origins expose neither credentials nor upstream errors',()=>{for(const r of [run('network'),run('denied'),run('ok',false,'http://fixture.supabase.co')]){assert.equal(r.status,1);assert(!r.stderr.includes('PRIVATE_RESPONSE'));assert(!r.stderr.includes('TESTFIXTURE-service-secret'));assert(!r.stdout.includes('TESTFIXTURE-service-secret'));}});
