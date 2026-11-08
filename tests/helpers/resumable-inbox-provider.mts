import assert from 'node:assert/strict';
import type {MetaInboxSelection} from '../../src/lib/meta-inbox-protocol.ts';
import {socialInboxMetaRequirements} from '../../src/lib/social-inbox.ts';
export type {MetaInboxSelection};export {socialInboxMetaRequirements};
export function mockInboxProvider(target:MetaInboxSelection,count=70){
 const state={mode:'ok',calls:[] as {path:string;after:string|null;method:string}[],transport:null as unknown as typeof fetch};
 state.transport=async(input,init)=>{
  const url=new URL(String(input));assert.equal(url.origin,'https://graph.facebook.com');assert.equal(init?.method,'GET');assert.equal(init?.redirect,'error');const path=url.pathname.replace('/v25.0/',''),after=url.searchParams.get('after');state.calls.push({path,after,method:String(init?.method)});const json=(v:unknown,status=200,headers:Record<string,string>={})=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json',...headers}});
  if(path==='debug_token')return json({data:{is_valid:true,type:'PAGE',app_id:'100',profile_id:'456',scopes:socialInboxMetaRequirements(target.platform,target.kind),expires_at:0}});
  if(path==='456')return json({id:'456',instagram_business_account:{id:'123'}});
  if(path==='456/conversations')return json({data:[{id:'thread1',participants:{data:[{id:target.external_account_id},{id:'77'}]}}]});
  if(path==='thread1')return json({id:'thread1',participants:{data:[{id:'77'},{id:target.external_account_id}]}});
  if(path==='900')return json({id:'900',owner:{id:'123'},from:{id:'456'}});
  if(path==='thread1/messages'||path==='900/comments'){
   if(state.mode==='quota')return json({error:{code:4,message:'FIXTURE_SECRET'}},429,{'retry-after':'60'});if(state.mode==='expired'&&after)return json({error:{code:100,message:'FIXTURE_SECRET expired cursor'}},400);
   const start=after?Number(after.slice(1)):0;assert(Number.isInteger(start)&&start>=0);const data=Array.from({length:Math.min(25,count-start)},(_,offset)=>{const n=start+offset,id='m'+n,body=state.mode==='edited'?'TESTFIXTURE gewijzigde tekst':'TESTFIXTURE - NIET PUBLICEREN '+n;return target.kind==='direct'?{id,message:body,created_time:'2026-01-01T12:00:00Z',from:{id:'77',name:'Fictieve bezoeker'},to:{data:[{id:target.external_account_id}]}}:{id,text:body,message:body,timestamp:'2026-01-01T12:00:00Z',created_time:'2026-01-01T12:00:00Z',from:{id:'77',username:'fixture',name:'Fictieve bezoeker'}};});
   const next=start+25<count?'i'+(start+25):null;return json({data,...(next?{paging:{next:'https://graph.facebook.com/v25.0/'+path+'?after='+next+'&access_token=fixture-token',cursors:{after:next}}}:{})});
  }
  if(/^m\d+\/(comments|replies)$/.test(path))return json({data:[]});throw Error('Unexpected fixture request '+path);
 };
 return state;
}
