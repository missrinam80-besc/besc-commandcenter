// Isolated CI PostgreSQL only. Real overlapping sessions, no Cloud credentials.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {setTimeout as pause} from 'node:timers/promises';
if(process.env.PGHOST!=='127.0.0.1'||process.env.PGDATABASE!=='besc_concurrency_fixture')throw Error('Requires the isolated localhost fixture');
const org='11111111-1111-4111-8111-111111111111',actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',one='33333333-3333-4333-8333-333333333333',two='44444444-4444-4444-8444-444444444444';
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
await sql('create database besc_asset_bulk_fixture;');env={...process.env,PGDATABASE:'besc_asset_bulk_fixture'};
await sql(`create schema auth;create schema private;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function private.is_org_manager(o uuid) returns boolean language sql stable as $$select o='${org}'::uuid and auth.uid()='${actor}'::uuid$$;
 grant usage on schema auth,private to authenticated;
 create table assets(id uuid primary key,organization_id uuid,location text,status text,deleted_at timestamptz,updated_at timestamptz default now());
 alter table assets enable row level security;grant select,update on assets to authenticated;
 create policy fixture_read on assets for select to authenticated using(organization_id='${org}');
 create policy fixture_write on assets for update to authenticated using(private.is_org_manager(organization_id)) with check(private.is_org_manager(organization_id));
 insert into assets(id,organization_id,location,status) values('${one}','${org}','Original','active'),('${two}','${org}','Original','active');
 ${readFileSync(new URL('../supabase/migrations/20261009100412_bulk_asset_actions.sql',import.meta.url),'utf8')}`);
const prefix=`set statement_timeout='15s';set lock_timeout='10s';set role authenticated;select set_config('request.jwt.claim.sub','${actor}',false);begin;`;
const ids=`array['${one}','${two}']::uuid[]`,reverse=`array['${two}','${one}']::uuid[]`;
for(const phase of ['delete-commit','delete-rollback','overlapping-fields']){
 await sql("update assets set location='Original',status='active',deleted_at=null;");
 const holder=processSql('',true);let contender;
 try{
  const first=phase==='overlapping-fields'?`select bulk_asset_action('${org}',${reverse},'update',true,'Store');`:`update assets set deleted_at=now() where id='${two}';`;
  holder.write(prefix+first+'\n\\echo BESC_READY\n');await holder.ready();
  const name=`asset-bulk-${phase}`,next=phase==='overlapping-fields'?`select bulk_asset_action('${org}',${ids},'update',false,null,true,'maintenance');`:`select bulk_asset_action('${org}',${ids},'update',true,'Changed');`;
  contender=processSql(`set application_name='${name}';${prefix}${next}commit;`);
  const deadline=Date.now()+8000;let waiting=false;
  while(Date.now()<deadline){if(await sql(`select count(*) from pg_stat_activity where application_name='${name}' and wait_event_type='Lock'`)==='1'){waiting=true;break;}await pause(50);}assert.ok(waiting,'Contender did not wait on selected rows');
  holder.write((phase==='delete-rollback'?'rollback;':'commit;')+'\n\\q\n');assert.equal((await holder.done).code,0);
  const result=await contender.done;
  if(phase==='delete-commit'){
   assert.notEqual(result.code,0);assert.match(result.err,/asset_selection_unavailable/);
   assert.equal(await sql("select count(*) from assets where location='Original'"),'2');
  }else{
   assert.equal(result.code,0,result.err);
   const condition=phase==='overlapping-fields'?"location='Store' and status='maintenance'":"location='Changed' and status='active'";
   assert.equal(await sql(`select count(*) from assets where ${condition} and deleted_at is null`),'2');
  }
  console.log(`PASS atomic asset bulk ${phase}`);
 }finally{if(holder.child.exitCode===null)holder.child.kill();if(contender?.child.exitCode===null)contender.child.kill();}
}
console.log('Passed 3 real two-session atomic asset bulk cases');
