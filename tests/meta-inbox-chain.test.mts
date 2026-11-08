import test,{before,after,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {f1Database,q,j} from './helpers/f1-database.mts';
import {createMetaInboxReader,type MetaInboxSelection} from '../src/lib/meta-inbox-reader.ts';
import {receiveMetaInbox,type MetaInboxAccess,type MetaInboxReceivePorts} from '../src/lib/meta-inbox-receive.ts';
import {socialInboxMetaRequirements} from '../src/lib/social-inbox.ts';
let f:Awaited<ReturnType<typeof f1Database>>,account:string,session:string,revision:string;
before(async()=>{f=await f1Database();});after(async()=>{await f?.db.close();});
async function actor(role='authenticated'){
 await f.owner();await f.actor(f.ids.admin,role);await f.db.exec(`select set_config('request.jwt.claims',${q(JSON.stringify({sub:f.ids.admin,role,session_id:session}))},false)`);
}
beforeEach(async()=>{
 await f.owner();await f.db.exec('begin');account=randomUUID();session=randomUUID();revision='fixture-v1';
 await f.db.exec(`update auth.users set email_confirmed_at=now() where id=${q(f.ids.admin)};insert into auth.sessions(id,user_id)values(${q(session)},${q(f.ids.admin)})`);
});
afterEach(async()=>{await f.db.exec('rollback');await f.owner();});
async function setup(platform:'instagram'|'facebook'='instagram',kind:'direct'|'comment'='direct'){
 const target:MetaInboxSelection={organization_id:f.ids.org,account_id:account,platform,external_account_id:platform==='instagram'?'123':'456',page_id:'456',kind,resources:kind==='comment'?['900']:[]};
 await actor();await f.db.exec(`insert into public.social_accounts(id,organization_id,platform,account_name,external_account_id,status,granted_scopes,created_by)values(${q(account)},${q(f.ids.org)},${q(platform)},'TESTFIXTURE - NIET PUBLICEREN',${q(target.external_account_id)},'connected',${q('{'+socialInboxMetaRequirements(platform,kind).join(',')+'}')}::text[],${q(f.ids.admin)})`);
 const calls:string[]=[],stores:string[]=[],data=[{id:'m1',body:'TESTFIXTURE - NIET PUBLICEREN',time:'2026-01-01T12:00:00Z'}];let mode='ok',lost=false;
 const transport:typeof fetch=async(input,init)=>{
  assert.equal(init?.method,'GET');assert.equal(init?.redirect,'error');const url=new URL(String(input));assert.equal(url.origin,'https://graph.facebook.com');const path=url.pathname.replace('/v25.0/','');calls.push(path);
  const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
  if(path==='debug_token')return reply({data:{is_valid:true,type:'PAGE',app_id:'100',profile_id:'456',expires_at:0,scopes:socialInboxMetaRequirements(platform,kind)}});
  if(path==='456')return reply({id:'456',instagram_business_account:{id:mode==='foreign'?'999':'123'}});
  if(path==='456/conversations')return reply({data:[{id:'t1',participants:{data:[{id:target.external_account_id},{id:'77'}]}}]});
  if(path==='t1/messages'){
   if(mode==='page_failure'&&url.searchParams.has('after'))return reply({error:{message:'FIXTURE_SECRET'}},503);
   if(mode==='page_failure'&&!url.searchParams.has('after'))return reply({data:[{id:'m1',created_time:data[0].time,from:{id:'77',name:'TESTFIXTURE bezoeker'},to:{data:[{id:target.external_account_id}]},message:data[0].body}],paging:{next:'https://graph.facebook.com/v25.0/t1/messages?after=second',cursors:{after:'second'}}});
   return reply({data:data.map(m=>({id:m.id,created_time:m.time,from:{id:'77',name:'TESTFIXTURE bezoeker'},to:{data:[{id:target.external_account_id}]},message:m.body,...(mode==='attachment'?{attachments:{data:[{file_url:'https://example.invalid/never-fetch'}]}}:{})}))});
  }
  if(path==='900')return reply({id:'900',owner:{id:'123'},from:{id:'456'}});
  if(path==='900/comments')return reply({data:[{id:'c1',from:{id:'77',name:'TESTFIXTURE bezoeker',username:'fixture'},text:data[0].body,message:data[0].body,timestamp:data[0].time,created_time:data[0].time}]});
  if(path==='c1/comments'||path==='c1/replies')return reply({data:[]});
  throw Error('Unexpected local request');
 };
 const ports:MetaInboxReceivePorts={
  authorize:async()=>{
   await actor();await f.db.exec('savepoint authorize_rpc');
   try{await f.db.query(`select public.social_inbox_owner(${q(f.ids.org)},'members')`);await f.db.exec('release savepoint authorize_rpc');}catch(e){await f.db.exec('rollback to savepoint authorize_rpc;release savepoint authorize_rpc');throw e;}
   const row=(await f.db.query<{external_account_id:string;status:string;granted_scopes:string[]}>(`select external_account_id,status,granted_scopes from public.social_accounts where organization_id=${q(f.ids.org)} and id=${q(account)} and deleted_at is null`)).rows[0];
   if(!row||row.status!=='connected')throw Error('Account not connected');
   return{target:{...target,external_account_id:row.external_account_id},authorized:true,connected:true,revision,scopes:row.granted_scopes} as MetaInboxAccess;
  },
  credentials:async id=>{assert.equal(id,account);calls.push('fixture-credential');return'fixture-token';},
  reader:createMetaInboxReader({apiVersion:'v25.0',appId:'100',appSecret:'fixture-secret'},transport,true),
  store:async(t,m)=>{
   stores.push(t.account_id);await actor('service_role');await f.db.exec('savepoint receive_rpc');let result:unknown;
   try{result=(await f.db.query<{v:unknown}>(`select public.social_inbox_ingest(${q(t.organization_id)},${q(t.account_id)},${q(t.external_account_id)},${j(m)}) v`)).rows[0].v;await f.db.exec('release savepoint receive_rpc');}catch(e){await f.db.exec('rollback to savepoint receive_rpc;release savepoint receive_rpc');throw e;}
   if(lost)throw Error('FIXTURE_SECRET lost acknowledgement');return result;
  },
 };
 const run=()=>receiveMetaInbox(ports,true);
 async function count(){await f.owner();return(await f.db.query<{messages:number;events:number}>(`select (select count(*)::int from private.si_messages) messages,(select count(*)::int from private.si_events) events`)).rows[0];}
 async function detail(){await actor();const rows=(await f.db.query<{v:{id:string}[]}>(`select public.social_inbox_owner(${q(f.ids.org)},'list') v`)).rows[0].v;return(await f.db.query<{v:{id:string;status:string;revision:number;messages:unknown[];events:{operation:string}[]}}>(`select public.social_inbox_owner(${q(f.ids.org)},'read',${q(rows[0].id)}) v`)).rows[0].v;}
 return{target,ports,calls,stores,data,run,count,detail,mode:(value:string)=>{mode=value;},loseAck:(value:boolean)=>{lost=value;}};
}

for(const platform of ['facebook','instagram'] as const)for(const kind of ['direct','comment'] as const)test(`Meta-ontvangstketen: ${platform} ${kind} van nagebootst providerantwoord naar echte private opslag en eigenaarshistorie`,async()=>{
 const flow=await setup(platform,kind),first=await flow.run();assert.equal(first.state,'received');assert.equal(first.inserted,1);assert.deepEqual(await flow.count(),{messages:1,events:1});const second=await flow.run();assert.equal(second.state,'received');assert.equal(second.inserted,0);assert.deepEqual(await flow.count(),{messages:1,events:1});assert.equal((await flow.detail()).messages.length,1);
});
test('Meta-ontvangstketen: mislukte tweede pagina slaat geen eerste pagina op en kan veilig opnieuw gelezen worden',async()=>{
 const flow=await setup();flow.mode('page_failure');const failed=await flow.run();assert.equal(failed.state,'retry_later');assert.equal(failed.received,null);assert.equal(flow.stores.length,0);assert.deepEqual(await flow.count(),{messages:0,events:0});flow.mode('ok');assert.equal((await flow.run()).inserted,1);
});
test('Meta-ontvangstketen: nieuwe actuele ontvangst heropent; replay en vertraagde oudere ontvangst niet',async()=>{
 const flow=await setup();await flow.run();let t=await flow.detail();await f.db.exec(`select public.social_inbox_owner(${q(f.ids.org)},'status',${q(t.id)},${j({revision:t.revision,status:'resolved'})})`);
 await flow.run();assert.equal((await flow.detail()).status,'resolved');flow.data.push({id:'older',body:'Fictieve vertraagde ontvangst',time:'2025-01-01T12:00:00Z'});await flow.run();assert.equal((await flow.detail()).status,'resolved');flow.data.push({id:'new',body:'Fictieve nieuwe vraag',time:'2026-01-02T12:00:00Z'});await flow.run();t=await flow.detail();assert.equal(t.status,'open');assert.equal(t.events.filter(e=>e.operation==='reopened').length,1);
});
test('Meta-ontvangstketen: verlies van opslagbevestiging blijft onzeker; herlezing maakt geen dubbel bericht',async()=>{
 const flow=await setup();flow.loseAck(true);const r=await flow.run();assert.equal(r.state,'attention');assert.equal(r.reason,'storage_not_confirmed');assert.equal(r.inserted,null);assert(!JSON.stringify(r).includes('FIXTURE_SECRET'));assert.deepEqual(await flow.count(),{messages:1,events:1});flow.loseAck(false);assert.equal((await flow.run()).inserted,0);assert.deepEqual(await flow.count(),{messages:1,events:1});
});
test('Meta-ontvangstketen: gewijzigde inhoud op hetzelfde provider-ID wordt niet overschreven of als nieuwe ontvangst bevestigd',async()=>{
 const flow=await setup();await flow.run();flow.data[0].body='Fictieve gewijzigde tekst';const r=await flow.run();assert.equal(r.state,'attention');assert.equal(r.complete,false);assert.deepEqual(await flow.count(),{messages:1,events:1});
});
for(const mode of ['membership','session'])test(`Meta-ontvangstketen: echte lokale intrekking ${mode} na lezen blokkeert opslag`,async()=>{
  const flow=await setup(),reader=flow.ports.reader;flow.ports.reader={read:async(...args)=>{const result=await reader.read(...args);await f.owner();if(mode==='membership')await f.db.exec(`update public.organization_members set status='suspended' where organization_id=${q(f.ids.org)} and user_id=${q(f.ids.admin)}`);else await f.db.exec(`delete from auth.sessions where id=${q(session)}`);return result;}};
  const r=await flow.run();assert.equal(r.state,'blocked');assert.equal(flow.stores.length,0);assert.deepEqual(await flow.count(),{messages:0,events:0});
});
test('Meta-ontvangstketen: account ontkoppelen na lezen blokkeert opslag',async()=>{
 const flow=await setup(),reader=flow.ports.reader;flow.ports.reader={read:async(...args)=>{const result=await reader.read(...args);await f.owner();await f.db.exec(`update public.social_accounts set status='disconnected' where id=${q(account)}`);return result;}};
 assert.equal((await flow.run()).state,'blocked');assert.equal(flow.stores.length,0);assert.deepEqual(await flow.count(),{messages:0,events:0});
});
