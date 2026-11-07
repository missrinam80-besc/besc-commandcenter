import test,{before,after,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {f1Database,q,j} from './helpers/f1-database.mts';
import {parsePilotPostUrl,pilotWindowSummary,type PilotState} from '../src/lib/campaign-pilot.ts';
let f:Awaited<ReturnType<typeof f1Database>>,campaign:string,participant:string,policy:string;
const sessions=new Map<string,string>();
async function actor(id:string){await f.owner();await f.actor(id);await f.db.exec(`select set_config('request.jwt.claims',${q(JSON.stringify({sub:id,role:'authenticated',session_id:sessions.get(id)}))},false)`);}
async function call(op:string,data:unknown={},request=randomUUID(),c=campaign){return(await f.db.query<{v:{id:string}}>(`select public.f3_workflow(${q(f.ids.org)},${q(c)},${q(op)},${j(data)},${q(request)}) v`)).rows[0].v;}
async function state(){return(await f.db.query<{v:PilotState}>(`select public.f3_campaign_state(${q(f.ids.org)},${q(campaign)}) v`)).rows[0].v;}
async function deny(action:()=>Promise<unknown>,error:RegExp){await f.db.exec('savepoint rejected');await assert.rejects(action(),error);await f.db.exec('rollback to rejected');}
async function submit(external_id='abcdefghijk',platform='youtube'){await actor(f.ids.member);return call('post.submit',{participant_id:participant,platform,external_id});}
const review=(id:string,revision=1,decision='verified',reason='TESTFIXTURE - NIET PUBLICEREN - independently checked')=>({id,expected_revision:revision,decision,availability:'available',reason});
type History={post_id:string;items:{request_id:string;reviewer_id:string;reviewer_name:string;reviewed_at:string;from_revision:number;to_revision:number;decision:string;reason:string;availability:string}[];has_more:boolean;next_before_revision:number|null};
async function history(id:string,before:number|null=null,c=campaign,o=f.ids.org){return(await f.db.query<{v:History}>(`select public.f3_review_history(${q(o)},${q(c)},${q(id)},${before===null?'null':before}) v`)).rows[0].v;}
async function counts(){await f.owner();return(await f.db.query<{posts:number;events:number;receipts:number}>(`select (select count(*)::int from private.campaign_contributions where campaign_id=${q(campaign)}) posts,(select count(*)::int from private.campaign_events where campaign_id=${q(campaign)}) events,(select count(*)::int from private.campaign_receipts where campaign_id=${q(campaign)}) receipts`)).rows[0];}
before(async()=>{
 f=await f1Database();await f.owner();for(const id of [f.ids.chair,f.ids.member,f.ids.reviewer,f.ids.admin,f.ids.other]){const s=randomUUID();sessions.set(id,s);await f.db.exec(`update auth.users set email_confirmed_at=now() where id=${q(id)};insert into auth.sessions(id,user_id) values(${q(s)},${q(id)})`);}
 campaign=randomUUID();await f.db.exec(`insert into public.campaigns(id,organization_id,title,created_by) values(${q(campaign)},${q(f.ids.org)},'TESTFIXTURE - NIET PUBLICEREN - CA02',${q(f.ids.chair)})`);
 await actor(f.ids.chair);await call('pilot.open');
 for(const [user_id,role]of [[f.ids.chair,'editor'],[f.ids.reviewer,'reviewer'],[f.ids.admin,'reader']])await call('access.assign',{user_id,role,valid_until:new Date(Date.now()+3600000).toISOString()});
 policy=(await call('policy.set',{version:1,body:'TESTFIXTURE - NIET PUBLICEREN - local only',retention:'Local disposable fixture; no real participation',fields:['post_url','views'],document_id:f.ids.policyDoc})).id;
 participant=(await call('participant.select',{person_id:f.ids.otherPerson,policy_id:policy,expires_at:new Date(Date.now()+3600000).toISOString()})).id;
 await actor(f.ids.member);await call('participant.accept',{id:participant,accepted:true});await f.owner();
});
after(async()=>{await f.db.close()});beforeEach(async()=>{await f.owner();await f.db.exec('begin')});afterEach(async()=>{await f.owner();await f.db.exec('rollback')});
test('CA02 DB: submission is candidate; source link never creates a measurement or an approval',async()=>{
 await submit();const s=await state();assert.equal(s.posts[0].status,'candidate');assert.equal(s.posts[0].revision,1);assert.equal(s.posts[0].checked_at,null);assert.equal(s.measurements.length,0);assert.equal(s.posts[0].canonical_url,'https://www.youtube.com/watch?v=abcdefghijk');
 const summary=pilotWindowSummary(s,{metric:'views',definition:'TESTFIXTURE',semantics:'period',first:{start:'2026-01-01T00:00:00Z',end:'2026-01-02T00:00:00Z'},second:{start:'2026-01-02T00:00:00Z',end:'2026-01-03T00:00:00Z'},asOf:'2026-01-04T00:00:00Z',freshnessHours:168},{start:'2026-01-01T00:00:00Z',end:'2026-01-02T00:00:00Z'});assert.equal(summary.candidates,1);assert.equal(summary.total,0);assert.equal(summary.value,null);
});
test('CA02 DB: YouTube URL aliases and Twitch clip aliases deduplicate by platform identity',async()=>{
 for(const aliases of [['https://youtu.be/abcdefghijk?t=2','https://youtube.com/watch?v=abcdefghijk','https://youtube.com/shorts/abcdefghijk'],['https://www.twitch.tv/fixture/clip/FixtureClip?tt=1','https://clips.twitch.tv/FixtureClip']]){
  let id='';for(const url of aliases){const parsed=parsePilotPostUrl(url)!;assert(parsed);const p=await submit(parsed.externalId,parsed.platform);if(id)assert.equal(p.id,id);id=p.id;const s=await state();assert.equal(s.posts.find(p=>p.id===id)?.canonical_url,parsed.canonicalUrl);}
 }assert.equal((await counts()).posts,2);
});
test('CA02 DB: repeated request has one effect, changed payload conflicts and records no success',async()=>{
 await actor(f.ids.member);const request=randomUUID(),data={participant_id:participant,external_id:'abcdefghijk'};const first=await call('post.submit',data,request);const baseline=await counts();await actor(f.ids.member);assert.equal((await call('post.submit',data,request)).id,first.id);assert.deepEqual(await counts(),baseline);
 await actor(f.ids.member);await deny(()=>call('post.submit',{...data,external_id:'12345678901'},request),/request_conflict/);assert.deepEqual(await counts(),baseline);
});
test('CA02 DB: duplicate submission after review retains revision and reviewed state',async()=>{
 const p=await submit();await actor(f.ids.reviewer);await call('post.review',review(p.id));const again=await submit();assert.equal(again.id,p.id);const s=await state();assert.equal(s.posts.length,1);assert.equal(s.posts[0].status,'verified');assert.equal(s.posts[0].revision,2);
});
test('CA02 DB: same source cannot be attributed to a different creator',async()=>{
 await submit();await actor(f.ids.chair);const other=await call('participant.select',{person_id:f.ids.person,policy_id:policy,expires_at:new Date(Date.now()+3600000).toISOString()});await call('participant.accept',{id:other.id,accepted:true});const baseline=await counts();await actor(f.ids.chair);await deny(()=>call('post.submit',{participant_id:other.id,external_id:'abcdefghijk'}),/creator_conflict/);assert.deepEqual(await counts(),baseline);
});
test('CA02 DB: chair/editor, reader/admin and unrelated member cannot review without campaign reviewer task',async()=>{
 const p=await submit(),baseline=await counts();for(const id of [f.ids.chair,f.ids.admin,f.ids.other]){await actor(id);await deny(()=>call('post.review',review(p.id)),/not_authorized/);}assert.deepEqual(await counts(),baseline);
});
test('CA02 DB: creator and submitting editor cannot approve their own contribution',async()=>{
 const p=await submit();await actor(f.ids.chair);await call('access.assign',{user_id:f.ids.member,role:'reviewer',valid_until:new Date(Date.now()+3600000).toISOString()});await actor(f.ids.member);await deny(()=>call('post.review',review(p.id)),/independent_review_required/);
 await actor(f.ids.chair);await call('access.assign',{user_id:f.ids.chair,role:'reviewer',valid_until:new Date(Date.now()+3600000).toISOString()});const own=await call('post.submit',{participant_id:participant,external_id:'12345678901'});await deny(()=>call('post.review',review(own.id)),/independent_review_required/);
});
test('CA02 DB: stale revision and empty reason preserve existing decision and add no history',async()=>{
 const p=await submit();await actor(f.ids.reviewer);await call('post.review',review(p.id));const baseline=await counts();await actor(f.ids.reviewer);await deny(()=>call('post.review',review(p.id,1,'rejected')),/revision_conflict/);await deny(()=>call('post.review',review(p.id,2,'rejected',' ')),/reason_required/);assert.deepEqual(await counts(),baseline);
});
test('CA02 DB: sequential independent decisions retain actor, time, revision and full reason in private history',async()=>{
 const p=await submit();const reasons=['TESTFIXTURE approved evidence','TESTFIXTURE rejected after correction','TESTFIXTURE verified new evidence'];await actor(f.ids.reviewer);
 for(let i=0;i<3;i++)await call('post.review',review(p.id,i+1,i===1?'rejected':'verified',reasons[i]));await f.owner();
 const receipts=(await f.db.query<{actor:string;payload:{id:string;expected_revision:number;decision:string;reason:string};result:{id:string};created_at:Date|string}>(`select actor,payload,result,created_at from private.campaign_receipts where campaign_id=${q(campaign)} and operation='post.review' order by (payload->>'expected_revision')::int`)).rows;
 assert.equal(receipts.length,3);for(let i=0;i<3;i++){assert.equal(receipts[i].actor,f.ids.reviewer);assert.equal(receipts[i].payload.expected_revision,i+1);assert.equal(receipts[i].payload.reason,reasons[i]);assert.equal(receipts[i].payload.decision,i===1?'rejected':'verified');assert.equal(receipts[i].result.id,p.id);assert(Number.isFinite(Date.parse(String(receipts[i].created_at))));}
 const events=(await f.db.query<{actor:string;entity_id:string;created_at:Date|string}>(`select actor,entity_id,created_at from private.campaign_events where campaign_id=${q(campaign)} and operation='post.review'`)).rows;assert.equal(events.length,3);assert(events.every(e=>e.actor===f.ids.reviewer&&e.entity_id===p.id&&Number.isFinite(Date.parse(String(e.created_at)))));
 await actor(f.ids.reviewer);assert.equal((await state()).posts[0].revision,4);
});
test('CA02 DB: clients cannot forge, alter, delete or directly read private review history',async()=>{
 await submit();const baseline=await counts();for(const role of ['authenticated','anon','service_role']){await f.owner();await f.db.exec(`set role ${role}`);for(const sql of ['select * from private.campaign_receipts','select * from private.campaign_events',"update private.campaign_receipts set payload='{}'",'delete from private.campaign_events',"insert into private.campaign_events(organization_id,campaign_id,operation,entity_id) values(gen_random_uuid(),gen_random_uuid(),'post.review',gen_random_uuid())"])await deny(()=>f.db.exec(sql),/permission denied/);}assert.deepEqual(await counts(),baseline);
});
test('CA02 DB: failure to append event rolls back decision, revision and receipt together',async()=>{
 const p=await submit(),baseline=await counts();await f.owner();await f.db.exec("create function private.ca02_fail_event() returns trigger language plpgsql as $$begin raise exception 'TESTFIXTURE history append failed';end$$;create trigger ca02_fail_event before insert on private.campaign_events for each row execute function private.ca02_fail_event()");await actor(f.ids.reviewer);await deny(()=>call('post.review',review(p.id)),/history append failed/);assert.deepEqual(await counts(),baseline);await actor(f.ids.member);assert.equal((await state()).posts[0].status,'candidate');assert.equal((await state()).posts[0].revision,1);
});
test('CA02 DB: revoked reviewer cannot replay successful review receipt',async()=>{
 const p=await submit(),request=randomUUID(),data=review(p.id);await actor(f.ids.reviewer);await call('post.review',data,request);await f.owner();await f.db.exec(`update private.campaign_access set revoked_at=clock_timestamp() where campaign_id=${q(campaign)} and user_id=${q(f.ids.reviewer)}`);const baseline=await counts();await actor(f.ids.reviewer);await deny(()=>call('post.review',data,request),/not_authorized/);assert.deepEqual(await counts(),baseline);
});
test('CA02 DB: withdrawn participant blocks review but retains prior submission history',async()=>{
 const p=await submit();await call('participant.withdraw',{id:participant});const baseline=await counts();await actor(f.ids.reviewer);await deny(()=>call('post.review',review(p.id)),/consent_required/);assert.deepEqual(await counts(),baseline);await actor(f.ids.reviewer);assert.equal((await state()).posts.length,0);
});

test('CA02 history: empty candidate history is an explicit read without new events',async()=>{
 const p=await submit(),baseline=await counts();await actor(f.ids.member);assert.deepEqual(await history(p.id),{post_id:p.id,items:[],has_more:false,next_before_revision:null});assert.deepEqual(await counts(),baseline);
});
test('CA02 history: actual decisions, reasons, reviewer and timestamps appear newest first',async()=>{
 const p=await submit();await actor(f.ids.reviewer);await call('post.review',review(p.id,1,'verified','TESTFIXTURE first decision'));await call('post.review',review(p.id,2,'rejected','TESTFIXTURE revised decision'));const baseline=await counts();await actor(f.ids.member);const h=await history(p.id);assert.equal(h.items.length,2);assert.deepEqual(h.items.map(x=>[x.from_revision,x.to_revision,x.decision,x.reason]),[[2,3,'rejected','TESTFIXTURE revised decision'],[1,2,'verified','TESTFIXTURE first decision']]);assert(h.items.every(x=>x.reviewer_id===f.ids.reviewer&&x.reviewer_name.length>0&&Number.isFinite(Date.parse(x.reviewed_at))));assert.equal(h.has_more,false);assert.deepEqual(await counts(),baseline);
});
test('CA02 history: current campaign editor, reviewer, reader and own participant can read',async()=>{
 const p=await submit();await actor(f.ids.reviewer);await call('post.review',review(p.id));for(const id of [f.ids.chair,f.ids.reviewer,f.ids.admin,f.ids.member]){await actor(id);assert.equal((await history(p.id)).items.length,1);}
});
test('CA02 history: chair/admin without current campaign task, other campaign and other org have no bypass',async()=>{
 const p=await submit();await f.owner();await f.db.exec(`update private.campaign_access set revoked_at=clock_timestamp() where campaign_id=${q(campaign)} and user_id in(${q(f.ids.chair)},${q(f.ids.admin)})`);for(const id of [f.ids.chair,f.ids.admin,f.ids.other]){await actor(id);await deny(()=>history(p.id),/not_available/);}await actor(f.ids.member);await deny(()=>history(p.id,null,randomUUID()),/not_available/);await deny(()=>history(p.id,null,campaign,f.ids.otherOrg),/not_available/);await deny(()=>history(randomUUID()),/not_available/);
});
test('CA02 history: participant cannot read another participant source',async()=>{
 await actor(f.ids.chair);const other=await call('participant.select',{person_id:f.ids.person,policy_id:policy,expires_at:new Date(Date.now()+3600000).toISOString()});await call('participant.accept',{id:other.id,accepted:true});const p=await call('post.submit',{participant_id:other.id,external_id:'12345678901'});await actor(f.ids.member);await deny(()=>history(p.id),/not_available/);
});
test('CA02 history: revoked or expired reviewer and revoked auth session cannot read old pages',async()=>{
 const p=await submit();await actor(f.ids.reviewer);await call('post.review',review(p.id));await f.owner();await f.db.exec(`update private.campaign_access set valid_until=clock_timestamp()-interval '1 second' where user_id=${q(f.ids.reviewer)}`);await actor(f.ids.reviewer);await deny(()=>history(p.id),/not_available/);await f.owner();await f.db.exec(`delete from auth.sessions where user_id=${q(f.ids.member)}`);await actor(f.ids.member);await deny(()=>history(p.id),/not_available/);
});
test('CA02 history: withdrawal or replacement declaration hides stored historical reasons',async()=>{
 const p=await submit();await actor(f.ids.reviewer);await call('post.review',review(p.id));await actor(f.ids.member);await call('participant.withdraw',{id:participant});await actor(f.ids.reviewer);await deny(()=>history(p.id),/not_available/);await f.owner();assert.equal((await f.db.query<{n:number}>(`select count(*)::int n from private.campaign_receipts where campaign_id=${q(campaign)} and operation='post.review'`)).rows[0].n,1);
});
test('CA02 history: renewed consent never exposes review reasons from the prior purpose',async()=>{
 const p=await submit();await actor(f.ids.reviewer);await call('post.review',review(p.id));await actor(f.ids.chair);const pol=await call('policy.set',{version:2,body:'TESTFIXTURE new purpose',retention:'Local fixture only',fields:['post_url','views'],document_id:f.ids.policyDoc});const next=await call('participant.select',{person_id:f.ids.otherPerson,policy_id:pol.id,expires_at:new Date(Date.now()+3600000).toISOString()});await actor(f.ids.member);await call('participant.accept',{id:next.id,accepted:true});assert.equal((await call('post.submit',{participant_id:next.id,external_id:'abcdefghijk'})).id,p.id);assert.equal((await history(p.id)).items.length,0);await actor(f.ids.reviewer);await call('post.review',review(p.id,3,'verified','TESTFIXTURE new-purpose reason'));assert.deepEqual((await history(p.id)).items.map(x=>x.reason),['TESTFIXTURE new-purpose reason']);
});
test('CA02 history: keyset pages return all decisions exactly once and recheck access',async()=>{
 const p=await submit();await actor(f.ids.reviewer);for(let i=1;i<=28;i++)await call('post.review',review(p.id,i,i%2?'verified':'rejected','TESTFIXTURE decision '+i));const first=await history(p.id);assert.equal(first.items.length,25);assert.equal(first.has_more,true);assert.equal(first.next_before_revision,4);const second=await history(p.id,first.next_before_revision);assert.deepEqual(second.items.map(x=>x.from_revision),[3,2,1]);assert.equal(second.has_more,false);assert.equal(new Set([...first.items,...second.items].map(x=>x.request_id)).size,28);await deny(()=>history(p.id,0),/invalid_revision/);await f.owner();await f.db.exec(`update private.campaign_access set revoked_at=clock_timestamp() where user_id=${q(f.ids.reviewer)}`);await actor(f.ids.reviewer);await deny(()=>history(p.id,first.next_before_revision),/not_available/);
});
test('CA02 history: fixed read-only RPC is not callable by anonymous or service role',async()=>{
 const p=await submit();for(const role of ['anon','service_role']){await f.owner();await f.db.exec(`set role ${role}`);await deny(()=>history(p.id),/permission denied/);}await f.owner();const fn=(await f.db.query<{provolatile:string;prosecdef:boolean;proconfig:string[]}>("select provolatile,prosecdef,proconfig from pg_proc where oid='public.f3_review_history(uuid,uuid,uuid,integer)'::regprocedure")).rows[0];assert.equal(fn.provolatile,'s');assert.equal(fn.prosecdef,true);assert(fn.proconfig.includes('search_path=""'));
});
