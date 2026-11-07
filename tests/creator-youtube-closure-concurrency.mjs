import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
if(process.env.PGHOST!=='127.0.0.1'||process.env.PGDATABASE!=='besc_f1_fixture'||process.env.PGUSER!=='postgres')throw Error('Dedicated localhost closure fixture required');
const db=new pg.Client(),a=new pg.Client(),b=new pg.Client();await Promise.all([db.connect(),a.connect(),b.connect()]);
try{
 const org=(await db.query("select id from public.organizations where slug='besc'")).rows[0].id;
 const user=(await db.query("select id from auth.users where email='member@fixture.invalid'")).rows[0].id;
 const session=(await db.query('select id from auth.sessions where user_id=$1',[user])).rows[0].id;
 async function actor(c,role){await c.query('reset role');await c.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false),set_config('request.jwt.claims',$3,false)",[user,role,JSON.stringify({sub:user,role,session_id:session})]);await c.query('set role '+role);}
 const own=(c,op,link,data={})=>c.query('select public.creator_youtube_owner($1,$2,$3,$4) v',[org,op,link,data]);
 const close=(c,job,link)=>c.query("select public.creator_youtube_server($1,'close_unstarted',$2) v",[job,{link_id:link,reason:'cancelled'}]);
 const read=(c,job)=>c.query("select public.creator_youtube_server($1,'read','{}') v",[job]);
 async function prepared(letter){await actor(a,'authenticated');const input={accepted:true,request_id:randomUUID(),purpose:'TESTFIXTURE - NIET PUBLICEREN - closure race',channel_id:'UC'+letter.repeat(22),video_ids:['abcdefghijk'],start_date:'2026-01-01',end_date:'2026-01-02',valid_until:new Date(Date.now()+3600000).toISOString(),retain_until:new Date(Date.now()+7200000).toISOString()};const link=(await own(a,'consent',null,input)).rows[0].v.id;const job=(await own(a,'begin',link,{kind:'authorize',request_id:randomUUID(),state_hash:'0'.repeat(64)})).rows[0].v.id;return{link,job};}
 const pidA=(await a.query('select pg_backend_pid() pid')).rows[0].pid,pidB=(await b.query('select pg_backend_pid() pid')).rows[0].pid;
 async function waiting(pid){const until=Date.now()+5000;while(Date.now()<until){if((await db.query("select exists(select 1 from pg_stat_activity where pid=$1 and wait_event_type='Lock') yes",[pid])).rows[0].yes)return;await new Promise(r=>setTimeout(r,10));}throw Error('Expected actual SQL lock wait');}
 async function count(job){return(await db.query('select count(*)::int n from private.cy_authorization_closures where job_id=$1',[job])).rows[0].n;}

 // Committed closure wins: no later worker may fetch authorization state.
 let r=await prepared('H');await a.query('begin');await own(a,'withdraw',r.link);await actor(a,'service_role');assert.equal((await close(a,r.job,r.link)).rows[0].v.provider_revocation,'none');await actor(b,'service_role');
 let pending=read(b,r.job).then(()=>null,e=>e);await waiting(pidB);await a.query('commit');assert.match((await pending)?.message??'',/stale_job/);assert.equal(await count(r.job),1);console.log('PASS closure 1: committed cancellation blocks waiting dispatch.');

 // Dispatch wins: an unstarted assertion is never used to clear uncertain work.
 r=await prepared('I');await actor(b,'service_role');await b.query('begin');await read(b,r.job);await a.query('begin');pending=own(a,'withdraw',r.link);await waiting(pidA);await b.query('commit');await pending;await actor(a,'service_role');await a.query('savepoint close_probe');let failure;try{await close(a,r.job,r.link);}catch(e){failure=e;}assert.match(failure?.message??'',/unstarted_not_confirmed/);await a.query('rollback to close_probe');await a.query('commit');assert.equal(await count(r.job),0);console.log('PASS closure 2: committed dispatch preserves unresolved revocation.');

 // Two separate workers recover the same closure; only one receipt is persisted.
 r=await prepared('J');await own(a,'withdraw',r.link);await actor(a,'service_role');await a.query('begin');await close(a,r.job,r.link);await actor(b,'service_role');pending=close(b,r.job,r.link);await waiting(pidB);await a.query('commit');assert.equal((await pending).rows[0].v.provider_revocation,'none');assert.equal(await count(r.job),1);console.log('PASS closure 3: simultaneous recovery produces one closure receipt.');

 // A rolled-back closure cannot be reported as committed; the waiting read remains valid.
 r=await prepared('K');await a.query('begin');await own(a,'withdraw',r.link);await actor(a,'service_role');await close(a,r.job,r.link);await actor(b,'service_role');pending=read(b,r.job);await waiting(pidB);await a.query('rollback');assert.equal((await pending).rows[0].v.kind,'authorize');assert.equal(await count(r.job),0);assert.equal((await db.query('select dispatch_state from private.cy_jobs where id=$1',[r.job])).rows[0].dispatch_state,'started');console.log('PASS closure 4: aborted cancellation leaves no false terminal proof.');
 console.log('All four closure races passed on isolated PostgreSQL; no provider calls.');
}finally{await Promise.allSettled([a.query('rollback'),b.query('rollback')]);await Promise.all([db.end(),a.end(),b.end()]);}
