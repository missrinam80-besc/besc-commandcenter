import test,{before,after,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {f1Database,q,j} from './helpers/f1-database.mts';
import {createResumableInboxReader,initialInboxCheckpoint,inboxCheckpoint} from '../src/lib/resumable-inbox-page.ts';
import {runInboxStep} from '../src/lib/resumable-inbox-worker.ts';
import {type MetaInboxSelection,socialInboxMetaRequirements} from './helpers/resumable-inbox-provider.mts';
import {mockInboxProvider} from './helpers/resumable-inbox-provider.mts';
let f:Awaited<ReturnType<typeof f1Database>>,account:string,session:string;
before(async()=>{f=await f1Database();});after(async()=>{await f?.db.close();});
async function actor(user=f.ids.admin,role='authenticated'){
 await f.owner();await f.actor(user,role);await f.db.exec(`select set_config('request.jwt.claims',${q(JSON.stringify({sub:user,role,session_id:user===f.ids.admin?session:randomUUID()}))},false)`);
}
beforeEach(async()=>{await f.owner();await f.db.exec('begin');account=randomUUID();session=randomUUID();await f.db.exec(`update auth.users set email_confirmed_at=now() where id=${q(f.ids.admin)};insert into auth.sessions(id,user_id)values(${q(session)},${q(f.ids.admin)})`);});
afterEach(async()=>{await f.db.exec('rollback');await f.owner();});
async function owner(action:string,job:string|null=null,data:unknown={},org=f.ids.org){return(await f.db.query<{v:unknown}>(`select public.inbox_sync_owner(${q(org)},${q(action)},${job?q(job):'null'},${j(data)}) v`)).rows[0].v;}
async function server(job:string,action:string,data:unknown={}){
 await actor(f.ids.admin,'service_role');await f.db.exec('savepoint rpc');try{const v=(await f.db.query<{v:unknown}>(`select public.inbox_sync_server(${q(job)},${q(action)},${j(data)}) v`)).rows[0].v;await f.db.exec('release savepoint rpc');return v;}catch(e){await f.db.exec('rollback to savepoint rpc;release savepoint rpc');throw e;}
}
async function setup(platform:'instagram'|'facebook'='instagram',kind:'direct'|'comment'='direct',count=70){
 const target:MetaInboxSelection={organization_id:f.ids.org,account_id:account,platform,external_account_id:platform==='instagram'?'123':'456',page_id:'456',kind,resources:kind==='comment'?['900']:[]};
 await actor();await f.db.exec(`insert into public.social_accounts(id,organization_id,platform,account_name,external_account_id,status,granted_scopes,created_by)values(${q(account)},${q(f.ids.org)},${q(platform)},'TESTFIXTURE - NIET PUBLICEREN',${q(target.external_account_id)},'connected',${q('{'+socialInboxMetaRequirements(platform,kind).join(',')+'}')}::text[],${q(f.ids.admin)})`);
 const checkpoint=initialInboxCheckpoint(target,'v25.0'),request_id=randomUUID();const job=(await owner('create',null,{target,checkpoint,request_id}) as {id:string}).id;
 const mock=mockInboxProvider(target,count);const ports={server,credentials:async(id:string)=>{assert.equal(id,account);return'fixture-token';},reader:createResumableInboxReader({apiVersion:'v25.0',appId:'100',appSecret:'fixture-secret'},mock.transport,true)};
 const step=()=>runInboxStep(job,{...ports,reader:createResumableInboxReader({apiVersion:'v25.0',appId:'100',appSecret:'fixture-secret'},mock.transport,true)},true);
 async function summary(){await actor();return await owner('read',job) as {id:string;state:string;revision:number;pages_committed:number;reason:string|null;available_at:string;events:{operation:string;reason:string|null}[]};}
 async function countRows(){await f.owner();return(await f.db.query<{messages:number;events:number;receipts:number}>(`select(select count(*)::int from private.si_messages) messages,(select count(*)::int from private.si_events) events,(select count(*)::int from private.rs_receipts) receipts`)).rows[0];}
 async function complete(){for(let n=0;n<200;n++){const r=await step();if(r.state==='completed')return r;assert.equal(r.state,'pending',JSON.stringify(r));}throw Error('Did not finish bounded fixture');}
 return{target,checkpoint,request_id,job,mock,ports,step,summary,countRows,complete};
}
async function denied(sql:string,regex=/inbox_sync|permission denied/){await f.db.exec('savepoint deny');try{await assert.rejects(f.db.exec(sql),regex);}finally{await f.db.exec('rollback to savepoint deny;release savepoint deny');}}
for(const platform of ['facebook','instagram'] as const)for(const kind of ['direct','comment'] as const)test(`Hervatbare inbox: ${platform} ${kind}, meer dan 50 teksten over meerdere nieuwe uitvoerders zonder verlies of dubbelen`,async()=>{
 const flow=await setup(platform,kind,70);await flow.complete();const counts=await flow.countRows();assert.equal(counts.messages,70);assert.equal(counts.events,70);assert.equal(counts.receipts,(await flow.summary()).pages_committed);assert.equal((await flow.step()).state,'skipped');assert(flow.mock.calls.every(c=>c.method==='GET'));
});
test('Hervatbare inbox: voortgang en berichten worden samen bevestigd; lege ontdekkingspagina blijft hervatbaar',async()=>{
 const flow=await setup();assert.equal((await flow.step()).inserted,0);assert.equal((await flow.countRows()).messages,0);assert.equal((await flow.summary()).revision,1);
 const next=await flow.step();assert.equal(next.inserted,25);assert.equal((await flow.countRows()).messages,25);assert.equal((await flow.summary()).revision,2);await flow.complete();assert.equal((await flow.countRows()).messages,70);
});
test('Hervatbare inbox: crash na claim en na providerantwoord schuift geen cursor door; vervallen claim is veilig overneembaar',async()=>{
 const flow=await setup();const claim=await server(flow.job,'claim') as {nonce:string;target:MetaInboxSelection;checkpoint:unknown};assert(claim.nonce);await flow.ports.reader.page(claim.target,'fixture-token',inboxCheckpoint.parse(claim.checkpoint));assert.equal((await flow.countRows()).receipts,0);assert.equal((await flow.summary()).revision,0);
 await f.owner();await f.db.exec(`update private.rs_jobs set lease_until=clock_timestamp()-interval '1 second' where id=${q(flow.job)}`);await flow.complete();assert.equal((await flow.countRows()).messages,70);
});
test('Hervatbare inbox: verloren commitbevestiging wordt uit duurzaam ontvangstbewijs herkend zonder tweede provideroproep',async()=>{
 const flow=await setup();await flow.step();const saved=flow.ports.server;flow.ports.server=async(id,action,data)=>{const r=await saved(id,action,data);if(action==='commit')throw Error('FIXTURE_SECRET lost ack');return r;};const before=flow.mock.calls.length;const r=await runInboxStep(flow.job,flow.ports,true);assert.equal(r.state,'pending');assert.equal(r.recovered,true);assert.equal(r.inserted,25);assert.equal(flow.mock.calls.length-before,4);assert.equal((await flow.countRows()).messages,25);await flow.complete();assert.equal((await flow.countRows()).messages,70);
});
test('Hervatbare inbox: quota bewaart cursor en berichten, toont wachttijd en herneemt exact dezelfde pagina',async()=>{
 const flow=await setup();await flow.step();const before=await flow.summary();flow.mock.mode='quota';assert.equal((await flow.step()).state,'retry_wait');const failed=await flow.summary();assert.equal(failed.revision,before.revision);assert.equal(failed.reason,'rate_limited');assert(Date.parse(failed.available_at)>Date.now());const calls=flow.mock.calls.length;assert.equal((await flow.step()).state,'skipped');assert.equal(flow.mock.calls.length,calls);assert.equal((await flow.countRows()).messages,0);
 flow.mock.mode='ok';await f.owner();await f.db.exec(`update private.rs_jobs set available_at=clock_timestamp()-interval '1 second' where id=${q(flow.job)}`);await flow.complete();assert.equal((await flow.countRows()).messages,70);
});
test('Hervatbare inbox: ongeldige/verlopen cursor geeft aandacht; expliciet herbeginnen herleest zonder dubbelen of wissen',async()=>{
 const flow=await setup();await flow.step();await flow.step();flow.mock.mode='expired';assert.equal((await flow.step()).state,'attention');assert.equal((await flow.countRows()).messages,25);let s=await flow.summary();assert.equal(s.revision,2);assert.equal(s.reason,'invalid_response');
 flow.mock.mode='ok';await actor();await owner('restart',flow.job,{revision:s.revision,checkpoint:flow.checkpoint});await flow.complete();assert.equal((await flow.countRows()).messages,70);s=await flow.summary();assert(s.events.some(e=>e.operation==='restarted'));
});
test('Hervatbare inbox: starten is idempotent en een browser kan geen begin-cursor of afgeronde voortgang smokkelen',async()=>{
 const flow=await setup();await actor();assert.equal((await owner('create',null,{target:flow.target,checkpoint:flow.checkpoint,request_id:flow.request_id}) as {id:string}).id,flow.job);
 await denied(`select public.inbox_sync_owner(${q(f.ids.org)},'create',null,${j({target:flow.target,checkpoint:{...flow.checkpoint,queue:[]},request_id:randomUUID()})})`);
 await denied(`select public.inbox_sync_owner(${q(f.ids.org)},'restart',${q(flow.job)},${j({revision:0,checkpoint:{...flow.checkpoint,queue:[]}})})`);
});
test('Hervatbare inbox: gewone leden, andere organisaties en directe tabellen/workerrechten blijven afgeschermd',async()=>{
 const flow=await setup();await actor(f.ids.member);await denied(`select public.inbox_sync_owner(${q(f.ids.org)},'read',${q(flow.job)})`);await actor();await denied(`select public.inbox_sync_owner(${q(f.ids.otherOrg)},'read',${q(flow.job)})`);
 for(const table of ['rs_jobs','rs_receipts','rs_events'])await denied('select * from private.'+table,/permission denied/);await denied(`select public.inbox_sync_server(${q(flow.job)},'claim')`,/permission denied/);
});
test('Hervatbare inbox: annulering blokkeert een oude uitvoerder vóór opslag',async()=>{
 const flow=await setup();const claim=await server(flow.job,'claim') as Record<string,unknown>;await actor();await owner('cancel',flow.job,{revision:0});await assert.rejects(server(flow.job,'commit',{...claim,messages:[],next:{...flow.checkpoint,queue:[]},done:true,skipped:0}),/claim_required/);assert.equal((await flow.countRows()).messages,0);
});
test('Hervatbare inbox: gewijzigde providertekst kan bestaande berichten niet overschrijven of voortgang laten opschuiven',async()=>{
 const flow=await setup();await flow.step();await flow.step();let s=await flow.summary();await actor();await owner('restart',flow.job,{revision:s.revision,checkpoint:flow.checkpoint});flow.mock.mode='edited';await flow.step();assert.equal((await flow.step()).state,'attention');s=await flow.summary();assert.equal(s.reason,'duplicate_conflict');assert.equal((await flow.countRows()).messages,25);
});
test('Hervatbare inbox: standaard uit voert geen database-, credential- of providertaken uit',async()=>{
 let n=0;const ports={server:async()=>{n++;throw Error();},credentials:async()=>{n++;return'';},reader:{page:async()=>{n++;throw Error();}}};assert.equal((await runInboxStep(randomUUID(),ports)).state,'disabled');assert.equal(n,0);
});

test('Hervatbare inbox: intrekken van de echte sessie blokkeert opslag en houdt de cursor vast',async()=>{
 const flow=await setup();await flow.step();const claim=await server(flow.job,'claim') as {nonce:string;revision:number;target:MetaInboxSelection;checkpoint:unknown};
 const page=await flow.ports.reader.page(claim.target,'fixture-token',inboxCheckpoint.parse(claim.checkpoint));
 await f.owner();await f.db.exec(`delete from auth.sessions where id=${q(session)}`);
 const result=await server(flow.job,'commit',{nonce:claim.nonce,revision:claim.revision,messages:page.messages,next:page.next,done:page.done,skipped:0}) as {state:string};
 assert.equal(result.state,'blocked');assert.equal((await flow.countRows()).messages,0);await f.owner();
 assert.equal((await f.db.query<{revision:number}>(`select revision::int from private.rs_jobs where id=${q(flow.job)}`)).rows[0].revision,1);
});
test('Hervatbare inbox: lange historie blijft via pagina’s volledig leesbaar zonder voortgangsgeheimen',async()=>{
 const flow=await setup();for(let n=0;n<28;n++){await actor();await owner('cancel',flow.job,{revision:n*2});await owner('restart',flow.job,{revision:n*2+1,checkpoint:flow.checkpoint});}
 await actor();const latest=await owner('read',flow.job) as {events:{id:number}[]};assert.equal(latest.events.length,51);
 const earlier=await owner('read',flow.job,{events_before:latest.events[0].id}) as {events:{id:number}[]};assert.equal(earlier.events.length,6);
 assert.equal(new Set([...latest.events,...earlier.events].map(e=>e.id)).size,57);assert(!JSON.stringify(latest).includes('checkpoint'));
});
