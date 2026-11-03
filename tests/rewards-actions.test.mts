import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {randomUUID} from 'node:crypto';
import ts from 'typescript';
import * as rewards from '../src/lib/rewards.ts';
import * as permissions from '../src/lib/permissions.ts';

async function invoke(response:unknown,role='admin',confirmed=true){
 const output=ts.transpileModule(readFileSync(new URL('../src/app/app/bucks/actions.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 const calls:unknown[]=[];const exports:Record<string,unknown>={};
 const require=(name:string)=>{
  if(name==='next/cache')return {revalidatePath(){}};
  if(name==='next/navigation')return {redirect(url:string){throw Error(url);}};
  if(name==='@/lib/rewards')return rewards;
  if(name==='@/lib/permissions')return permissions;
  if(name==='@/lib/auth-context')return {async requireActiveMembership(){return {membership:{organization_id:randomUUID(),role,finance_role:'none'},supabase:{async rpc(...args:unknown[]){calls.push(args);return {data:response,error:null};}}};}};
  throw Error(name);
 };
 runInNewContext(output,{exports,require});
 const form=new FormData();for(const [k,v] of Object.entries({operation:'refund',return_tab:'beheer',submission_id:randomUUID(),id:randomUUID(),version:'2',reason:'TESTFIXTURE niet geleverd',...(confirmed?{confirmed:'on'}:{})}))form.set(k,v);
 let redirected='';try{await (exports.saveRewardAction as (f:FormData)=>Promise<void>)(form);}catch(e){redirected=(e as Error).message;}
 return {calls,redirected};
}

test('RE01-opslag: alleen expliciet bevestigde terugbetaling met beheersbevoegdheid gaat naar RPC',async()=>{
 for(const args of [{role:'member',confirmed:true,error:'rewards_forbidden'},{role:'admin',confirmed:false,error:'invalid_fields'}]){
  const r=await invoke({ok:true},args.role,args.confirmed);assert.equal(r.calls.length,0);assert.match(r.redirected,new RegExp(args.error));
 }
 const ok=await invoke({ok:true});assert.equal(ok.calls.length,1);assert.match(ok.redirected,/opgeslagen=1/);
});

test('RE01-opslag: leeg of onvolledig opslagantwoord wordt nooit als succes getoond',async()=>{
 for(const data of [null,{},[],{error:'stale_version'}]){
  const r=await invoke(data);assert.equal(r.calls.length,1);assert.doesNotMatch(r.redirected,/opgeslagen/);assert.match(r.redirected,/fout=/);
 }
});
