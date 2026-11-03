import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import * as contracts from '../src/lib/rewards-transfer.ts';
import * as permissions from '../src/lib/permissions.ts';
const org='10000000-0000-4000-8000-000000000001',user='20000000-0000-4000-8000-000000000002';
async function invoke(name:'verdienen'|'overgang',form:FormData,options:{role?:string;enabled?:boolean;response?:unknown}={}){
 const output=ts.transpileModule(readFileSync(new URL(`../src/app/app/bucks/${name}/actions.ts`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 const calls:{fn:string;data:Record<string,unknown>}[]=[];const exports:Record<string,unknown>={};
 const mock=(n:string)=>{
  if(n==='next/cache')return {revalidatePath(){}};
  if(n==='next/navigation')return {redirect(url:string){throw Error(url);}};
  if(n==='@/lib/rewards-transfer')return contracts;
  if(n==='@/lib/permissions')return permissions;
  if(n==='@/lib/auth-context')return {async requireActiveMembership(){return {membership:{organization_id:org,role:options.role??'admin',finance_role:'none'},supabase:{async rpc(fn:string,data:Record<string,unknown>){calls.push({fn,data});return {data:options.response??{ok:true},error:null};}}};}};
  throw Error(n);
 };
 runInNewContext(output,{exports,require:mock,File,TextDecoder,Uint8Array,process:{env:{BESC_REWARDS_EARNING_ADMIN_ENABLED:options.enabled===false?'false':'true',BESC_REWARDS_TRANSFER_ENABLED:options.enabled===false?'false':'true'}}});
 let redirected='';try{await(exports[name==='verdienen'?'saveEarning':'saveTransfer'] as (f:FormData)=>Promise<void>)(form);}catch(e){redirected=(e as Error).message;}
 return {calls,redirected};
}
const transfer=()=>{const f=new FormData();for(const[k,v]of Object.entries({op:'execute',id:user,plan_sha256:'a'.repeat(64),reason:'TESTFIXTURE',confirmed:'on',source_stopped:'on',cutoff_confirmed:'on'}))f.set(k,v);return f;};
test('RE03 actions require current authority, flag and all concrete confirmations',async()=>{
 for(const options of [{role:'member'},{enabled:false}])assert.equal((await invoke('overgang',transfer(),options)).calls.length,0);
 for(const k of ['confirmed','source_stopped','cutoff_confirmed']){const f=transfer();f.delete(k);assert.equal((await invoke('overgang',f)).calls.length,0);}
 const result=await invoke('overgang',transfer());assert.equal(result.calls.length,1);assert.equal(result.calls[0].fn,'re03_transfer');assert.equal(result.calls[0].data.o,org);assert.match(result.redirected,/opgeslagen=1/);
});
test('RE03 prepare derives immutable target rows from files, not editable deltas',async()=>{
 const f=new FormData();for(const[k,v]of Object.entries({op:'prepare',id:user,broadcaster_id:'555',cutoff:'2026-11-03T12:00:00Z',declared_total:'100',conversion_verified:'on'}))f.set(k,v);
 f.set('original',new File(['TESTFIXTURE original bytes'],'original.csv'));f.set('export',new File(['external_id,bucks\ntwitch:102,100'],'canonical.csv'));f.set('mapping',new File(['external_id,cc_user_id\ntwitch:102,'+user],'mapping.csv'));
 const result=await invoke('overgang',f);assert.equal(result.calls.length,1);const data=result.calls[0].data.d as Record<string,unknown>;
 assert.deepEqual(JSON.parse(JSON.stringify(data.rows)),[{twitch_user_id:'102',user_id:user,target:'100'}]);assert.match(String(data.original_sha256),/^[a-f0-9]{64}$/);assert.notEqual(data.original_sha256,data.export_sha256);
 f.delete('conversion_verified');assert.equal((await invoke('overgang',f)).calls.length,0);
});
test('RE02 actions require explicit rule version and never activate when merely saving',async()=>{
 const f=new FormData();for(const[k,v]of Object.entries({op:'twitch_save',broadcaster_id:'555',kind:'follow',version:'0',xp:'5',bucks:'10',daily_xp:'10',daily_bucks:'20',cooldown_seconds:'60',minimum_bits:'1',reason:'TESTFIXTURE'}))f.set(k,v);
 const r=await invoke('verdienen',f);assert.equal(r.calls.length,1);assert.equal(r.calls[0].data.op,'twitch_save');assert.equal(Object.hasOwn(r.calls[0].data.d as object,'enabled'),false);
 f.delete('version');assert.equal((await invoke('verdienen',f)).calls.length,0);
});
test('RE02/RE03 action success requires an explicit affirmative storage result',async()=>{
 for(const response of [{},[],{error:'stale_version'}]){const result=await invoke('overgang',transfer(),{response});assert.doesNotMatch(result.redirected,/opgeslagen/);assert.match(result.redirected,/niet-bevestigd/);}
});
