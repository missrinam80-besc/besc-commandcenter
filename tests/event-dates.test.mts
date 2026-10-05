import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";

const loaded={exports:{} as Record<string,unknown>};
runInNewContext(ts.transpileModule(readFileSync(new URL("../src/lib/format.ts",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:loaded,exports:loaded.exports,Date,Intl});
type Timing={start_date:string|null;end_date:string|null;start_at:string|null;end_at:string|null};
const parse=loaded.exports.eventTimingValues as (input:Partial<Record<string,string>>)=>Timing;
const display=loaded.exports.formatEventEndpoint as (input:Record<string,unknown>,prefix:string)=>string;
const fields=loaded.exports.eventDateFields as (input:Record<string,unknown>,prefix:string)=>{date:string;time:string};

test("Historische datumreeks bewaart onbekende tijden als null, geen middernacht",()=>{
 const v=parse({start_date:"2025-09-05",end_date:"2025-09-07",start_time:"",end_time:""});
 assert.equal(v.start_date,"2025-09-05");assert.equal(v.end_date,"2025-09-07");assert.equal(v.start_at,null);assert.equal(v.end_at,null);
 assert.match(display(v,"start"),/5 sep 2025.*Tijd onbekend/);
});
test("Bekende tijden worden correct omgerekend voor Brussel",()=>{
 const v=parse({start_date:"2025-09-05",start_time:"18:30",end_date:"2025-09-07",end_time:"20:00"});
 assert.equal(v.start_at,"2025-09-05T16:30:00.000Z");assert.equal(v.end_at,"2025-09-07T18:00:00.000Z");
 assert.equal(fields(v,"start").time,"18:30");
 assert.doesNotMatch(display(v,"start"),/onbekend/);
});
test("Start met tijd en einde zonder tijd zijn afzonderlijk bruikbaar",()=>{
 const v=parse({start_date:"2025-09-05",start_time:"18:30",end_date:"2025-09-07",end_time:""});
 assert.ok(v.start_at);assert.equal(v.end_at,null);assert.equal(v.end_date,"2025-09-07");
});
test("Ongewijzigde tijd bewaart secondes en de oorspronkelijke herhaalde wintertijd",()=>{
 const original="2025-10-26T00:30:42Z";
 const v=parse({start_date:"2025-10-26",start_time:"02:30",original_start_at:original});
 assert.equal(v.start_at,"2025-10-26T00:30:42.000Z");
});
test("Expliciete 00:00 is een bekende tijd, niet onbekend",()=>{
 assert.equal(parse({start_date:"2025-09-05",start_time:"00:00"}).start_at,"2025-09-04T22:00:00.000Z");
});
test("Oud gecombineerd formulier blijft leesbaar",()=>{
 const v=parse({start_at:"2025-09-05T18:30",end_at:"2025-09-07T20:00"});
 assert.equal(v.start_date,"2025-09-05");assert.equal(v.start_at,"2025-09-05T16:30:00.000Z");
});
for(const input of [
 {start_date:"2025-02-30"}, {start_time:"10:00"}, {start_date:"2025-09-05",start_time:"25:00"},
 {start_date:"2025-09-07",end_date:"2025-09-05"},
 {start_date:"2025-09-05",end_date:"2025-09-05",start_time:"20:00",end_time:"18:00"},
 {start_date:"2025-03-30",start_time:"02:30"},
]) test("Ongeldige datum, volgorde of niet-bestaande zomertijd wordt geweigerd",()=>assert.throws(()=>parse(input)));

test("Migratie behoudt timestamps en RLS, date-only writes en oude schrijvers werken",async()=>{
 const db=new PGlite();
 try {
  await db.exec("create schema private; create table public.events(id text primary key, organization_id text, status text, deleted_at timestamptz, start_at timestamptz, end_at timestamptz); alter table public.events enable row level security; create policy existing_read on public.events for select using (true); insert into public.events values ('old','org','completed',null,'2025-09-04T22:30:42Z','2025-09-07T18:00:00Z');");
  const before=await db.query("select start_at,end_at from public.events where id='old'");
  const policies=await db.query("select policyname,cmd from pg_policies where tablename='events'");
  await db.exec(readFileSync(new URL("../supabase/migrations/20261005213000_event_dates_without_times.sql",import.meta.url),"utf8"));
  assert.deepEqual((await db.query("select start_at,end_at from public.events where id='old'")).rows,before.rows);
  const date=await db.query<{date:string}>("select start_date::text as date from public.events where id='old'");assert.equal(date.rows[0].date,"2025-09-05");
  await db.exec("insert into public.events(id,organization_id,start_date,end_date) values ('historical','org','2025-09-05','2025-09-07');");
  const historical=await db.query("select start_at,end_at,start_date::text,end_date::text from public.events where id='historical'");
  assert.deepEqual(historical.rows[0],{start_at:null,end_at:null,start_date:"2025-09-05",end_date:"2025-09-07"});
  await db.exec("update public.events set start_at='2025-10-25T22:30:00Z',end_at='2025-10-26T02:30:00Z' where id='old'");
  assert.equal((await db.query<{date:string}>("select start_date::text as date from public.events where id='old'")).rows[0].date,"2025-10-26");
  await assert.rejects(db.exec("update public.events set end_date='2025-09-01' where id='historical'"));
  assert.deepEqual((await db.query("select policyname,cmd from pg_policies where tablename='events'")).rows,policies.rows);
  assert.equal((await db.query<{enabled:boolean}>("select relrowsecurity as enabled from pg_class where oid='public.events'::regclass")).rows[0].enabled,true);
 } finally {await db.close();}
});

for(const scenario of [{linked:false,timed:true},{linked:true,timed:false},{linked:true,timed:true}]) test("Automatische Calendar-sync respecteert bestaande koppeling en bekende tijden",async()=>{
 let calls=0;
 const compiled={exports:{} as Record<string,unknown>};
 const source=readFileSync(new URL("../src/lib/linked-calendar-sync.ts",import.meta.url),"utf8");
 runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:compiled,exports:compiled.exports,require:()=>({syncGoogleCalendarEvent:async()=>{calls++;return {id:"cal",name:"event",webUrl:"https://calendar.google.com/"};}}),Date});
 const supabase={from:(table:string)=>{
  const q:Record<string,unknown>={};for(const key of ["select","eq","is","update","insert"])q[key]=()=>q;
  q.maybeSingle=async()=>({data:table==="events"?{id:"event",status:"completed",start_at:scenario.timed?"2025-09-05T16:30Z":null,end_at:scenario.timed?"2025-09-07T18:00Z":null}:scenario.linked?{id:"link",google_id:"cal"}:null,error:null});
  q.then=(done:(x:unknown)=>unknown)=>Promise.resolve({error:null}).then(done);return q;
 }};
 const sync=compiled.exports.syncLinkedEvent as(context:unknown,id:string)=>Promise<boolean>;
 const result=await sync({supabase,organizationId:"org"},"event");
 assert.equal(calls,scenario.linked&&scenario.timed?1:0);assert.equal(result,scenario.linked&&scenario.timed);
});
