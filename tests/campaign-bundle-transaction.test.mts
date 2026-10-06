import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
const actor="10000000-0000-4000-8000-000000000001",org="20000000-0000-4000-8000-000000000001",other="20000000-0000-4000-8000-000000000002";
const project="30000000-0000-4000-8000-000000000001",event="30000000-0000-4000-8000-000000000002",partner="30000000-0000-4000-8000-000000000003";
const source=(name:string)=>readFileSync(new URL(`../supabase/migrations/${name}`,import.meta.url),"utf8");
const migration=source("20261006205557_atomic_campaign_and_relationships.sql");
test("Campaign bundle is atomic, uses existing RLS and guards both relation endpoints",async()=>{
 const db=new PGlite();try{
 await db.exec(`create role authenticated;create role anon;create role service_role;create schema auth;create schema private;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table public.organizations(id uuid primary key);create table public.profiles(id uuid primary key);
 create type public.priority_level as enum('low','normal','high','urgent');
 insert into public.organizations values('${org}'),('${other}');insert into public.profiles values('${actor}');
 create function private.is_active_member(o uuid) returns boolean language sql stable as $$select o='${org}'::uuid and auth.uid()='${actor}'::uuid$$;
 create function private.is_org_manager(o uuid) returns boolean language sql stable as $$select private.is_active_member(o) and coalesce(current_setting('fixture.manager',true),'true')<>'false'$$;
 grant usage on schema auth,private to authenticated;`);
 for(const table of ['projects','events','content_items','community_people','tasks'])await db.exec(`create table public.${table}(id uuid primary key default gen_random_uuid(),organization_id uuid,title text,deleted_at timestamptz);`);
 const operational=source("20260722100000_add_operational_modules.sql");
 await db.exec(operational.slice(0,operational.indexOf('create table public.community_people')));
 const deeper=source("20260723100000_deepen_operational_modules.sql");
 await db.exec(deeper.slice(0,deeper.indexOf('create table public.partner_contacts')));
 await db.exec('create table public.campaign_deliverables ('+deeper.split('create table public.campaign_deliverables (')[1].split('create table public.community_onboarding_items')[0]);
 await db.exec(source("20260803103432_add_record_links_and_relationships.sql"));
 for(const table of ['projects','events','campaigns','content_items','partners','community_people','tasks','campaign_deliverables']){
  await db.exec(`alter table public.${table} enable row level security;grant select,insert,update,delete on public.${table} to authenticated;
  create policy fixture_read on public.${table} for select to authenticated using(private.is_active_member(organization_id));
  create policy fixture_insert on public.${table} for insert to authenticated with check(private.is_org_manager(organization_id));
  create policy fixture_update on public.${table} for update to authenticated using(private.is_org_manager(organization_id)) with check(private.is_org_manager(organization_id));`);
 }
 await db.exec(`insert into projects(id,organization_id,title) values('${project}','${org}','TESTFIXTURE project');
 insert into events(id,organization_id,title) values('${event}','${org}','TESTFIXTURE event');
 insert into partners(id,organization_id,name,created_by) values('${partner}','${org}','TESTFIXTURE partner','${actor}');`);
 const policies=(await db.query('select * from pg_policy order by oid')).rows;
 await db.exec(migration);
 assert.deepEqual((await db.query('select * from pg_policy order by oid')).rows,policies);
 await db.exec(`set role authenticated;set request.jwt.claim.sub='${actor}';`);
 const save=(values:Record<string,unknown>={title:'TESTFIXTURE campaign',project_id:project,event_id:event,partner_id:partner},deliverables:(string|null)[]=['Copy','Visuals'])=>db.query<{id:string}>('select public.create_campaign_bundle($1,$2::jsonb,$3::text[]) id',[org,JSON.stringify(values),deliverables]);
 const snapshot=async()=> (await db.query('select (select jsonb_agg(c order by id) from campaigns c) campaigns,(select jsonb_agg(d order by id) from campaign_deliverables d) deliverables,(select jsonb_agg(r order by id) from record_relationships r) relationships')).rows;
 const created=(await save()).rows[0].id;
 const record=(await db.query<{budget:number|null;value:number|null;owner_id:string;created_by:string;channels:string[]}>(`select budget,value,owner_id,created_by,channels from campaigns where id=$1`,[created])).rows[0];
 assert.equal(record.budget,null);assert.equal(record.value,null);assert.equal(record.owner_id,actor);assert.equal(record.created_by,actor);assert.deepEqual(record.channels,[]);
 assert.equal((await db.query('select * from campaign_deliverables')).rows.length,2);
 assert.equal((await db.query('select * from record_relationships')).rows.length,3);
 await save({title:'TESTFIXTURE without template',budget:0,value:15,channels:['Discord'],notes:'Custom briefing',results_summary:'Custom evaluation'},[]);
 for(const [values,titles] of [
  [{title:'x'},[]],[{title:'TESTFIXTURE',organization_id:other},[]],[{title:'TESTFIXTURE',owner_id:actor},[]],
  [{title:'TESTFIXTURE',budget:-1},[]],[{title:'TESTFIXTURE',project_id:'30000000-0000-4000-8000-000000000099'},[]],
  [{title:'TESTFIXTURE'},['x']],[{title:'TESTFIXTURE'},[null]],
 ] as [Record<string,unknown>,(string|null)[]][]){const before=await snapshot();await assert.rejects(save(values,titles));assert.deepEqual(await snapshot(),before);}
 await db.exec(`reset role;create function public.fixture_fail() returns trigger language plpgsql as $$begin raise exception 'fixture failure';end$$;
 create function public.fixture_skip() returns trigger language plpgsql as $$begin return null;end$$;set role authenticated;`);
 for(const table of ['campaigns','campaign_deliverables','record_relationships'])for(const fn of ['fixture_fail','fixture_skip']){
  await db.exec(`reset role;create trigger zz_fixture before insert on public.${table} for each row execute function public.${fn}();set role authenticated;`);
  const before=await snapshot();await assert.rejects(save());assert.deepEqual(await snapshot(),before);
  await db.exec(`reset role;drop trigger zz_fixture on public.${table};set role authenticated;`);
 }
 // Select access to context dossiers remains sufficient; no UPDATE policy is needed to link them.
 await db.exec(`reset role;alter policy fixture_update on events using(false);set role authenticated;`);
 await save();
 await db.exec(`reset role;alter policy "managers create record relationships" on record_relationships with check(false);set role authenticated;`);
 let before=await snapshot();await assert.rejects(save());assert.deepEqual(await snapshot(),before);
 await db.exec(`reset role;alter policy "managers create record relationships" on record_relationships with check(created_by=auth.uid() and private.is_org_manager(organization_id));
 update events set deleted_at=now() where id='${event}';set role authenticated;`);
 before=await snapshot();await assert.rejects(save());assert.deepEqual(await snapshot(),before);
 await db.exec(`reset role;update events set deleted_at=null,organization_id='${other}' where id='${event}';set role authenticated;`);
 before=await snapshot();await assert.rejects(save());assert.deepEqual(await snapshot(),before);
 await db.exec(`set fixture.manager='false';`);await assert.rejects(save({title:'TESTFIXTURE denied'},[]));
 await db.exec(`reset role;set fixture.manager='true';`);
 assert.equal((await db.query<{safe:boolean}>("select not prosecdef and has_function_privilege('authenticated',oid,'EXECUTE') and not has_function_privilege('anon',oid,'EXECUTE') as safe from pg_proc where proname='create_campaign_bundle'")).rows[0].safe,true);
 // Every UI dossier kind is protected for both INSERT and endpoint-changing UPDATE.
 for(const [type,table] of [['project','projects'],['event','events'],['campaign','campaigns'],['content','content_items'],['partner','partners'],['community_person','community_people'],['task','tasks']]){
  const target=(await db.query<{id:string}>(`select id from ${table} where organization_id=$1 and deleted_at is null and id<>$2 limit 1`,[org,created])).rows[0]?.id??(await db.query<{id:string}>(`insert into ${table}(organization_id,title) values($1,'TESTFIXTURE target') returning id`,[org])).rows[0].id;
  await db.exec('set role authenticated');
  const link=()=>db.query<{id:string}>('insert into record_relationships(organization_id,source_type,source_id,target_type,target_id,relationship_type,created_by) values($1,$2,$3,$4,$5,$6,$7) returning id',[org,'campaign',created,type,target,'fixture-'+type,actor]);
  const linked=(await link()).rows[0].id;
  await db.exec('reset role');await db.query(`update ${table} set deleted_at=now() where id=$1`,[target]);await db.exec('set role authenticated');
  await assert.rejects(link(),/dossier unavailable/);
  await assert.rejects(db.query('update record_relationships set target_id=$1 where id=$2',[target,linked]),/dossier unavailable/);
  assert.equal((await db.query('select id from record_relationships where id=$1',[linked])).rows.length,1);
  await db.exec('reset role');await db.query(`update ${table} set deleted_at=null where id=$1`,[target]);
 }
 await db.exec(`set role authenticated;begin;`);
 await db.query('select private.lock_active_relationship_dossier($1,$2,$3)',[org,'project',project]);
 assert.ok((await db.query("select * from pg_locks where locktype='advisory' and granted")).rows.length>0);
 await db.exec('rollback');assert.equal((await db.query("select * from pg_locks where locktype='advisory'")).rows.length,0);
 await db.exec('begin isolation level repeatable read');await assert.rejects(db.query('select private.lock_active_relationship_dossier($1,$2,$3)',[org,'project',project]),/read committed/);await db.exec('rollback');
 await db.exec('reset role');assert.equal((await db.query("select * from pg_trigger where tgname='lock_relationship_dossier_deletion' and not tgisinternal")).rows.length,7);
 }finally{await db.close();}
});
