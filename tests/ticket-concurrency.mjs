// Actual independent sessions; hard refusal of any Cloud or non-fixture database.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as pause } from 'node:timers/promises';
if(process.env.PGHOST!=='127.0.0.1'||process.env.PGDATABASE!=='besc_concurrency_fixture')throw Error('Requires isolated localhost besc_concurrency_fixture');
let env=process.env;
const args=['-X','-q','-A','-t','-v','ON_ERROR_STOP=1'];
function processSql(query,interactive=false){
 const child=spawn('psql',interactive?args:[...args,'-c',query],{env,stdio:['pipe','pipe','pipe']});let out='',err='';const listeners=[];
 child.stdout.on('data',chunk=>{out+=chunk;for(const notify of listeners)notify(out);});child.stderr.on('data',chunk=>{err+=chunk;});
 const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>resolve({code,out,err}));});
 return{child,done,write:text=>child.stdin.write(text),ready:()=>new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('Holder not ready')),15000);const notify=text=>{if(text.includes('BESC_READY')){clearTimeout(timer);resolve();}};listeners.push(notify);notify(out);
  done.then(result=>{if(!result.out.includes('BESC_READY')){clearTimeout(timer);reject(Error(result.err||'Holder ended early'));}},reject);
 })};
}
async function sql(query){const r=await processSql(query).done;assert.equal(r.code,0,r.err);return r.out.trim();}
await sql('create database besc_ticket_fixture;');env={...process.env,PGDATABASE:'besc_ticket_fixture'};
const org='10000000-0000-4000-8000-000000000001',user='20000000-0000-4000-8000-000000000001',guild='1067893182387474432',actor='111111111111111111',parent='222222222222222222',thread='333333333333333333';
await sql(`do $$begin if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls;end if;end$$;
 alter role service_role bypassrls;
 create schema auth;create schema private;grant usage on schema private,auth to authenticated,service_role;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create type member_role as enum ('admin','board','member','volunteer');
 create table organizations(id uuid primary key);create table profiles(id uuid primary key,display_name text);
 create table organization_access_roles(id uuid primary key,organization_id uuid,capabilities text[],deleted_at timestamptz);
 create table organization_members(organization_id uuid,user_id uuid,role member_role,status text,access_role_id uuid);
 grant select on organizations,profiles,organization_members,organization_access_roles to service_role;
 ${readFileSync(new URL('../supabase/migrations/20261011130951_ticketing_v1.sql',import.meta.url),'utf8')}
 insert into organizations values('${org}');insert into profiles values('${user}','TESTFIXTURE');insert into organization_members values('${org}','${user}','admin','active',null);`);
const op=(operation,data)=>`select ticket_bot_operation('${org}','fixture-client','${guild}','${operation}','${JSON.stringify(data)}'::jsonb);`;
const fresh=()=>((BigInt(Date.now()-1420070400000)<<22n)).toString();
const intake=(key,hash='a'.repeat(64))=>op('create',{discord_user_id:actor,parent_channel_id:parent,subject:'TESTFIXTURE',content:'opening',idempotency_key:key,request_hash:hash});
async function overlap(first,second,role,phase,rollback=false){
 const prefix=`set statement_timeout='15s';set lock_timeout='10s';set role ${role};select set_config('request.jwt.claim.sub','${user}',false);begin;`;
 const holder=processSql('',true);let contender;
 try{
  holder.write(prefix+first+'\n\\echo BESC_READY\n');await holder.ready();
  const name=`ticket-${phase}`;contender=processSql(`set application_name='${name}';${prefix}${second}commit;`);
  let waiting=false;const deadline=Date.now()+8000;
  while(Date.now()<deadline){if(await sql(`select count(*) from pg_stat_activity where application_name='${name}' and wait_event_type='Lock'`)==='1'){waiting=true;break;}await pause(50);}
  assert.ok(waiting,'Expected an overlapping blocked session');
  holder.write((rollback?'rollback;':'commit;')+'\n\\q\n');assert.equal((await holder.done).code,0);
  const result=await contender.done;assert.equal(result.code,0,result.err);return result.out;
 }finally{if(holder.child.exitCode===null)holder.child.kill();if(contender?.child.exitCode===null)contender.child.kill();}
}
for(const phase of ['intake-commit','intake-rollback','payload-conflict']){
 const key=fresh(),before=Number(await sql('select count(*) from support_tickets'));
 const output=await overlap(intake(key),intake(key,phase==='payload-conflict'?'b'.repeat(64):'a'.repeat(64)),'service_role',phase,phase==='intake-rollback');
 assert.equal(Number(await sql('select count(*) from support_tickets')),before+1);
 assert.equal(await sql(`select count(*) from support_ticket_messages where ticket_id=(select ticket_id from support_ticket_idempotency where key='${key}')`),'1');
 if(phase==='payload-conflict')assert.match(output,/idempotency_conflict/);
 console.log('PASS',phase);
}
const ticket=await sql('select id from support_tickets order by created_at limit 1');
await sql(`update support_tickets set thread_id='${thread}',link_status='linked' where id='${ticket}';`);
const source=fresh(),ingest=op('ingest',{ticket_id:ticket,discord_user_id:actor,parent_channel_id:parent,thread_id:thread,source_message_id:source,idempotency_key:source,request_hash:'c'.repeat(64),content:'incoming'});
await overlap(ingest,ingest,'service_role','ingest');assert.equal(await sql(`select count(*) from support_ticket_messages where source_message_id='${source}'`),'1');console.log('PASS parallel-ingest');
const version=await sql(`select version from support_tickets where id='${ticket}'`);
const staff=action=>`select ticket_staff_action('${org}','${ticket}',${version},'${action}','${JSON.stringify(action==='internal'?{content:'internal fixture'}:{status:'in_progress'})}'::jsonb);`;
assert.match(await overlap(staff('internal'),staff('status'),'authenticated','staff-version'),/version_conflict/);console.log('PASS staff-version');
await sql(`update support_ticket_deliveries set state='delivered',payload='{}' where ticket_id<>'${ticket}';`);
const output=await overlap(op('claim',{worker_id:'worker_first'}),op('claim',{worker_id:'worker_second'}),'service_role','claim');
assert.match(output,/"deliveries": \[\]/);assert.equal(await sql("select count(*) from support_ticket_deliveries where state='leased'"),'1');console.log('PASS exclusive-claim');
console.log('Passed 6 actual overlapping PostgreSQL session cases');
