import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import * as pilot from '../src/lib/campaign-pilot.ts';
const native=createRequire(import.meta.url);
const campaign='10000000-0000-4000-8000-000000000001', post='10000000-0000-4000-8000-000000000002';
type Response={data:unknown;error:null|{code:string}};
function setup(options:{state?:Response;result?:Response;enabled?:boolean;user?:boolean}={}){
 const calls:{name:string;args:Record<string,unknown>}[]=[],invalidated:string[]=[];
 const compiled={exports:{} as {runCampaignPilot:(f:FormData)=>Promise<void>}};
 const code=ts.transpileModule(readFileSync(new URL('../src/app/app/campagnes/[id]/proef/actions.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const mocks:Record<string,unknown>={
  'next/navigation':{redirect:(url:string)=>{throw Error('REDIRECT:'+url)}},'next/cache':{revalidatePath:(path:string)=>invalidated.push(path)},
  '@/lib/campaign-pilot':{...pilot,campaignWorkflowEnabled:()=>options.enabled!==false},'@/lib/format':{localDateTimeToIso:(v:string)=>v},
  '@/lib/auth-context':{},'@/lib/supabase/admin':{},'@/lib/campaign-twitch':{},
  '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:options.user===false?null:{id:'actor'}}})},rpc:async(name:string,args:Record<string,unknown>)=>{calls.push({name,args});return name==='f3_campaign_state'?(options.state??{data:{synthetic:true},error:null}):(options.result??{data:{id:post},error:null})}})}
 };
 runInNewContext(code,{module:compiled,exports:compiled.exports,FormData,process:{env:{}},fetch:()=>{throw Error('Unexpected provider/network call')},require:(key:string)=>key in mocks?mocks[key]:native(key)});
 const form=new FormData();for(const [k,v]of Object.entries({campaign_id:campaign,organization_id:campaign,request_id:campaign,operation:'post.review',data_id:post,data_expected_revision:'1',data_decision:'verified',data_availability:'available',data_reason:'TESTFIXTURE - NIET PUBLICEREN - independent review'}))form.set(k,v);
 return{action:compiled.exports.runCampaignPilot,form,calls,invalidated};
}
test('CA02 action: confirmed review forwards revision, reason and context, then refreshes',async()=>{
 const s=setup();await assert.rejects(s.action(s.form),/succes=opgeslagen/);assert.equal(s.calls.length,2);const call=s.calls[1];assert.equal(call.name,'f3_workflow');assert.equal(call.args.p_campaign_id,campaign);const data=call.args.p_data as Record<string,unknown>;assert.equal(data.expected_revision,1);assert.equal(data.decision,'verified');assert.match(String(data.reason),/TESTFIXTURE/);assert.deepEqual(s.invalidated,[`/app/campagnes/${campaign}/proef`]);
});
for(const data of [null,{},[],{id:''},{id:'not-a-uuid'},{id:campaign}])test('CA02 action: unconfirmed/mismatched review result never reports success '+JSON.stringify(data),async()=>{
 const s=setup({result:{data,error:null}});await assert.rejects(s.action(s.form),/REDIRECT:.*\?melding=/);assert.deepEqual(s.invalidated,[]);
});
for(const data of [null,{}, {synthetic:'false'}])test('CA02 action: unavailable campaign state blocks mutation '+JSON.stringify(data),async()=>{
 const s=setup({state:{data,error:null}});await assert.rejects(s.action(s.form),/fout=uitgeschakeld/);assert.equal(s.calls.length,1);assert.deepEqual(s.invalidated,[]);
});
for(const code of ['42501','40001','23505'])test('CA02 action: denied or conflicting review has no success or invalidation '+code,async()=>{
 const s=setup({result:{data:null,error:{code}}});await assert.rejects(s.action(s.form),/\?melding=/);assert.deepEqual(s.invalidated,[]);
});
test('CA02 action: disabled workflow and signed-out user perform no RPC',async()=>{
 for(const options of [{enabled:false},{user:false}]){const s=setup(options);await assert.rejects(s.action(s.form),/uitgeschakeld|\/login/);assert.equal(s.calls.length,0);}
});
test('CA02 action: invalid review cannot reach database',async()=>{
 for(const [key,value]of [['data_reason',' '],['data_expected_revision','0'],['data_decision','published'],['data_availability','forged']]){const s=setup();s.form.set(key,value);await assert.rejects(s.action(s.form),/fout=velden/);assert.equal(s.calls.length,0);}
});
test('CA02 action: accepted URL variants forward one canonical identity without reading provider',async()=>{
 for(const [url,platform,external]of [['https://youtu.be/abcdefghijk?t=30','youtube','abcdefghijk'],['https://www.youtube.com/watch?v=abcdefghijk&list=ignored','youtube','abcdefghijk'],['https://www.twitch.tv/creator/clip/FixtureClip?tracking=ignored','twitch','clip:FixtureClip'],['https://clips.twitch.tv/FixtureClip','twitch','clip:FixtureClip']]){
  const s=setup();s.form.set('operation','post.submit');for(const k of ['data_id','data_expected_revision','data_decision','data_availability','data_reason'])s.form.delete(k);s.form.set('data_participant_id',post);s.form.set('post_url',url);await assert.rejects(s.action(s.form),/succes=opgeslagen/);const d=s.calls[1].args.p_data as Record<string,unknown>;assert.equal(d.platform,platform);assert.equal(d.external_id,external);assert(!JSON.stringify(d).includes('tracking'));
 }
});
test('CA02 action: unsafe source links stop before state or mutation RPC',async()=>{
 for(const url of ['http://youtu.be/abcdefghijk','https://youtube.com.evil.invalid/watch?v=abcdefghijk','https://user:secret@youtube.com/watch?v=abcdefghijk','https://127.0.0.1/private','javascript:alert(1)','https://youtube.com/watch?v=abcdefghijk&v=12345678901']){
  const s=setup();s.form.set('operation','post.submit');s.form.set('post_url',url);await assert.rejects(s.action(s.form),/fout=link/);assert.equal(s.calls.length,0);
 }
});
