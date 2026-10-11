import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { hasPermission } from "../src/lib/permissions.ts";

const org="10000000-0000-4000-8000-000000000001",other="10000000-0000-4000-8000-000000000002";
const guild="1067893182387474432",actor="111111111111111111",parent="222222222222222222",thread="333333333333333333";
const uid=(n:number)=>`20000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const snow=()=>((BigInt(Date.now()-1420070400000)<<BigInt(22))).toString();
type DbResult={ticketId:string;error?:string;version:number;messageId:string;recorded:boolean;deliveries:{id:string;kind:string;payload:{content?:string};threadId:string|null;ticketMarker:string;ticketStatus:string;leaseToken:string;reconcile:boolean;allowedMentions:{parse:string[]}}[]};
async function setup(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create schema private;grant usage on schema private,auth to authenticated,service_role;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create type member_role as enum ('admin','board','member','volunteer');
 create table organizations(id uuid primary key);
 create table profiles(id uuid primary key,display_name text);
 create table organization_access_roles(id uuid primary key,organization_id uuid,capabilities text[],deleted_at timestamptz);
 create table organization_members(organization_id uuid,user_id uuid,role member_role,status text,access_role_id uuid);
 grant select on organizations,profiles,organization_members,organization_access_roles to service_role;`);
 await db.exec(readFileSync(new URL("../supabase/migrations/20261011130951_ticketing_v1.sql",import.meta.url),"utf8"));
 await db.query("insert into organizations values($1),($2)",[org,other]);
 for(let n=1;n<=9;n++)await db.query("insert into profiles values($1,$2)",[uid(n),`TESTFIXTURE ${n}`]);
 const cases=[{n:1,role:"admin",ok:true},{n:2,role:"board",ok:true},{n:3,role:"member",ok:false},{n:4,role:"volunteer",ok:false},
 {n:5,role:"volunteer",ok:true,cap:true},{n:6,role:"member",ok:false,cap:true,deleted:true},{n:7,role:"volunteer",ok:false,cap:true,foreign:true},{n:8,role:"board",ok:false,pending:true}];
 for(const c of cases){
  if(c.cap)await db.query("insert into organization_access_roles values($1,$2,'{manageTickets}',$3)",[uid(100+c.n),c.foreign?other:org,c.deleted?"2026-10-11":null]);
  await db.query("insert into organization_members values($1,$2,$3,$4,$5)",[org,uid(c.n),c.role,c.pending?"pending":"active",c.cap?uid(100+c.n):null]);
 }
 await db.query("insert into organization_members values($1,$2,'admin','active',null)",[other,uid(9)]);
 const op=async(operation:string,data:Record<string,unknown>,o=org,c="fixture-client",g=guild)=>{
  await db.exec("reset role;set role service_role");
  const r=await db.query<{result:DbResult}>("select ticket_bot_operation($1,$2,$3,$4,$5) result",[o,c,g,operation,JSON.stringify(data)]);
  await db.exec("reset role");return r.rows[0].result;
 };
 const create=(patch:Record<string,unknown>={})=>op("create",{discord_user_id:actor,parent_channel_id:parent,subject:"TESTFIXTURE — NIET PUBLICEREN",content:"opening",idempotency_key:snow(),request_hash:"a".repeat(64),...patch});
 const login=async(n:number)=>{await db.exec("reset role;set role authenticated");await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid(n)]);};
 const staff=async(ticket:string,version:number,action:string,data:Record<string,unknown>={})=>(await db.query<{result:DbResult}>("select ticket_staff_action($1,$2,$3,$4,$5) result",[org,ticket,version,action,JSON.stringify(data)])).rows[0].result;
 return{db,op,create,login,staff,cases};
}

test("Real SQL: durable intake, atomic effects, own access, RLS and live shared staff rights",async()=>{
 const f=await setup();const{db,op,create,login,staff}=f;
 try{
  const key=snow();const a=await create({idempotency_key:key});const b=await create({idempotency_key:key});assert.deepEqual(a,b);
  assert.equal((await db.query("select * from support_tickets")).rows.length,1);
  assert.equal((await db.query("select * from support_ticket_messages")).rows.length,1);
  assert.equal((await db.query("select * from support_ticket_deliveries")).rows.length,2);
  assert.equal((await create({idempotency_key:key,request_hash:"b".repeat(64)})).error,"idempotency_conflict");
  assert.equal((await create({idempotency_key:key,discord_user_id:parent})).error,"idempotency_conflict");
  assert.equal((await create({idempotency_key:"111111111111111111"})).error,"interaction_expired");
  const own={ticket_id:a.ticketId,discord_user_id:actor};
  assert.equal((await op("own",own)).ticketId,a.ticketId);
  assert.equal((await op("own",{...own,discord_user_id:parent})).error,"ticket_unavailable");
  assert.equal((await op("own",own,other)).error,"ticket_unavailable");
  assert.equal((await op("own",own,org,"other-client")).error,"ticket_unavailable");
  assert.equal((await op("own",own,org,"fixture-client",parent)).error,"ticket_unavailable");
  for(const c of f.cases){
   await login(c.n);
   assert.equal((await db.query<{ok:boolean}>("select private.can_manage_tickets($1) ok",[org])).rows[0].ok,c.ok);
   assert.equal(hasPermission({role:c.role,finance_role:"none",capabilities:c.cap&&!c.deleted&&!c.foreign?["manageTickets"]:[]},"manageTickets")&&!c.pending,c.ok);
   assert.equal((await db.query("select * from support_tickets")).rows.length,c.ok?1:0);
   for(const table of ["support_ticket_messages","support_ticket_audit","support_ticket_deliveries"])assert.equal((await db.query(`select * from ${table}`)).rows.length>0,c.ok);
   for(const table of ["support_ticket_idempotency","support_ticket_rate_limits"])await assert.rejects(db.query(`select * from ${table}`));
   await assert.rejects(db.query("select private.ticket_staff($1,$2)",[org,uid(1)]));
   await assert.rejects(db.query("update support_tickets set subject='bypass'"));
   await assert.rejects(db.query("select ticket_bot_operation($1,'x',$2,'claim','{}')",[org,guild]));
   if(c.ok)assert.ok(Array.isArray((await db.query<{c:unknown}>("select ticket_staff_candidates($1) c",[org])).rows[0].c));
   else await assert.rejects(staff(String(a.ticketId),1,"internal",{content:"forbidden"}));
  }
  await login(9);assert.equal((await db.query("select * from support_tickets")).rows.length,0);await assert.rejects(staff(String(a.ticketId),1,"internal",{content:"foreign"}));
  await login(1);assert.equal((await staff(String(a.ticketId),1,"assign",{assigned_to:uid(3)})).error,"assignee_forbidden");
  assert.equal((await staff(String(a.ticketId),1,"internal",{content:"INTERNAL SECRET"})).version,2);
  assert.equal((await staff(String(a.ticketId),1,"status",{status:"in_progress"})).error,"version_conflict");
  assert.equal(JSON.stringify(await op("own",own)).includes("INTERNAL SECRET"),false);
  await db.exec("reset role");await db.query("update organization_access_roles set deleted_at=now() where id=$1",[uid(105)]);
  await login(5);await assert.rejects(staff(String(a.ticketId),2,"internal",{content:"revoked"}));
  await db.exec("reset role;set role anon");
  for(const table of ["support_tickets","support_ticket_messages","support_ticket_audit","support_ticket_deliveries","support_ticket_idempotency","support_ticket_rate_limits"])await assert.rejects(db.query(`select * from ${table}`));
  await assert.rejects(db.query("select ticket_staff_candidates($1)",[org]));
  await db.exec("reset role");
  assert.equal((await db.query("select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('ticket_bot_operation','ticket_staff_action','ticket_staff_candidates','ticket_retry_cleanup','purge_support_tickets') and p.prosecdef")).rows.length,0);
 }finally{await db.close();}
});

test("Real SQL: leases, uncertain recovery, ordered messages, staff replies, closure and retention",async()=>{
 const f=await setup();const{db,op,create,login,staff}=f;
 try{
  const a=await create(),ticket=String(a.ticketId),worker="worker_123";
  let claim=await op("claim",{worker_id:worker});assert.equal(claim.deliveries.length,1);let d=claim.deliveries[0];assert.equal(d.kind,"create_thread");
  assert.equal((await op("claim",{worker_id:"other_123"})).deliveries.length,0);
  assert.equal((await op("complete",{delivery_id:d.id,worker_id:worker,lease_token:uid(900),thread_id:thread})).error,"lease_conflict");
  await db.query("update support_ticket_deliveries set leased_until=now()-interval '1 second' where id=$1",[d.id]);
  claim=await op("claim",{worker_id:worker});d=claim.deliveries[0];assert.equal(d.reconcile,true);
  const finish={delivery_id:d.id,worker_id:worker,lease_token:d.leaseToken,thread_id:thread,parent_channel_id:parent,requester_discord_id:actor,requester_added:true,invitable:false};
  assert.equal((await op("complete",{...finish,requester_added:false})).error,"invalid_delivery_result");
  assert.equal((await op("complete",finish)).recorded,true);
  claim=await op("claim",{worker_id:worker});d=claim.deliveries[0];assert.equal(d.kind,"send_message");assert.equal(d.threadId,thread);assert.deepEqual(d.allowedMentions,{parse:[]});
  assert.equal((await op("complete",{delivery_id:d.id,worker_id:worker,lease_token:d.leaseToken,thread_id:thread})).error,"invalid_delivery_result");
  await op("complete",{delivery_id:d.id,worker_id:worker,lease_token:d.leaseToken,thread_id:thread,message_id:parent});
  await login(1);assert.equal((await staff(ticket,1,"reply",{content:"EXTERNAL ANSWER"})).version,2);
  await db.exec("reset role");assert.equal((await db.query("select d.id from support_ticket_deliveries d join support_ticket_messages m on m.id=d.message_id where m.content='EXTERNAL ANSWER' and d.state='pending'")).rows.length,1);
  await login(1);
  assert.equal((await staff(ticket,2,"status",{status:"waiting_requester"})).version,3);
  const source=snow();const incoming={ticket_id:ticket,discord_user_id:actor,parent_channel_id:parent,thread_id:thread,source_message_id:source,idempotency_key:source,request_hash:"c".repeat(64),content:"reply from requester"};
  assert.equal((await op("ingest",{...incoming,thread_id:parent})).error,"thread_not_allowed");
  const ingested=await op("ingest",incoming);assert.ok(ingested.messageId);assert.deepEqual(await op("ingest",incoming),ingested);
  assert.equal((await db.query<{status:string}>("select status from support_tickets where id=$1",[ticket])).rows[0].status,"in_progress");
  await login(1);assert.equal((await staff(ticket,4,"status",{status:"closed"})).version,5);
  assert.equal((await op("ingest",{...incoming,source_message_id:parent,idempotency_key:parent})).error,"ticket_closed");
  claim=await op("claim",{worker_id:worker});d=claim.deliveries[0];assert.equal(d.kind,"send_message");assert.equal(d.payload.content,"EXTERNAL ANSWER");
  await op("fail",{delivery_id:d.id,worker_id:worker,lease_token:d.leaseToken,error_code:"outcome_unknown",uncertain:true});
  await db.query("update support_ticket_deliveries set next_attempt_at=now()-interval '1 second' where id=$1",[d.id]);
  d=(await op("claim",{worker_id:worker})).deliveries[0];assert.equal(d.reconcile,true);
  await op("complete",{delivery_id:d.id,worker_id:worker,lease_token:d.leaseToken,thread_id:thread,message_id:actor});
  d=(await op("claim",{worker_id:worker})).deliveries[0];assert.equal(d.kind,"close_thread");
  await op("complete",{delivery_id:d.id,worker_id:worker,lease_token:d.leaseToken,thread_id:thread});
  await db.query("update support_tickets set closed_at=now()-interval '181 days' where id=$1",[ticket]);
  await db.exec("set role service_role");assert.equal((await db.query<{n:number}>("select purge_support_tickets() n")).rows[0].n,1);await db.exec("reset role");
  for(const table of ["support_tickets","support_ticket_messages","support_ticket_audit"])assert.equal((await db.query(`select * from ${table}`)).rows.length,0);
  const retained=JSON.stringify((await db.query("select * from support_ticket_idempotency")).rows);assert.equal(retained.includes("opening"),false);assert.equal(retained.includes(actor),false);
  d=(await op("claim",{worker_id:worker})).deliveries[0];assert.equal(d.kind,"delete_thread");assert.equal(d.threadId,thread);assert.deepEqual(d.payload,{});
  await op("fail",{delivery_id:d.id,worker_id:worker,lease_token:d.leaseToken,error_code:"permission_denied",uncertain:true});
  await login(1);assert.equal((await db.query<{ok:boolean}>("select ticket_retry_cleanup($1) ok",[d.id])).rows[0].ok,true);
  d=(await op("claim",{worker_id:worker})).deliveries[0];await op("complete",{delivery_id:d.id,worker_id:worker,lease_token:d.leaseToken,thread_id:thread});
  await db.exec("set role service_role");await db.query("select purge_support_tickets()");await db.exec("reset role");assert.equal((await db.query("select * from support_ticket_deliveries")).rows.length,0);
 }finally{await db.close();}
});
test("Real SQL: failed coupling can close, no fresh thread for closed ticket, marker-only cleanup",async()=>{
 const f=await setup();const{db,op,create,login,staff}=f;
 try{
  const a=await create(),ticket=String(a.ticketId);
  await db.query("update support_tickets set link_status='failed' where id=$1",[ticket]);
  await login(1);assert.equal((await staff(ticket,1,"status",{status:"closed"})).version,2);
  let d=(await op("claim",{worker_id:"worker_123"})).deliveries[0];assert.equal(d.ticketStatus,"closed");
  assert.equal((await op("complete",{delivery_id:d.id,worker_id:"worker_123",lease_token:d.leaseToken,thread_absent:true})).recorded,true);
  d=(await op("claim",{worker_id:"worker_123"})).deliveries[0];assert.equal(d.kind,"close_thread");
  await op("complete",{delivery_id:d.id,worker_id:"worker_123",lease_token:d.leaseToken,thread_absent:true});
  await db.query("update support_tickets set closed_at=now()-interval '179 days' where id=$1",[ticket]);
  await db.exec("set role service_role");assert.equal((await db.query<{n:number}>("select purge_support_tickets() n")).rows[0].n,0);await db.exec("reset role");
  await db.query("update support_tickets set closed_at=now()-interval '180 days' where id=$1",[ticket]);
  await db.exec("set role service_role");assert.equal((await db.query<{n:number}>("select purge_support_tickets() n")).rows[0].n,1);await db.exec("reset role");
  d=(await op("claim",{worker_id:"worker_123"})).deliveries[0];assert.equal(d.threadId,null);assert.equal(d.ticketMarker,`besc-ticket-${ticket}`);assert.deepEqual(d.payload,{});
  assert.equal((await op("complete",{delivery_id:d.id,worker_id:"worker_123",lease_token:d.leaseToken,thread_absent:true})).recorded,true);
 }finally{await db.close();}
});
