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
await sql('create database besc_config_fixture;');env={...process.env,PGDATABASE:'besc_config_fixture'};
const org='10000000-0000-4000-8000-000000000001',user='20000000-0000-4000-8000-000000000001',guild='1067893182387474432',actor='111111111111111111',parent='222222222222222222';
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
const fresh=()=>((BigInt(Date.now()-1420070400000)<<22n)).toString();
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

await sql(`create table auth.identities(user_id uuid,provider text,provider_id text,identity_data jsonb);
${readFileSync(new URL('../supabase/migrations/20261012185859_discord_ticketing_v2.sql',import.meta.url),'utf8')}
${readFileSync(new URL('../supabase/migrations/20261015115523_discord_configuration_revision.sql',import.meta.url),'utf8')}
${readFileSync(new URL('../supabase/migrations/20261016062843_discord_channel_check_contract.sql',import.meta.url),'utf8')}`);
const f=JSON.parse(readFileSync(new URL('../docs/contracts/ticketing-v2.fixtures.json',import.meta.url),'utf8'));
const server='30000000-0000-4000-8000-000000000001',type='30000000-0000-4000-8000-000000000002',revision='30000000-0000-4000-8000-000000000003',panel='30000000-0000-4000-8000-000000000004',panelRevision='30000000-0000-4000-8000-000000000005';
const draft={...f.typeDraft,parentChannelId:parent};
await sql(`insert into discord_bot_servers(id,organization_id,guild_id,application_id,name,intake_active,last_report_at,features,client_id) values('${server}','${org}','${guild}','1558542661265129474','TESTFIXTURE',true,now(),'{typed_intake,ticket_panels,label_modals}','fixture-client');
 insert into discord_ticket_types(id,organization_id,server_id,draft,active) values('${type}','${org}','${server}','${JSON.stringify(draft)}',true);
 insert into discord_ticket_type_revisions(id,organization_id,server_id,type_id,version,payload) values('${revision}','${org}','${server}','${type}',1,'${JSON.stringify(draft)}');
 insert into discord_ticket_panels(id,organization_id,server_id,draft,enabled,message_id,channel_id,published_revision_id) values('${panel}','${org}','${server}','{}',true,'${actor}','${parent}',null);
 insert into discord_ticket_panel_revisions(id,organization_id,server_id,panel_id,version,payload) values('${panelRevision}','${org}','${server}','${panel}',1,'${JSON.stringify({typeRevisionIds:[revision]})}'); update discord_ticket_panels set published_revision_id='${panelRevision}' where id='${panel}';`);
const cfg=(name,data)=>`select discord_bot_operation('${org}','fixture-client','${guild}','${name}','${JSON.stringify(data)}');`;
const staffSave=name=>`select discord_bot_staff_action('${org}','${server}','type_save','${JSON.stringify({id:type,version:1,draft:{...draft,name}})}');`;
assert.match(await overlap(staffSave('TESTFIXTURE first'),staffSave('TESTFIXTURE second'),'authenticated','config-version'),/version_conflict/);
const intent=JSON.parse(await sql(`set role service_role;${cfg('intent',{discord_user_id:actor,type_revision_id:revision,source:'slash',idempotency_key:fresh(),request_hash:'a'.repeat(64)})}`)).intentId;
const key=fresh(),input={discord_user_id:actor,type_revision_id:revision,intake_intent_id:intent,answers:{onderwerp:'TESTFIXTURE',omschrijving:'Private example',omgeving:['discord']},idempotency_key:key,request_hash:'b'.repeat(64)};
const output=await overlap(cfg('intake',input),cfg('intake',input),'service_role','typed-intake');assert.match(output,/ticketId/);assert.equal(await sql('select count(*) from support_tickets'),'1');assert.equal(await sql('select count(*) from support_ticket_deliveries'),'2');
console.log('Two actual overlapping sessions passed: concept version conflict and typed-intake replay without duplicate effects.');

// Independent GETs keep the same persisted revision, even while serialized on
// the server lock; rolled-back changes must never escape into the response.
const beforeRevision=await sql(`select configuration_revision_id from discord_bot_servers where id='${server}'`);
const configResult=output=>JSON.parse(output.trim().split(/\r?\n/).at(-1));
const repeated=configResult(await overlap(cfg('config',{}),cfg('config',{}),'service_role','config-read'));
assert.equal(repeated.configurationRevisionId,beforeRevision);
const rolledBack=configResult(await overlap(`update discord_bot_servers set intake_active=false where id='${server}';`,cfg('config',{}),'service_role','config-rollback',true));
assert.equal(rolledBack.configurationRevisionId,beforeRevision);assert.ok(rolledBack.features.length);
const paused=configResult(await overlap(`update discord_bot_servers set intake_active=false where id='${server}';`,cfg('config',{}),'service_role','config-pause'));
assert.notEqual(paused.configurationRevisionId,beforeRevision);assert.deepEqual(paused.features,[]);assert.deepEqual(paused.panels,[]);assert.deepEqual(paused.typeRevisions,[]);
assert.equal(JSON.parse(await sql(`set role service_role;${cfg('config',{})}`)).configurationRevisionId,paused.configurationRevisionId);
console.log('PASS: stable concurrent config reads, rolled-back revision isolation and committed pause visibility.');
