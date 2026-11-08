import test from 'node:test';
import assert from 'node:assert/strict';
import {createResumableInboxReader,initialInboxCheckpoint,type InboxCheckpoint} from '../src/lib/resumable-inbox-page.ts';
import {mockInboxProvider,type MetaInboxSelection} from './helpers/resumable-inbox-provider.mts';
const config={apiVersion:'v25.0',appId:'100',appSecret:'fixture-only'};
const target:MetaInboxSelection={organization_id:'00000000-0000-4000-8000-000000000001',account_id:'00000000-0000-4000-8000-000000000002',platform:'instagram',external_account_id:'123',page_id:'456',kind:'direct',resources:[]};
const json=(body:unknown)=>new Response(JSON.stringify(body));

test('Inboxpagina’s: vervolg van conversatielijst en 60 afzonderlijke gesprekken blijven na elke herstart bereikbaar',async()=>{
 const mock=mockInboxProvider(target),calls:string[]=[];
 const transport:typeof fetch=async(input,init)=>{
  const url=new URL(String(input)),path=url.pathname.replace('/v25.0/','');calls.push(path);
  const match=path.match(/^t(\d+)(\/messages)?$/);
  if(path==='456/conversations'){
   const offset=Number(url.searchParams.get('after')??0),next=offset+25<60?String(offset+25):null;
   return json({data:Array.from({length:Math.min(25,60-offset)},(_,i)=>({id:'t'+(offset+i),participants:{data:[{id:'123'},{id:'77'}]}})),...(next?{paging:{next:'https://graph.facebook.com/v25.0/456/conversations?after='+next,cursors:{after:next}}}:{})});
  }
  if(match)return json(match[2]?{data:[{id:'text'+match[1],message:'TESTFIXTURE - NIET PUBLICEREN',created_time:'2026-01-01T12:00:00Z',from:{id:'77'},to:{data:[{id:'123'}]}}]}:{id:'t'+match[1],participants:{data:[{id:'77'},{id:'123'}]}});
  return mock.transport(input,init);
 };
 let checkpoint=initialInboxCheckpoint(target,'v25.0');const ids:string[]=[];
 for(let n=0;n<100;n++){
  const page=await createResumableInboxReader(config,transport,true).page(target,'fixture',checkpoint);
  ids.push(...page.messages.map(m=>m.message_id));checkpoint=JSON.parse(JSON.stringify(page.next));if(page.done)break;
 }
 assert.equal(checkpoint.queue.length,0);assert.equal(ids.length,60);assert.equal(new Set(ids).size,60);assert.equal(calls.filter(p=>p==='456/conversations').length,3);
});

test('Inboxpagina’s: 70 gepagineerde reacties onder één hoofdreactie verdwijnen niet uit de duurzame werklijst',async()=>{
 const selection={...target,kind:'comment' as const,resources:['900']},mock=mockInboxProvider(selection);
 const comment=(id:string)=>({id,text:'TESTFIXTURE - NIET PUBLICEREN '+id,timestamp:'2026-01-01T12:00:00Z',from:{id:'77'}});
 const transport:typeof fetch=async(input,init)=>{
  const url=new URL(String(input)),path=url.pathname.replace('/v25.0/','');
  if(path==='900/comments')return json({data:[comment('root')]});
  if(path==='root/replies'){
   const start=Number(url.searchParams.get('after')??0),next=start+25<70?String(start+25):null;
   return json({data:Array.from({length:Math.min(25,70-start)},(_,i)=>comment('reply'+(start+i))),...(next?{paging:{next:'https://graph.facebook.com/v25.0/root/replies?after='+next,cursors:{after:next}}}:{})});
  }
  return mock.transport(input,init);
 };
 let checkpoint=initialInboxCheckpoint(selection,'v25.0');const ids:string[]=[];
 while(checkpoint.queue.length){const page=await createResumableInboxReader(config,transport,true).page(selection,'fixture',checkpoint);ids.push(...page.messages.map(m=>m.message_id));checkpoint=JSON.parse(JSON.stringify(page.next));}
 assert.equal(ids.length,71);assert.equal(new Set(ids).size,71);
});

for(const problem of ['foreign-next','repeated-cursor','unsupported','queue-limit','seen-limit'] as const)test('Inboxpagina’s: '+problem+' bevestigt geen voortgang en verandert de invoer niet',async()=>{
 const mock=mockInboxProvider(target);let checkpoint=initialInboxCheckpoint(target,'v25.0');checkpoint=(await createResumableInboxReader(config,mock.transport,true).page(target,'fixture',checkpoint)).next;
 if(problem==='repeated-cursor')checkpoint.queue[0].used=['i25'];
 if(problem==='queue-limit')checkpoint.queue=Array.from({length:1000},(_,i)=>({...checkpoint.queue[0],id:'t'+i,thread:'t'+i}));
 if(problem==='seen-limit')checkpoint.seen=Array.from({length:10000},(_,i)=>'seen'+i);
 const before=JSON.stringify(checkpoint);
 const transport:typeof fetch=async(input,init)=>{
  const response=await mock.transport(input,init),path=new URL(String(input)).pathname;
  if(path.endsWith('/messages')){
   const body=await response.json();if(problem==='foreign-next')body.paging.next='https://evil.invalid/';
   if(problem==='unsupported')body.data[0].attachments={data:[{id:'attachment'}]};return json(body);
  }
  return response;
 };
 if(problem==='queue-limit'||problem==='seen-limit'){
  // A full queue/seen set is valid until discovery would need another durable task.
  const seed=initialInboxCheckpoint(target,'v25.0');
  if(problem==='queue-limit')seed.queue=[seed.queue[0],...Array.from({length:999},(_,i)=>({...seed.queue[0],id:'x'+i,thread:'x'+i}))];
  else seed.seen=checkpoint.seen;
  const discovery:typeof fetch=async(input,init)=>{
   const response=await mock.transport(input,init);
   if(new URL(String(input)).pathname.endsWith('/conversations')){const body=await response.json();body.data.push({...body.data[0],id:'thread2'});return json(body);}return response;
  };
  const prior=JSON.stringify(seed);await assert.rejects(createResumableInboxReader(config,discovery,true).page(target,'fixture',seed));assert.equal(JSON.stringify(seed),prior);
 }else await assert.rejects(createResumableInboxReader(config,transport,true).page(target,'fixture',checkpoint));
 assert.equal(JSON.stringify(checkpoint),before);
});

test('Inboxpagina’s: standaard uit weigert vóór transport en een onbekende checkpointversie is onbruikbaar',async()=>{
 let calls=0;const transport:typeof fetch=async()=>{calls++;throw Error('No transport allowed');};
 assert.throws(()=>createResumableInboxReader(config,transport),/disabled/);assert.equal(calls,0);
 await assert.rejects(createResumableInboxReader(config,transport,true).page(target,'fixture',{...initialInboxCheckpoint(target,'v25.0'),v:2} as unknown as InboxCheckpoint));assert.equal(calls,0);
});
