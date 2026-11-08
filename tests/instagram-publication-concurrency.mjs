import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
if(process.env.PGHOST!=='127.0.0.1'||process.env.PGDATABASE!=='besc_f1_fixture'||process.env.PGUSER!=='postgres'||process.env.PGPASSWORD!=='fixture-only')throw Error('Dedicated localhost fixture only');
const config={host:'127.0.0.1',port:Number(process.env.PGPORT),database:'besc_f1_fixture',user:'postgres',password:'fixture-only',connectionTimeoutMillis:5000};
const root=new pg.Client(config),a=new pg.Client(config),b=new pg.Client(config),sessions=new Map();let org,users,serial=1000;
const capture=p=>p.then(value=>({value}),error=>({error}));
async function begin(c,user=users.admin,role='authenticated'){
 await c.query('begin');await c.query("set local lock_timeout='5s';set local statement_timeout='10s'");
 await c.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role',$2,true),set_config('request.jwt.claims',$3,true)",[user,role,JSON.stringify({sub:user,role,session_id:sessions.get(user)})]);await c.query('set local role '+role);
}
async function as(c,user,fn,role='authenticated'){await begin(c,user,role);try{const value=await fn();await c.query('commit');return value;}catch(e){await c.query('rollback');throw e;}}
const owner=(c,p,action,job=null)=>c.query('select public.instagram_publication_owner($1,$2,$3,$4) v',[org,p,action,job]).then(r=>r.rows[0].v);
const service=(c,job,action,data={})=>c.query('select public.instagram_publication_server($1,$2,$3) v',[job,action,JSON.stringify(data)]).then(r=>r.rows[0].v);
async function waiting(){const deadline=Date.now()+2500;while(Date.now()<deadline){if((await root.query('select wait_event_type from pg_stat_activity where pid=$1',[b.processID])).rows[0]?.wait_event_type==='Lock')return;await new Promise(r=>setTimeout(r,10));}throw Error('Expected a real PostgreSQL lock wait');}
async function fixture(){
 const post=randomUUID(),account=randomUUID(),approval=randomUUID(),external=String(++serial);
 await as(a,users.admin,async()=>{
  await a.query("insert into public.social_accounts(id,organization_id,platform,account_name,external_account_id,status,granted_scopes,created_by) values($1,$2,'instagram','TESTFIXTURE - NIET PUBLICEREN',$3,'connected',array['instagram_basic','instagram_content_publish','pages_read_engagement'],$4)",[account,org,external,users.admin]);
  await a.query("insert into public.social_posts(id,organization_id,title,platform,copy,scheduled_at,instagram_account_id,instagram_target,instagram_image_url,instagram_image_sha256,created_by)values($1,$2,'TESTFIXTURE - NIET PUBLICEREN','Instagram','Fictieve tekst',clock_timestamp()-interval '1 minute',$3,$4,'https://media.example.invalid/image.jpg',$5,$6)",[post,org,account,JSON.stringify({name:'TESTFIXTURE - NIET PUBLICEREN',external_id:external}),'a'.repeat(64),users.admin]);
  await a.query("insert into public.approval_requests(id,organization_id,entity_type,entity_id,title,module,source_href,requested_by)values($1,$2,'social',$3,'TESTFIXTURE','social','/fixture',$4)",[approval,org,post,users.admin]);
 });
 await as(a,users.chair,()=>a.query("update public.approval_requests set status='approved',decided_by=$1 where id=$2",[users.chair,approval]));
 const job=(await as(a,users.admin,()=>owner(a,post,'queue'))).id;return{post,account,job};
}
try{
 await Promise.all([root.connect(),a.connect(),b.connect()]);assert.match((await root.query('show server_version')).rows[0].server_version,/^17\./);
 assert.equal((await root.query("select email from auth.users where id='00000000-0000-4000-8000-000000000001'")).rows[0].email,'fixture@example.invalid');
 org=(await root.query("select id from public.organizations where slug='besc'")).rows[0].id;
 users=Object.fromEntries((await root.query("select split_part(email,'@',1) name,id from auth.users where email like '%@fixture.invalid'")).rows.map(r=>[r.name,r.id]));
 for(const u of [users.admin,users.chair]){const id=randomUUID();sessions.set(u,id);await root.query('update auth.users set email_confirmed_at=now() where id=$1',[u]);await root.query('insert into auth.sessions(id,user_id)values($1,$2)',[id,u]);}
 await root.query("update public.organization_members set finance_role='approver' where organization_id=$1 and user_id=$2",[org,users.chair]);
 let f=await fixture();await begin(a,users.admin,'service_role');const claim=await service(a,f.job,'claim');assert.equal(claim.state,'preparing');
 await begin(b,users.admin,'service_role');let pending=capture(service(b,f.job,'claim'));await waiting();await a.query('commit');let result=await pending;assert.ifError(result.error);assert.equal(result.value.state,'skipped');await b.query('commit');console.log('PASS 1: simultaneous dispatch claims have exactly one winner.');
 f=await fixture();await begin(a);await owner(a,f.post,'cancel',f.job);await begin(b,users.admin,'service_role');pending=capture(service(b,f.job,'claim'));await waiting();await a.query('commit');result=await pending;assert.ifError(result.error);assert.equal(result.value.state,'skipped');await b.query('commit');console.log('PASS 2: committed cancellation prevents a waiting dispatch.');
 f=await fixture();await begin(a);await a.query("update public.social_posts set copy='TESTFIXTURE changed' where id=$1",[f.post]);await begin(b,users.admin,'service_role');pending=capture(service(b,f.job,'claim'));await waiting();await a.query('commit');result=await pending;assert.ifError(result.error);assert.equal(result.value.state,'blocked');await b.query('commit');console.log('PASS 3: a waiting claim reads the committed edited version and blocks.');
 f=await fixture();await begin(a,users.admin,'service_role');await service(a,f.job,'claim');await begin(b);pending=capture(b.query("update public.social_posts set copy='TESTFIXTURE too late' where id=$1",[f.post]));await waiting();await a.query('commit');result=await pending;assert.match(result.error?.message??'',/inflight/);await b.query('rollback');console.log('PASS 4: an edit waiting behind dispatch cannot rewrite in-flight content.');
 f=await fixture();await begin(a);await a.query("update public.social_accounts set external_account_id='999999' where id=$1",[f.account]);await begin(b,users.admin,'service_role');pending=capture(service(b,f.job,'claim'));await waiting();await a.query('commit');result=await pending;assert.ifError(result.error);assert.equal(result.value.state,'blocked');await b.query('commit');console.log('PASS 5: account retargeting blocks a waiting claim.');
 f=await fixture();const next=await as(a,users.admin,()=>service(a,f.job,'claim'),'service_role');await as(a,users.admin,()=>service(a,f.job,'created',{nonce:next.nonce,container_id:'456'}),'service_role');
 await begin(a);await a.query("update public.social_accounts set granted_scopes='{}' where id=$1",[f.account]);await begin(b,users.admin,'service_role');pending=capture(service(b,f.job,'dispatch_publish',{nonce:next.nonce}));await waiting();await a.query('commit');result=await pending;assert.match(result.error?.message??'',/source_or_access_changed/);await b.query('rollback');console.log('PASS 6: revoked account permission blocks an already waiting publish authorization.');
 console.log('All 6 Instagram races passed on isolated PostgreSQL 17. No provider or Cloud access.');
}finally{await Promise.allSettled([a.query('rollback'),b.query('rollback')]);await Promise.allSettled([root.end(),a.end(),b.end()]);}
