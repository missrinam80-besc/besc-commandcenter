// Isolated CI PostgreSQL only. Real overlapping sessions, no Cloud credentials.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {setTimeout as pause} from 'node:timers/promises';
if(process.env.PGHOST!=='127.0.0.1'||process.env.PGDATABASE!=='besc_concurrency_fixture')throw Error('Requires the isolated localhost fixture');
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


await sql('create database besc_event_slot_fixture;');env={...process.env,PGDATABASE:'besc_event_slot_fixture'};
let fixture=readFileSync(new URL('./helpers/event-slot-fixture.sql',import.meta.url),'utf8');
for(const [role,suffix]of [['authenticated',''],['anon',''],['service_role',' bypassrls']])fixture=fixture.replace(`create role ${role}${suffix};`,()=>`do $$begin if not exists(select 1 from pg_roles where rolname='${role}') then create role ${role}${suffix};end if;end$$;`);
await sql(fixture+readFileSync(new URL('../supabase/migrations/20261007205415_event_schedule.sql',import.meta.url),'utf8')+readFileSync(new URL('../supabase/migrations/20261014213254_event_slot_bookings.sql',import.meta.url),'utf8'));
const event='30000000-0000-4000-8000-000000000001',slot='40000000-0000-4000-8000-000000000001',b1='50000000-0000-4000-8000-000000000001',b2='50000000-0000-4000-8000-000000000002',b3='50000000-0000-4000-8000-000000000003';
// Fixture owner differs from the generic helper IDs above.
const orgId='10000000-0000-4000-8000-000000000001',ownerId='20000000-0000-4000-8000-000000000001',newOwner='20000000-0000-4000-8000-000000000002';
const ownerPrefix=`set role authenticated;set request.jwt.claim.sub='${ownerId}';`,servicePrefix="set role service_role;set request.jwt.claim.sub='';";
const literal=value=>JSON.stringify(value).replaceAll("'","''");
const ownerCall=(op,d)=>`select event_slot_owner('${orgId}','${event}','${op}','${literal(d)}');`;
const definition={id:'',title:'TESTFIXTURE shift',kind:'shift',starts_at:'2099-10-14T08:00Z',ends_at:'2099-10-14T10:00Z',capacity:1,is_open:true};
await sql(ownerPrefix+ownerCall('save_slot',definition));await sql(`update event_time_slots set id='${slot}'`);
await sql(ownerPrefix+ownerCall('page',{published:true}));const page=await sql(`select public_id from event_slot_pages`);
const publicCall=(op,d)=>`select event_slot_public('${page}','${op}','${literal(d)}');`;
const request=(id,email)=>({id,slot_id:slot,name:'TESTFIXTURE persoon',email,hash:'a'.repeat(64),ip_hash:'b'.repeat(64),verification_url:'https://example.invalid/#code=fixture'});
for(const [id,email]of [[b1,'one@example.com'],[b2,'two@example.com']])await sql(servicePrefix+publicCall('request',request(id,email)));
async function overlap(first,second,firstRole,secondRole,label,error){
 const holder=processSql('',true);let contender;
 try{holder.write(`set statement_timeout='15s';set lock_timeout='10s';${firstRole}begin;${first}\n\\echo BESC_READY\n`);await holder.ready();
 const name=`slot-race-${label}`;contender=processSql(`set application_name='${name}';set statement_timeout='15s';set lock_timeout='10s';${secondRole}begin;${second}commit;`);
 let waiting=false;const deadline=Date.now()+8000;while(Date.now()<deadline){if(await sql(`select count(*) from pg_stat_activity where application_name='${name}' and wait_event_type='Lock'`)==='1'){waiting=true;break;}await pause(50);}assert.ok(waiting,'Expected a genuinely blocked booking operation');
 holder.write('commit;\n\\q\n');assert.equal((await holder.done).code,0);const r=await contender.done;if(error){assert.notEqual(r.code,0);assert.match(r.err,error);}else assert.equal(r.code,0,r.err);console.log(`PASS slot race ${label}`);
 }finally{if(holder.child.exitCode===null)holder.child.kill();if(contender?.child.exitCode===null)contender.child.kill();}
}
const verify=id=>publicCall('verify',{id,hash:'a'.repeat(64)});
await overlap(verify(b1),verify(b2),servicePrefix,servicePrefix,'last-place',/slot_full/);
assert.equal(await sql("select count(*) from event_slot_bookings where status='pending'"),'1');
await overlap(verify(b1),verify(b1),servicePrefix,servicePrefix,'same-request');
assert.equal(await sql('select count(*) from event_schedule_items'),'1');
await overlap(ownerCall('decide',{id:b1,slot_id:slot,status:'rejected'}),verify(b2),ownerPrefix,servicePrefix,'release-and-book');
assert.equal(await sql("select count(*) from event_slot_bookings where status='pending'"),'1');
await sql(ownerPrefix+ownerCall('save_slot',{...definition,id:slot,capacity:2}));await sql(servicePrefix+publicCall('request',request(b3,'three@example.com')));
await overlap(ownerCall('save_slot',{...definition,id:slot,capacity:1}),verify(b3),ownerPrefix,servicePrefix,'capacity-change',/slot_full/);
await overlap(`update events set owner_id='${newOwner}' where id='${event}';`,ownerCall('decide',{id:b2,slot_id:slot,status:'confirmed'}),'',ownerPrefix,'owner-changed',/slot_owner_required/);
console.log('Passed 5 real overlapping event-slot session cases.');
