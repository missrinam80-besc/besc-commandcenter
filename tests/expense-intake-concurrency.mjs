// Isolated CI PostgreSQL only. Real overlapping sessions, no Cloud credentials.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {setTimeout as pause} from 'node:timers/promises';
if(process.env.PGHOST!=='127.0.0.1'||process.env.PGDATABASE!=='besc_concurrency_fixture')throw Error('Requires the isolated localhost fixture');
const org='10000000-0000-4000-8000-000000000001',user='20000000-0000-4000-8000-000000000001',admin='20000000-0000-4000-8000-000000000002',id='30000000-0000-4000-8000-000000000001';
let env=process.env;const args=['-X','-q','-A','-t','-v','ON_ERROR_STOP=1'];
function processSql(query,interactive=false){
 const child=spawn('psql',interactive?args:[...args,'-c',query],{env,stdio:['pipe','pipe','pipe']});let out='',err='';const listeners=[];
 child.stdout.on('data',chunk=>{out+=chunk;for(const notify of listeners)notify(out);});child.stderr.on('data',chunk=>{err+=chunk;});
 const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>resolve({code,out,err}));});
 return {child,done,write:text=>child.stdin.write(text),ready:()=>new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('Holder not ready')),15000),notify=text=>{if(text.includes('BESC_READY')){clearTimeout(timer);resolve();}};listeners.push(notify);notify(out);
  done.then(result=>{if(!result.out.includes('BESC_READY')){clearTimeout(timer);reject(Error(result.err||'Holder ended early'));}},reject);
 })};
}
async function sql(query){const result=await processSql(query).done;assert.equal(result.code,0,result.err);return result.out.trim();}

await sql('create database besc_expense_intake_fixture;');env={...process.env,PGDATABASE:'besc_expense_intake_fixture'};
const fixture=readFileSync(new URL('./helpers/expense-intake-fixture.sql',import.meta.url),'utf8').replace('create role authenticated;create role anon;',`do $$begin if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated;end if;if not exists(select 1 from pg_roles where rolname='anon') then create role anon;end if;end$$;`);
await sql(fixture+readFileSync(new URL('../supabase/migrations/20261014120609_expense_inbox_intake.sql',import.meta.url),'utf8'));
const payload={title:'TESTFIXTURE kost',amount:10,expense_date:'2026-10-14',supplier:'TESTFIXTURE',invoice_number:'BON',claimant_name:'TESTFIXTURE',notes:'TESTFIXTURE',event_id:'',proof:null};
async function overlap(first,second,actor,phase){
 const prefix=`set statement_timeout='15s';set lock_timeout='10s';set role authenticated;select set_config('request.jwt.claim.sub','${actor}',false);begin;`;
 const holder=processSql('',true);let contender;
 try{
  holder.write(prefix+first+'\n\\echo BESC_READY\n');await holder.ready();
  const name=`expense-intake-${phase}`;contender=processSql(`set application_name='${name}';${prefix}${second}commit;`);
  const deadline=Date.now()+8000;let waiting=false;
  while(Date.now()<deadline){if(await sql(`select count(*) from pg_stat_activity where application_name='${name}' and wait_event_type='Lock'`)==='1'){waiting=true;break;}await pause(50);}assert.ok(waiting,'Expected a real blocked contender');
  holder.write('commit;\n\\q\n');assert.equal((await holder.done).code,0);
  const result=await contender.done;assert.equal(result.code,0,result.err);
  console.log(`PASS expense intake ${phase}`);
 }finally{if(holder.child.exitCode===null)holder.child.kill();if(contender?.child.exitCode===null)contender.child.kill();}
}
const prepare=`select prepare_expense_intake('${org}','${id}','${JSON.stringify(payload)}');`,finish=`select finish_expense_intake('${org}','${id}');`,convert=`select convert_expense_intake('${org}','${id}');`;
await overlap(prepare,prepare,user,'prepare');assert.equal(await sql('select count(*) from expense_intakes'),'1');
await overlap(finish,finish,user,'submit');assert.equal(await sql('select count(*) from inbox_items'),'1');
await overlap(convert,convert,admin,'convert');assert.equal(await sql('select count(*) from expenses'),'1');
const proofId='30000000-0000-4000-8000-000000000002',path=`${org}/${user}/${proofId}/proof.png`;
const proof={path,label:'TESTFIXTURE.png',mime:'image/png',size:16,sha256:'a'.repeat(64)};
await sql(`set role authenticated;select set_config('request.jwt.claim.sub','${user}',false);select prepare_expense_intake('${org}','${proofId}','${JSON.stringify({...payload,proof})}');insert into storage.objects(bucket_id,name,metadata) values('expense-proofs','${path}','{"size":16,"mimetype":"image/png"}');`);
await overlap(`select finish_expense_intake('${org}','${proofId}');`,`delete from storage.objects where name='${path}';`,user,'proof-delete-race');
assert.equal(await sql(`select count(*) from storage.objects where name='${path}'`),'1');
console.log('Passed 4 real overlapping expense-intake session cases.');
