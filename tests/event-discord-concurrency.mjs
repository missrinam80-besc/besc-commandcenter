// Run ONLY after event-discord-database.test.mts in its dedicated native fixture.
import assert from 'node:assert/strict';
import {createRequire}from'node:module';
if(process.env.PGHOST!=='127.0.0.1'||process.env.PGDATABASE!=='besc_f1_fixture'||process.env.PGUSER!=='postgres'||process.env.F1_NATIVE_TEST!=='1')throw Error('Requires dedicated localhost native fixture');
const {Client}=createRequire(import.meta.url)('pg'),a=new Client(),b=new Client();
const q=v=>"'"+String(v).replaceAll("'","''")+"'",j=v=>q(JSON.stringify(v))+'::jsonb';
const guild='1067893182387474432',client='fixture-event-client';
async function actor(c,user,role='authenticated'){
 await c.query('reset role');const s=await c.query('select id from auth.sessions where user_id=$1 limit 1',[user]);
 await c.query(`select set_config('request.jwt.claim.sub',${q(user)},false),set_config('request.jwt.claim.role',${q(role)},false),set_config('request.jwt.claims',${j({sub:user,role,session_id:s.rows[0]?.id})}::text,false);set role ${role}`);
}
try{
 await a.connect();await b.connect();assert.match((await a.query('show server_version')).rows[0].server_version,/^17\./);
 await a.query("set statement_timeout='5000ms'");await b.query("set statement_timeout='5000ms'");
 const users=(await a.query("select id,email from auth.users where email in('admin@fixture.invalid','member@fixture.invalid')")).rows;
 const admin=users.find(x=>x.email==='admin@fixture.invalid')?.id,member=users.find(x=>x.email==='member@fixture.invalid')?.id;
 assert.ok(admin&&member);const source=(await a.query("select id,organization_id from public.events where title='BESC community event'")).rows;assert.equal(source.length,1);
 const {id:event,organization_id:org}=source[0];
 const manage=(op,d)=>`select public.event_discord_manage(${q(org)},${q(event)},${q(op)},${j(d)})v`;
 await actor(a,admin);await a.query(manage('configure',{expected_version:0,guild_id:guild,enabled:true,rsvp_enabled:true}));
 const publication=(await a.query(manage('save',{expected_revision:0,enabled:true,rsvp_enabled:true,public_title:'Community gathering',public_description:'Approved public copy.',public_location:'Gistel'}))).rows[0].v.publication;
 await actor(b,admin,'service_role');const bot=(op,d={})=>`select public.event_discord_bot(${q(op)},${j({organization_id:org,guild_id:guild,client_id:client,worker:'fixture-event-worker',site_origin:'https://cc.example.invalid',...d})})v`;
 const job=(await b.query(bot('claim'))).rows[0].v.job;assert.ok(job);
 await a.query('begin');await a.query(manage('withdraw',{expected_revision:publication.revision}));
 let settled=false;const dispatch=b.query(bot('dispatch',{id:job.id,lease_token:job.lease_token})).then(r=>{settled=true;return r.rows[0].v;});
 await new Promise(r=>setTimeout(r,100));assert.equal(settled,false,'Dispatch waits for the event revocation transaction');
 await a.query('commit');assert.equal((await dispatch).authorized,false,'Committed revocation prevents stale dispatch');
 // Reopen a distinct revision for own RSVP, then prove session deletion waits.
 const context=(await a.query(manage('read',{}))).rows[0].v;
 const fresh=(await a.query(manage('save',{expected_revision:context.publication.revision,enabled:true,rsvp_enabled:true,public_title:'Community gathering',public_description:'Approved public copy.',public_location:'Gistel'}))).rows[0].v.publication;
 await actor(a,member);await a.query('begin');await a.query(`select public.event_presence_own(${q(fresh.id)},'coming',${j({expected_version:0,expected_revision:fresh.revision})})`);
 await b.query('reset role');let removed=false;const removal=b.query('delete from auth.sessions where user_id=$1',[member]).then(()=>{removed=true;});
 await new Promise(r=>setTimeout(r,100));assert.equal(removed,false,'Session deletion waits until the authorized RSVP commits');await a.query('commit');await removal;
 await assert.rejects(a.query(`select public.event_presence_own(${q(fresh.id)},'withdraw',${j({expected_version:1})})`),/event_actor_unavailable/);
 console.log(JSON.stringify({native_postgres_17:true,concurrent_cases_passed:2,revocation_prevents_stale_dispatch:true,session_deletion_orders_after_authorized_write:true,live_changes:false}));
}finally{await a.query('rollback').catch(()=>{});await b.query('rollback').catch(()=>{});await Promise.all([a.end(),b.end()]);}
