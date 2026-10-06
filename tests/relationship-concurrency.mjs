// Dedicated CI database only. Real independent PostgreSQL sessions; no Cloud credentials.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as pause } from 'node:timers/promises';
if (process.env.PGHOST !== '127.0.0.1' || process.env.PGDATABASE !== 'besc_concurrency_fixture') {
  throw Error('Concurrency test requires the isolated localhost besc_concurrency_fixture database');
}
const org='20000000-0000-4000-8000-000000000001', actor='10000000-0000-4000-8000-000000000001';
const left='30000000-0000-4000-8000-000000000001', right='30000000-0000-4000-8000-000000000002';
const args=['-X','-q','-A','-t','-v','ON_ERROR_STOP=1'];
function processSql(sql,interactive=false){
 const child=spawn('psql',interactive?args:[...args,'-c',sql],{stdio:['pipe','pipe','pipe']});
 let out='',err='';const listeners=[];
 child.stdout.on('data',chunk=>{out+=chunk;for(const notify of listeners)notify(out);});
 child.stderr.on('data',chunk=>{err+=chunk;});
 const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>resolve({code,out,err}));});
 return{child,done,write:text=>child.stdin.write(text),ready:()=>new Promise((resolve,reject)=>{
  if(out.includes('BESC_READY'))return resolve();
  const timer=setTimeout(()=>reject(Error('Holder session did not become ready')),15000);
  listeners.push(text=>{if(text.includes('BESC_READY')){clearTimeout(timer);resolve();}});
  done.then(result=>{if(!result.out.includes('BESC_READY')){clearTimeout(timer);reject(Error(result.err||'Holder ended early'));}},reject);
 })};
}
async function sql(query){const result=await processSql(query).done;assert.equal(result.code,0,result.err);return result.out.trim();}
const migration=readFileSync(new URL('../supabase/migrations/20261006205557_atomic_campaign_and_relationships.sql',import.meta.url),'utf8');
const operations=readFileSync(new URL('../supabase/migrations/20260722100000_add_operational_modules.sql',import.meta.url),'utf8');
const deeper=readFileSync(new URL('../supabase/migrations/20260723100000_deepen_operational_modules.sql',import.meta.url),'utf8');
let setup=`create role authenticated;create role anon;create role service_role;create schema auth;create schema private;
create function auth.uid() returns uuid language sql stable as $$select '${actor}'::uuid$$;
create function private.is_org_manager(o uuid) returns boolean language sql stable as $$select o='${org}'::uuid$$;
create function private.is_active_member(o uuid) returns boolean language sql stable as $$select o='${org}'::uuid$$;
grant usage on schema auth,private to authenticated;
create type public.priority_level as enum('low','normal','high','urgent');
create table organizations(id uuid primary key);create table profiles(id uuid primary key);
insert into organizations values('${org}');insert into profiles values('${actor}');`;
for(const table of ['projects','events','content_items','community_people','tasks'])setup+=`create table public.${table}(id uuid primary key,organization_id uuid,title text,deleted_at timestamptz);`;
setup+=operations.slice(0,operations.indexOf('create table public.community_people'));
setup+=deeper.slice(0,deeper.indexOf('create table public.partner_contacts'));
setup+='create table public.campaign_deliverables ('+deeper.split('create table public.campaign_deliverables (')[1].split('create table public.community_onboarding_items')[0];
setup+=readFileSync(new URL('../supabase/migrations/20260803103432_add_record_links_and_relationships.sql',import.meta.url),'utf8');
for(const table of ['projects','events','campaigns','content_items','partners','community_people','tasks','campaign_deliverables'])setup+=`
alter table public.${table} enable row level security;grant select,insert,update,delete on public.${table} to authenticated;
create policy fixture_read on public.${table} for select to authenticated using(private.is_active_member(organization_id));
create policy fixture_insert on public.${table} for insert to authenticated with check(private.is_org_manager(organization_id));
create policy fixture_update on public.${table} for update to authenticated using(private.is_org_manager(organization_id)) with check(private.is_org_manager(organization_id));`;
setup+=migration;
setup+=`insert into projects values('${left}','${org}','TESTFIXTURE source',null);`;
await sql(setup);
const prefix="set statement_timeout='15s';set lock_timeout='10s';set role authenticated;begin;";
async function waitForAdvisory(name){
 const deadline=Date.now()+8000;
 while(Date.now()<deadline){
  const waiting=await sql(`select count(*) from pg_stat_activity where application_name='${name}' and wait_event_type='Lock' and wait_event='advisory'`);
  if(waiting==='1')return;
  await pause(50);
 }
 throw Error('Contending session did not wait on the shared advisory lock');
}
let count=0;
for(const [type,table] of [['project','projects'],['event','events'],['campaign','campaigns'],['content','content_items'],['partner','partners'],['community_person','community_people'],['task','tasks']]){
 const insert=table==='campaigns'?`insert into campaigns(id,organization_id,title,created_by) values('${right}','${org}','TESTFIXTURE target','${actor}')`:
  table==='partners'?`insert into partners(id,organization_id,name,created_by) values('${right}','${org}','TESTFIXTURE target','${actor}')`:
  `insert into ${table}(id,organization_id,title) values('${right}','${org}','TESTFIXTURE target')`;
 await sql(insert);
 for(const reverse of [false,true])for(const phase of ['delete-first','insert-first','rollback-delete']){
  await sql(`delete from record_relationships;update ${table} set deleted_at=null where id='${right}';`);
  const name=`besc-concurrency-${++count}`;
  const relation=`insert into record_relationships(organization_id,source_type,source_id,target_type,target_id,created_by) values('${org}','${reverse?type:'project'}','${reverse?right:left}','${reverse?'project':type}','${reverse?left:right}','${actor}');`;
  const deletion=`update ${table} set deleted_at=now() where id='${right}';`;
  const holder=processSql('',true);
  let contender;
  try{
   holder.write(prefix+(phase==='insert-first'?relation:deletion)+'\n\\echo BESC_READY\n');
   await holder.ready();
   contender=processSql(`set application_name='${name}';${prefix}${phase==='insert-first'?deletion:relation}commit;`);
   await waitForAdvisory(name);
   holder.write((phase==='rollback-delete'?'rollback;':'commit;')+'\n\\q\n');
   const first=await holder.done;assert.equal(first.code,0,first.err);
   const second=await contender.done;
   if(phase==='delete-first'){
    assert.notEqual(second.code,0);assert.match(second.err,/relationship dossier unavailable/);
    assert.equal(await sql('select count(*) from record_relationships'),'0');
   }else{
    assert.equal(second.code,0,second.err);assert.equal(await sql('select count(*) from record_relationships'),'1');
   }
   assert.equal(await sql(`select deleted_at is not null from ${table} where id='${right}'`),phase==='rollback-delete'?'f':'t');
   assert.equal(await sql("select count(*) from pg_locks where locktype='advisory'"),'0');
   console.log(`PASS ${type} ${reverse?'reversed':'forward'} ${phase}`);
  }finally{
   if(holder.child.exitCode===null)holder.child.kill();
   if(contender?.child.exitCode===null)contender.child.kill();
  }
 }
}
console.log(`Passed ${count} real two-session concurrency cases`);
