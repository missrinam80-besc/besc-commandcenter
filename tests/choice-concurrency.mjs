// Real independent PostgreSQL sessions, isolated CI database; no Cloud credentials.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {setTimeout as pause} from 'node:timers/promises';
import {choiceFixture} from './helpers/choice-fixture.mjs';
if(process.env.PGHOST!=='127.0.0.1'||process.env.PGDATABASE!=='besc_concurrency_fixture')throw Error('Requires isolated localhost besc_concurrency_fixture');
const args=['-X','-q','-A','-t','-v','ON_ERROR_STOP=1'];
let env=process.env;
function processSql(query,interactive=false){
 const child=spawn('psql',interactive?args:[...args,'-c',query],{env,stdio:['pipe','pipe','pipe']});
 let out='',err='';const listeners=[];
 child.stdout.on('data',chunk=>{out+=chunk;for(const notify of listeners)notify(out);});child.stderr.on('data',chunk=>{err+=chunk;});
 const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>resolve({code,out,err}));});
 return {child,done,write:text=>child.stdin.write(text),ready:()=>new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('Holder not ready')),15000);
  const notify=text=>{if(text.includes('BESC_READY')){clearTimeout(timer);resolve();}};listeners.push(notify);notify(out);
  done.then(result=>{if(!result.out.includes('BESC_READY')){clearTimeout(timer);reject(Error(result.err||'Holder ended early'));}},reject);
 })};
}
async function sql(query){const result=await processSql(query).done;assert.equal(result.code,0,result.err);return result.out.trim();}
// New DB avoids interference with the relationship fixture in the same CI service.
await sql('create database besc_choice_fixture;');
env={...process.env,PGDATABASE:'besc_choice_fixture'};
await sql("do $$begin if not exists(select from pg_roles where rolname='authenticated') then create role authenticated;end if;if not exists(select from pg_roles where rolname='anon') then create role anon;end if;end$$;");
const migration=readFileSync(new URL('../supabase/migrations/20261009074806_managed_dossier_choices.sql',import.meta.url),'utf8');
const catalog=JSON.parse(migration.match(/select '(.*)'::jsonb \$\$/)[1].replaceAll("''","'"));
await sql(choiceFixture(catalog)+migration);
await sql(readFileSync(new URL('./dossier-choices.test.sql',import.meta.url),'utf8'));
const org='11111111-1111-4111-8111-111111111111',actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',record='33333333-3333-4333-8333-333333333333';
await sql(`insert into organizations values('${org}');insert into organization_members values('${org}','${actor}','admin','active');`);
const prefix=`set statement_timeout='15s';set lock_timeout='10s';set role authenticated;select set_config('request.jwt.claim.sub','${actor}',false);begin;`;
async function waitForLock(name){
 const deadline=Date.now()+8000;
 while(Date.now()<deadline){if(await sql(`select count(*) from pg_stat_activity where application_name='${name}' and wait_event_type='Lock'`)==='1')return;await pause(50);}
 throw Error('Contender did not wait for the option row lock');
}
let count=0;
for(const c of catalog)for(const phase of ['insert-first','delete-first','rollback-delete']){
 await sql(`${prefix}insert into dossier_choice_options(organization_id,set_key,value,label) values('${org}','${c.key}','test_concurrency','TESTFIXTURE concurrency');commit;`);
 const use=`insert into ${c.table}(id,organization_id,${c.field}) values('${record}','${org}','test_concurrency');`;
 const deletion=`delete from dossier_choice_options where organization_id='${org}' and set_key='${c.key}' and value='test_concurrency';`;
 const name=`besc-choice-${++count}`,holder=processSql('',true);let contender;
 try{
  holder.write(prefix+(phase==='insert-first'?use:deletion)+'\n\\echo BESC_READY\n');await holder.ready();
  contender=processSql(`set application_name='${name}';${prefix}${phase==='insert-first'?deletion:use}commit;`);await waitForLock(name);
  holder.write((phase==='rollback-delete'?'rollback;':'commit;')+'\n\\q\n');const first=await holder.done;assert.equal(first.code,0,first.err);
  const second=await contender.done;
  if(phase==='rollback-delete')assert.equal(second.code,0,second.err);
  else{assert.notEqual(second.code,0);assert.match(second.err,phase==='insert-first'?/choice_in_use/:/choice_unavailable/);}
  assert.equal(await sql(`select count(*) from ${c.table} where id='${record}'`),phase==='delete-first'?'0':'1');
  assert.equal(await sql(`select count(*) from dossier_choice_options where set_key='${c.key}' and value='test_concurrency'`),phase==='delete-first'?'0':'1');
  console.log(`PASS ${c.key} ${phase}`);
 }finally{if(holder.child.exitCode===null)holder.child.kill();if(contender?.child.exitCode===null)contender.child.kill();}
 await sql(`delete from ${c.table} where id='${record}';${prefix}${deletion}commit;`);
}
console.log(`Passed SQL permissions/deletion checks and ${count} real two-session option concurrency cases`);
