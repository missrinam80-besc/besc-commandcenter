import assert from 'node:assert/strict';import pg from 'pg';import {randomUUID} from 'node:crypto';
if(process.env.PGHOST!=='127.0.0.1'||process.env.PGDATABASE!=='besc_f1_fixture'||process.env.PGUSER!=='postgres')throw Error('Dedicated local CA03 fixture required');
const db=new pg.Client(),a=new pg.Client(),b=new pg.Client();await Promise.all([db.connect(),a.connect(),b.connect()]);
try{
 const org=(await db.query("select id from public.organizations where slug='besc'")).rows[0].id;
 const user=(await db.query("select id from auth.users where email='member@fixture.invalid'")).rows[0].id;
 const session=(await db.query('select id from auth.sessions where user_id=$1',[user])).rows[0].id;
 async function actor(c,role='authenticated'){await c.query('reset role');await c.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false),set_config('request.jwt.claims',$3,false)",[user,role,JSON.stringify({sub:user,role,session_id:session})]);await c.query('set role '+role);}
 const own=(c,op,link,data={})=>c.query('select public.creator_youtube_owner($1,$2,$3,$4) v',[org,op,link,data]);
 const finish=(job,data)=>b.query("select public.creator_youtube_server($1,'finish',$2) v",[job,data]);
 const consent=letter=>({request_id:randomUUID(),accepted:true,purpose:'TESTFIXTURE - NIET PUBLICEREN - CA03 race',channel_id:'UC'+letter.repeat(22),video_ids:['abcdefghijk'],start_date:'2026-01-01',end_date:'2026-01-02',valid_until:new Date(Date.now()+3600000).toISOString(),retain_until:new Date(Date.now()+7200000).toISOString()});
 const token=channel=>({channel_id:channel,scopes:['https://www.googleapis.com/auth/youtube.readonly','https://www.googleapis.com/auth/yt-analytics.readonly'],access_token:'MOCK-ACCESS',refresh_token:'MOCK-REFRESH',expires_at:new Date(Date.now()+3600000).toISOString()});
 await Promise.all([actor(a),actor(b)]);const d=consent('D'),duplicates=await Promise.all([own(a,'consent',null,d),own(b,'consent',null,d)]);assert.equal(duplicates[0].rows[0].v.id,duplicates[1].rows[0].v.id);assert.equal((await db.query('select count(*)::int n from private.cy_links')).rows[0].n,1);console.log('PASS CA03 1: simultaneous identical consent creates one immutable record.');
 for(const [index,kind]of ['authorize','refresh','collect'].entries()){
  await actor(a);const data=consent(['E','F','G'][index]);const link=(await own(a,'consent',null,data)).rows[0].v.id;
  let job=(await own(a,'begin',link,{kind:'authorize',request_id:randomUUID(),state_hash:'0'.repeat(64)})).rows[0].v.id;await actor(b,'service_role');
  if(kind!=='authorize'){await finish(job,token(data.channel_id));job=(await own(a,'begin',link,{kind,request_id:randomUUID()})).rows[0].v.id;}
  const pid=(await b.query('select pg_backend_pid() pid')).rows[0].pid;await a.query('begin');await own(a,'withdraw',link);
  let settled=false;const pending=finish(job,kind==='collect'?{rows:[{video_id:'abcdefghijk',metric:'views',value:42,quality:'known'}]}:token(data.channel_id)).then(()=>{settled=true;return null},e=>{settled=true;return e});
  let blocked=false;const until=Date.now()+5000;while(Date.now()<until&&!settled){blocked=(await db.query("select exists(select 1 from pg_stat_activity where pid=$1 and wait_event_type='Lock') waiting",[pid])).rows[0].waiting;if(blocked)break;await new Promise(r=>setTimeout(r,10));}
  assert(blocked,'Finish must actually wait behind withdrawal');await a.query('commit');const error=await pending;assert(error);assert.match(error.message,/stale_job/);assert.equal((await db.query('select status from private.cy_links where id=$1',[link])).rows[0].status,'revoked');assert.equal((await db.query('select count(*)::int n from private.cy_samples where link_id=$1',[link])).rows[0].n,0);console.log(`PASS CA03 ${index+2}: withdrawal blocks waiting ${kind} commit without reactivation.`);
 }
 console.log('All 4 CA03 scenarios passed on isolated PostgreSQL 17; Vault/provider are explicit test doubles.');
}finally{await Promise.allSettled([a.query('rollback'),b.query('rollback')]);await Promise.all([db.end(),a.end(),b.end()]);}
