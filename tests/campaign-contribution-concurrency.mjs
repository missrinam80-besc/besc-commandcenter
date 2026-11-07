import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
if(process.env.PGHOST!=='127.0.0.1'||process.env.PGDATABASE!=='besc_f1_fixture'||process.env.PGUSER!=='postgres')throw Error('Dedicated localhost CA02 fixture required');
const owner=new pg.Client(),a=new pg.Client(),b=new pg.Client();
await Promise.all([owner.connect(),a.connect(),b.connect()]);
try{
 const fixture=(await owner.query("select * from public.campaigns where title='TESTFIXTURE - NIET PUBLICEREN - CA02'")).rows;
 assert.equal(fixture.length,1,'Run CA02 database suite first');const campaign=fixture[0].id,org=fixture[0].organization_id;
 const participant=(await owner.query('select p.*,x.account_user_id from private.campaign_participants p join public.community_people x on x.id=p.person_id where p.campaign_id=$1',[campaign])).rows[0];
 const access=(await owner.query('select * from private.campaign_access where campaign_id=$1',[campaign])).rows;
 const reviewer=access.find(x=>x.role==='reviewer'),chair=access.find(x=>x.role==='editor').user_id;
 const sessions=(await owner.query('select user_id,id from auth.sessions')).rows;
 async function actor(client,id){await client.query('reset role');await client.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false),set_config('request.jwt.claims',$2,false)",[id,JSON.stringify({sub:id,role:'authenticated',session_id:sessions.find(s=>s.user_id===id).id})]);await client.query('set role authenticated');}
 const call=(client,op,data,request=randomUUID())=>client.query('select public.f3_workflow($1,$2,$3,$4,$5) v',[org,campaign,op,data,request]);
 const submit=async external_id=>{await actor(a,participant.account_user_id);return(await call(a,'post.submit',{participant_id:participant.id,external_id})).rows[0].v.id;};
 const review=(id,decision)=>({id,expected_revision:1,decision,availability:'available',reason:'TESTFIXTURE - NIET PUBLICEREN - CA02 race '+decision});
 const history=async id=>(await owner.query("select (select count(*)::int from private.campaign_events where entity_id=$1 and operation='post.review') events,(select count(*)::int from private.campaign_receipts where result->>'id'=$1::text and operation='post.review') receipts",[id])).rows[0];
 let post=await submit('ca02race001');await Promise.all([actor(a,reviewer.user_id),actor(b,reviewer.user_id)]);
 const opposed=await Promise.allSettled([call(a,'post.review',review(post,'verified')),call(b,'post.review',review(post,'rejected'))]);assert.equal(opposed.filter(x=>x.status==='fulfilled').length,1);const loser=opposed.find(x=>x.status==='rejected');assert.match(loser.reason.message,/revision_conflict/);assert.deepEqual(await history(post),{events:1,receipts:1});
 const current=(await owner.query('select revision,status from private.campaign_contributions where id=$1',[post])).rows[0];assert.equal(current.revision,2);assert(['verified','rejected'].includes(current.status));
 console.log('PASS CA02 1: competing reviews accept one decision and one history effect.');
 post=await submit('ca02race002');await Promise.all([actor(a,reviewer.user_id),actor(b,reviewer.user_id)]);const request=randomUUID(),payload=review(post,'verified');const duplicates=await Promise.all([call(a,'post.review',payload,request),call(b,'post.review',payload,request)]);assert.equal(duplicates[0].rows[0].v.id,duplicates[1].rows[0].v.id);assert.deepEqual(await history(post),{events:1,receipts:1});
 console.log('PASS CA02 2: simultaneous retry shares one immutable receipt and one review event.');
 post=await submit('ca02race003');await actor(a,chair);await actor(b,reviewer.user_id);const pid=(await b.query('select pg_backend_pid() pid')).rows[0].pid;
 await a.query('begin');await call(a,'access.revoke',{id:reviewer.id});let settled=false;
 const pending=call(b,'post.review',review(post,'verified')).then(()=>{settled=true;return null},error=>{settled=true;return error});
 const until=Date.now()+5000;let locked=false;while(Date.now()<until&&!settled){locked=(await owner.query("select exists(select 1 from pg_stat_activity where pid=$1 and wait_event_type='Lock') locked",[pid])).rows[0].locked;if(locked)break;await new Promise(resolve=>setTimeout(resolve,10));}
 assert(locked,'Review must actually wait behind revocation');await a.query('commit');const denied=await pending;assert(denied);assert.match(denied.message,/not_authorized/);assert.deepEqual(await history(post),{events:0,receipts:0});assert.equal((await owner.query('select status from private.campaign_contributions where id=$1',[post])).rows[0].status,'candidate');
 console.log('PASS CA02 3: committed reviewer revocation blocks a waiting review without success history.');
 console.log('All 3 CA02 concurrency scenarios passed on isolated PostgreSQL 17; no Cloud/provider access.');
}finally{await Promise.allSettled([a.query('rollback'),b.query('rollback')]);await Promise.all([owner.end(),a.end(),b.end()]);}
