// Native PostgreSQL only; use the disposable fixture seeded by social-approval.test.mts.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
if(process.env.PGHOST!=='127.0.0.1'||process.env.PGDATABASE!=='besc_f1_fixture'||process.env.PGUSER!=='postgres'||process.env.PGPASSWORD!=='fixture-only')throw Error('Requires isolated localhost besc_f1_fixture with fixture-only credentials');
const config={host:'127.0.0.1',port:Number(process.env.PGPORT??5432),database:'besc_f1_fixture',user:'postgres',password:'fixture-only',connectionTimeoutMillis:5000};
const root=new pg.Client(config),a=new pg.Client(config),b=new pg.Client(config);
const capture=p=>p.then(value=>({value}),error=>({error}));
let org,users;
async function begin(c,actor){await c.query('begin isolation level read committed');await c.query("set local lock_timeout='5s';set local statement_timeout='10s';set local role authenticated");await c.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role','authenticated',true)",[actor]);}
async function transaction(c,actor,fn){await begin(c,actor);try{const result=await fn();await c.query('commit');return result;}catch(e){await c.query('rollback');throw e;}}
async function waiting(){const deadline=Date.now()+2000;while(Date.now()<deadline){const row=(await root.query("select wait_event_type from pg_stat_activity where pid=$1",[b.processID])).rows[0];if(row?.wait_event_type==='Lock')return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('Expected lock barrier was not reached');}
async function post(){const id=randomUUID(),variant=randomUUID();await root.query("insert into public.social_posts(id,organization_id,title,copy,created_by) values($1,$2,'TESTFIXTURE - NIET PUBLICEREN - SO06 concurrency','Fictieve hoofdtekst',$3)",[id,org,users.admin]);await root.query("insert into public.social_post_variants(id,organization_id,social_post_id,platform,copy,created_by) values($1,$2,$3,'Facebook','Fictieve kanaaltekst',$4)",[variant,org,id,users.admin]);return {id,variant};}
async function request(c,post){const id=randomUUID();await c.query("insert into public.approval_requests(id,organization_id,entity_type,entity_id,title,module,source_href,requested_by) values($1,$2,'social',$3,'TESTFIXTURE','social',$4,$5)",[id,org,post,'/app/social/'+post,users.admin]);return id;}
async function submit(post){return transaction(a,users.admin,()=>request(a,post));}
function decide(c,id,actor,status='approved'){return c.query("update public.approval_requests set status=$1,decided_by=$2,decision_note='TESTFIXTURE onafhankelijke beoordeling' where id=$3 and status='pending' returning id",[status,actor,id]);}
async function source(id){return (await root.query('select status,copy,review_version from public.social_posts where id=$1',[id])).rows[0];}
try{
 await Promise.all([root.connect(),a.connect(),b.connect()]);
 assert.match((await root.query('show server_version')).rows[0].server_version,/^17\./);
 org=(await root.query("select id from public.organizations where slug='besc'")).rows[0].id;
 users=Object.fromEntries((await root.query("select split_part(email,'@',1) name,id from auth.users where email like '%@fixture.invalid'")).rows.map(row=>[row.name,row.id]));
 assert.ok(users.admin&&users.chair&&users.reviewer,'Synthetic fixture identities required');
 assert.equal((await root.query("select email from auth.users where id='00000000-0000-4000-8000-000000000001'")).rows[0].email,'fixture@example.invalid');
 await root.query("update public.organization_members set finance_role='approver' where organization_id=$1 and user_id=$2",[org,users.chair]);
 await root.query("update public.organization_members set role='admin' where organization_id=$1 and user_id=$2",[org,users.reviewer]);

 let p=await post();await begin(a,users.admin);await request(a,p.id);await begin(b,users.admin);
 let pending=capture(request(b,p.id));await waiting();await a.query('commit');let result=await pending;
 assert.equal(result.error?.code,'23505');await b.query('rollback');
 assert.equal((await root.query("select count(*)::int n from public.approval_requests where entity_id=$1 and status='pending'",[p.id])).rows[0].n,1);
 console.log('PASS 1: simultaneous submissions retain exactly one pending request.');

 p=await post();let review=await submit(p.id);await begin(a,users.chair);assert.equal((await decide(a,review,users.chair)).rowCount,1);
 await begin(b,users.reviewer);pending=capture(decide(b,review,users.reviewer,'rejected'));await waiting();await a.query('commit');result=await pending;
 assert.ifError(result.error);assert.equal(result.value.rowCount,0);await b.query('commit');assert.equal((await source(p.id)).status,'approved');
 assert.equal((await root.query("select count(*)::int n from public.audit_log where entity_type='approval_requests' and entity_id=$1 and new_status in ('approved','rejected')",[review])).rows[0].n,1);
 console.log('PASS 2: concurrent opposite decisions accept one decision and one audit effect.');

 p=await post();review=await submit(p.id);await begin(a,users.chair);await decide(a,review,users.chair);
 await begin(b,users.admin);pending=capture(b.query("update public.social_posts set copy='TESTFIXTURE gewijzigd na akkoord' where id=$1",[p.id]));await waiting();await a.query('commit');result=await pending;assert.ifError(result.error);await b.query('commit');
 assert.equal((await source(p.id)).status,'review');assert.equal((await source(p.id)).copy,'TESTFIXTURE gewijzigd na akkoord');
 const submitted=(await root.query('select source_snapshot from public.approval_requests where id=$1',[review])).rows[0].source_snapshot;
 assert.equal(submitted.post.copy,'Fictieve hoofdtekst');assert.ok(Number((await source(p.id)).review_version)>Number(submitted.post.review_version));
 console.log('PASS 3: a root edit waiting behind approval invalidates that approval and preserves its snapshot.');

 p=await post();await begin(a,users.admin);await a.query("update public.social_post_variants set copy='TESTFIXTURE nieuwste variant' where id=$1",[p.variant]);
 await begin(b,users.admin);pending=capture(request(b,p.id));await waiting();await a.query('commit');result=await pending;assert.ifError(result.error);await b.query('commit');
 const snapshot=(await root.query('select source_snapshot from public.approval_requests where id=$1',[result.value])).rows[0].source_snapshot;
 assert.equal(snapshot.variants[0].copy,'TESTFIXTURE nieuwste variant');assert.equal(Number(snapshot.post.review_version),Number((await source(p.id)).review_version));
 console.log('PASS 4: submission waiting behind a variant edit captures the committed new variant and version.');

 p=await post();review=await submit(p.id);await begin(a,users.chair);await decide(a,review,users.chair);
 await begin(b,users.admin);pending=capture(b.query("update public.social_post_variants set copy='TESTFIXTURE variant na akkoord' where id=$1",[p.variant]));await waiting();await a.query('commit');result=await pending;assert.ifError(result.error);await b.query('commit');
 assert.equal((await source(p.id)).status,'review');
 assert.equal((await root.query('select source_snapshot from public.approval_requests where id=$1',[review])).rows[0].source_snapshot.variants[0].copy,'Fictieve kanaaltekst');
 console.log('PASS 5: a variant edit waiting behind approval invalidates the bundle and retains approved text.');

 p=await post();await begin(a,users.admin);await a.query('delete from public.social_post_variants where id=$1',[p.variant]);
 await begin(b,users.admin);pending=capture(request(b,p.id));await waiting();await a.query('commit');result=await pending;assert.ifError(result.error);await b.query('commit');
 assert.deepEqual((await root.query('select source_snapshot from public.approval_requests where id=$1',[result.value])).rows[0].source_snapshot.variants,[]);
 console.log('PASS 6: a submission waiting behind variant removal never captures the removed variant.');

 p=await post();review=await submit(p.id);await begin(a,users.admin);await a.query("update public.organization_members set finance_role='none' where organization_id=$1 and user_id=$2",[org,users.chair]);
 await begin(b,users.chair);pending=capture(decide(b,review,users.chair));await waiting();await a.query('commit');result=await pending;
 if(result.error){assert.match(result.error.message,/social_review_decision_denied|row-level security/);await b.query('rollback');}else{assert.equal(result.value.rowCount,0);await b.query('commit');}
 assert.equal((await source(p.id)).status,'review');assert.equal((await root.query('select status from public.approval_requests where id=$1',[review])).rows[0].status,'pending');
 console.log('PASS 7: committed reviewer revocation blocks an already waiting decision.');
 console.log('All 7 social review concurrency scenarios passed on isolated native PostgreSQL 17; no Cloud or provider access.');
}finally{
 await Promise.allSettled([a.query('rollback'),b.query('rollback')]);
 await Promise.allSettled([root.end(),a.end(),b.end()]);
}
