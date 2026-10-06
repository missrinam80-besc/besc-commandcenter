import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { hasPermission } from "../src/lib/permissions.ts";

const org = "10000000-0000-4000-8000-000000000001";
const other = "10000000-0000-4000-8000-000000000002";
const uuid = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const directory = new URL("../supabase/migrations/", import.meta.url);
const migration = () => readFileSync(new URL(readdirSync(directory).find(n => n.endsWith("_align_project_permissions.sql"))!, directory),"utf8");
test("Echte Project-RLS volgt apprechten en bewaakt organisatie, actieve lidmaatschappen en aangepaste rollen",async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role authenticated; create role anon; create schema auth; create schema private;
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   grant usage on schema auth,private to authenticated;
   create type public.member_role as enum ('admin','board','member','volunteer');
   create type public.priority_level as enum ('low','normal','high','urgent');
   create table public.organizations(id uuid primary key);
   create table public.profiles(id uuid primary key);
   create table public.projects(id uuid primary key default gen_random_uuid(), organization_id uuid, title text, created_by uuid, deleted_at timestamptz);
   create table public.organization_members(organization_id uuid,user_id uuid,role public.member_role,status text);
   alter table public.organization_members enable row level security;
   grant select on public.organization_members to authenticated;`);
  const core=readFileSync(new URL("20260712190000_initial_core.sql",directory),"utf8");
  const start=core.indexOf("create function private.is_active_member");
  const end=core.indexOf('create policy "own profile read"',start);
  await db.exec(core.slice(start,end));
  await db.exec(`create policy membership_self on public.organization_members for select to authenticated using(user_id=auth.uid() or private.is_org_manager(organization_id));`);
  await db.exec(readFileSync(new URL("20260812110000_add_custom_access_roles.sql",directory),"utf8"));
  await db.exec(`alter table projects enable row level security; grant select,insert,update,delete on projects to authenticated;
    create policy "active member project read" on projects for select to authenticated using(private.is_active_member(organization_id));
    create policy "manager project write" on projects for all to authenticated using(private.is_org_manager(organization_id)) with check(private.is_org_manager(organization_id));`);
  await db.exec(readFileSync(new URL("20260713070747_add_collaboration_and_project_management.sql",directory),"utf8"));
  const prior = readFileSync(new URL("20261006140627_align_event_permissions.sql",directory),"utf8");
  await db.exec(prior.slice(0, prior.indexOf("-- Invoker privileges")) + "commit;");
  await db.exec(`create table fixture_audit(project_id uuid);
    grant insert on fixture_audit to authenticated;
    create function fixture_log() returns trigger language plpgsql as $$ begin insert into fixture_audit values(new.id); return new; end $$;
    create trigger fixture_log after insert or update on projects for each row execute function fixture_log();`);
  const preserved = "select policyname,cmd,qual,with_check from pg_policies where tablename='projects' and cmd='SELECT' order by policyname";
  const before = (await db.query(preserved)).rows;
  await db.exec(migration());
  assert.deepEqual((await db.query(preserved)).rows, before);
  assert.equal((await db.query("select * from pg_trigger where tgrelid='projects'::regclass and tgname='fixture_log'")).rows.length, 1);
  assert.equal((await db.query<{ prosecdef: boolean }>("select prosecdef from pg_proc where oid='private.can_manage_project(uuid)'::regprocedure")).rows[0].prosecdef, false);
  await db.exec(migration()); // Re-running the migration does not accumulate policies.
  await db.query("insert into organizations values ($1),($2)",[org,other]);
  for(let n=1;n<=9;n++)await db.query("insert into profiles values ($1)",[uuid(n)]);
  const cases=[
   {n:1,role:"admin",status:"active",allowed:true}, {n:2,role:"board",status:"active",allowed:true},
   {n:3,role:"member",status:"active",allowed:true}, {n:4,role:"volunteer",status:"active",allowed:false},
   {n:5,role:"volunteer",status:"active",caps:["manageProjects"],allowed:true},
   {n:6,role:"member",status:"pending",allowed:false},
   {n:7,role:"volunteer",status:"active",caps:["manageProjects"],deleted:true,allowed:false},
   {n:8,role:"volunteer",status:"active",caps:["manageProjects"],wrongOrg:true,allowed:false},
  ];
  for(const c of cases){
   await db.query("insert into organization_members(organization_id,user_id,role,status) values ($1,$2,$3,$4)",[org,uuid(c.n),c.role,c.status]);
   if(c.caps){
    await db.query("insert into organization_access_roles(id,organization_id,name,capabilities,deleted_at) values ($1,$2,$3,$4,$5)",[uuid(100+c.n),c.wrongOrg?other:org,`fixture-${c.n}`,c.caps,c.deleted?"2026-10-06":null]);
    await db.query("update organization_members set access_role_id=$1 where user_id=$2",[uuid(100+c.n),uuid(c.n)]);
   }
  }
  await db.query("insert into organization_members(organization_id,user_id,role,status) values ($1,$2,'member','active')",[other,uuid(9)]);
  const projectId=uuid(300);
  await db.query("insert into projects(id,organization_id,title,created_by) values ($1,$2,'TESTFIXTURE',$3)",[projectId,org,uuid(1)]);
  await db.query("insert into projects(id,organization_id,title,created_by) values ($1,$2,'TESTFIXTURE foreign',$3)",[uuid(301),other,uuid(1)]);
  await db.query("insert into projects(id,organization_id,title,created_by,deleted_at) values ($1,$2,'TESTFIXTURE deleted',$3,now())",[uuid(302),org,uuid(1)]);
  for(const c of cases){
   await db.exec("set role authenticated");await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uuid(c.n)]);
   const permissions=await db.query<{allowed:boolean}>("select private.can_manage_projects($1) as allowed",[org]);
   assert.equal(permissions.rows[0].allowed,c.allowed,`DB case ${c.n}`);
   const caps=c.deleted||c.wrongOrg?[]:c.caps??[];
   assert.equal(c.status==="active" && hasPermission({role:c.role,finance_role:"none",capabilities:caps},"manageProjects"),c.allowed);
   const update=await db.query("update projects set title='TESTFIXTURE changed' where id=$1 returning id",[projectId]);
   assert.equal(update.rows.length,c.allowed?1:0,`update case ${c.n}`);
   const insertion=()=>db.query("insert into projects(organization_id,title,created_by) values ($1,'TESTFIXTURE new',$2)",[org,uuid(c.n)]);
   if(c.allowed)await insertion();else await assert.rejects(insertion());
   await assert.rejects(db.query("insert into projects(organization_id,title,created_by) values ($1,'TESTFIXTURE foreign',$2)",[other,uuid(c.n)]));
   const moved=await db.query("update projects set organization_id=$1 where id=$2 returning id",[other,projectId]).catch(()=>null);
   assert.ok(moved===null||moved.rows.length===0);
   assert.equal((await db.query<{allowed:boolean}>("select private.can_manage_project($1) as allowed",[projectId])).rows[0].allowed,c.allowed);
   for(const deniedProject of [uuid(301),uuid(302)]) {
    await assert.rejects(db.query("insert into project_milestones(project_id,title,created_by) values ($1,'TESTFIXTURE denied',$2)",[deniedProject,uuid(c.n)]));
    await assert.rejects(db.query("insert into project_members(project_id,user_id) values ($1,$2)",[deniedProject,uuid(c.n)]));
   }
   const milestoneId=uuid(400+c.n);
   const milestoneInsert=()=>db.query("insert into project_milestones(id,project_id,title,created_by) values ($1,$2,'TESTFIXTURE milestone',$3)",[milestoneId,projectId,uuid(c.n)]);
   const teamInsert=()=>db.query("insert into project_members(project_id,user_id) values ($1,$2)",[projectId,uuid(c.n)]);
   if(c.allowed){
    await milestoneInsert(); await teamInsert();
    await assert.rejects(db.query("insert into project_milestones(project_id,title,created_by) values ($1,'TESTFIXTURE impersonated',$2)",[projectId,uuid(9)]));
    await assert.rejects(db.query("insert into project_members(project_id,user_id) values ($1,$2)",[projectId,uuid(9)]));
    assert.equal((await db.query("update project_milestones set is_done=true where id=$1 returning id",[milestoneId])).rows.length,1);
    await assert.rejects(db.query("update project_milestones set project_id=$1 where id=$2",[uuid(301),milestoneId]));
    assert.equal((await db.query("delete from project_milestones where id=$1 returning id",[milestoneId])).rows.length,1);
    assert.equal((await db.query("delete from project_members where project_id=$1 and user_id=$2 returning user_id",[projectId,uuid(c.n)])).rows.length,1);
   }else{ await assert.rejects(milestoneInsert()); await assert.rejects(teamInsert()); }
   if(c.n===5){
    const visible=await db.query("select id from organization_access_roles");assert.equal(visible.rows.length,1);
    assert.equal((await db.query("update organization_access_roles set capabilities='{}' returning id")).rows.length,0);
   }
   await db.exec("reset role");
  }
  await db.query("insert into project_milestones(id,project_id,title,created_by) values ($1,$2,'TESTFIXTURE withdrawn',$3)",[uuid(500),projectId,uuid(5)]);
  await db.query("insert into project_members(project_id,user_id) values ($1,$2)",[projectId,uuid(5)]);
  await db.query("update organization_members set status='inactive' where user_id=$1",[uuid(5)]);
  await db.exec("set role authenticated");await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uuid(5)]);
  assert.equal((await db.query<{allowed:boolean}>("select private.can_manage_projects($1) as allowed",[org])).rows[0].allowed,false);
  assert.equal((await db.query("update projects set title='TESTFIXTURE withdrawn' returning id")).rows.length,0);
  assert.equal((await db.query("update project_milestones set is_done=true where id=$1 returning id",[uuid(500)])).rows.length,0);
  assert.equal((await db.query("delete from project_members where project_id=$1 returning user_id",[projectId])).rows.length,0);
  await db.exec("reset role");
  for (const n of [4,3,1]) {
    await db.exec("set role authenticated");await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uuid(n)]);
    assert.equal((await db.query("delete from projects where id=$1 returning id",[projectId])).rows.length,n===1?1:0);
    await db.exec("reset role");
  }
  assert.ok((await db.query("select * from fixture_audit")).rows.length > 1);
  await db.exec("set role authenticated");await db.query("select set_config('request.jwt.claim.sub','',false)");
  assert.equal((await db.query<{allowed:boolean}>("select private.can_manage_projects($1) as allowed",[org])).rows[0].allowed,false);
  assert.equal((await db.query("update projects set title='TESTFIXTURE anonymous' returning id")).rows.length,0);
  await db.exec("reset role");
  await db.exec("set role anon");await assert.rejects(db.query("select private.can_manage_project($1)",[org]));
 }finally{await db.close();}
});
