// Run only after the full native replay in the dedicated disposable CI database.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
if(process.env.PGHOST!=='127.0.0.1'||process.env.PGDATABASE!=='besc_foundation_fixture'||process.env.PGUSER!=='postgres')throw Error('Requires disposable localhost foundation fixture');
const config={host:process.env.PGHOST,port:Number(process.env.PGPORT??5432),database:process.env.PGDATABASE,user:process.env.PGUSER,password:process.env.PGPASSWORD};
const db=new pg.Client(config);await db.connect();const peers=[];
try{
  assert.match((await db.query('show server_version')).rows[0].server_version,/^17\./);
  assert.equal(Number((await db.query("select count(*) from pg_tables where schemaname in('public','private')")).rows[0].count),197);
  const user='00000000-0000-4000-8000-000000000001';
  assert.equal((await db.query('select email from auth.users where id=$1',[user])).rows[0].email,'fixture@example.invalid');
  const org=(await db.query('select organization_id from organization_members where user_id=$1',[user])).rows[0].organization_id;
  const source=randomUUID(),grant=randomUUID();
  await db.query("insert into projects(id,organization_id,title,description,created_by)values($1,$2,'TESTFIXTURE — NIET PUBLICEREN — agent concurrency','Fictieve geselecteerde context',$3)",[source,org,user]);
  const version=(await db.query('select updated_at::text version from projects where id=$1',[source])).rows[0].version;
  await db.query("insert into commandcenter_mcp_oauth_grants(id,user_id,organization_id,client_id,resource,scope,redirect_uri,code_challenge,expires_at)values($1,$2,$3,'fixture','https://fixture.invalid/mcp','commandcenter:read agent_results:write','fixture','fixture',now()+interval '1 day')",[grant,user,org]);
  peers.push(new pg.Client(config),new pg.Client(config));for(const c of peers){await c.connect();await c.query('set role service_role');}
  await peers[1].query("set timezone='Europe/Brussels'");
  const create=c=>c.query("select create_agent_workflow_job($1,$2,$3,'agt_6ac27fb6af208191a789d9e3ba077ef6','technical',$4,'TESTFIXTURE — gelijktijdige voorbereiding','projects',$5,$6,'[\"description\"]','','',true) j",[user,org,grant,randomUUID(),source,version]);
  await peers[0].query('begin');const first=(await create(peers[0])).rows[0].j;
  let settled=false;const waiting=create(peers[1]).finally(()=>{settled=true;});await new Promise(r=>setTimeout(r,150));assert.equal(settled,false);
  await peers[0].query('commit');assert.equal((await waiting).rows[0].j.id,first.id);
  assert.equal(Number((await db.query('select count(*) from agent_jobs where source_id=$1',[source])).rows[0].count),1);
  // Fixture setup only. Runtime approval is tested through the chair-only RPC.
  await db.query('insert into agent_execution_controls(organization_id,paused,changed_by)values($1,false,$2) on conflict(organization_id)do update set paused=false',[org,user]);
  await db.query("update agent_jobs set budget_credits=5,budget_approved_by=$1,provider_limit_reference='TESTFIXTURE',max_attempts=2 where id=$2",[user,first.id]);
  await peers[0].query('begin');await peers[0].query('select cancel_agent_workflow_job($1,$2,$3)',[user,org,first.id]);
  settled=false;const dispatch=peers[1].query('select claim_commandcenter_agent_dispatch($1,$2,$3,$4,$5)',[user,org,first.id,'agtch_fixture',randomUUID()]).then(()=>({accepted:true}),e=>({error:e.message})).finally(()=>{settled=true;});
  await new Promise(r=>setTimeout(r,150));assert.equal(settled,false);await peers[0].query('commit');assert.match((await dispatch).error,/agent_cancelled/);
  console.log('Step 11: concurrent preparation creates one job; cancellation blocks waiting dispatch. Local synthetic fixture only.');
}finally{for(const c of peers)await c.end();await db.end();}
