import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
const actor="10000000-0000-4000-8000-000000000001",otherUser="10000000-0000-4000-8000-000000000002";
const org="20000000-0000-4000-8000-000000000001",other="20000000-0000-4000-8000-000000000002";
const source=(name:string)=>readFileSync(new URL(`../supabase/migrations/${name}`,import.meta.url),"utf8");

test("Community bundle rolls profile and roles back together under existing RLS",async()=>{
 const db=new PGlite();try{
 await db.exec(`create role authenticated;create role anon;create schema auth;create schema private;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table public.organizations(id uuid primary key);create table public.profiles(id uuid primary key);
 create table public.organization_members(organization_id uuid,user_id uuid,status text,manager boolean);
 insert into public.organizations values('${org}'),('${other}');insert into public.profiles values('${actor}'),('${otherUser}');
 insert into public.organization_members values('${org}','${actor}','active',true),('${other}','${otherUser}','active',true);
 create function private.is_active_member(o uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.organization_members where organization_id=o and user_id=auth.uid() and status='active')$$;
 create function private.is_org_manager(o uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.organization_members where organization_id=o and user_id=auth.uid() and status='active' and manager)$$;
 grant usage on schema auth,private to authenticated;grant select on public.organization_members to authenticated;`);
 const definition=source("20260722100000_add_operational_modules.sql").split("create table public.community_people (")[1].split("create table public.social_posts")[0];
 await db.exec("create table public.community_people ("+definition);
 await db.exec(`alter table public.community_people add column phone text;alter table public.community_people enable row level security;
 grant select,insert,update,delete on public.community_people to authenticated;
 create policy person_read on public.community_people for select to authenticated using(private.is_active_member(organization_id));
 create policy person_insert on public.community_people for insert to authenticated with check(private.is_org_manager(organization_id));
 create policy person_update on public.community_people for update to authenticated using(private.is_org_manager(organization_id)) with check(private.is_org_manager(organization_id));`);
 await db.exec(source("20260803133000_add_central_person_roles_and_account_link.sql"));
 await db.exec(source("20261003100000_add_streamteam_person_role.sql"));
 await db.exec(source("20261006202835_atomic_community_person_roles.sql"));
 await db.exec(`set role authenticated;set request.jwt.claim.sub='${actor}';`);
 const save=async(id:string|null=null,values:Record<string,unknown>={display_name:"TESTFIXTURE updated"},roles:(string|null)[]=["board","volunteer"])=>
   db.query<{id:string}>("select public.save_community_person_bundle($1,$2::jsonb,$3::text[],$4) as id",[org,JSON.stringify(values),roles,id]);
 const created=(await save(null,{display_name:"TESTFIXTURE initial"},["volunteer","volunteer"])).rows[0].id;
 await db.exec(`reset role;update public.community_people set phone='legacy retained' where id='${created}';set role authenticated;`);
 await save(created);
 const snapshot=async()=>({people:(await db.query<Record<string,unknown>>("select * from public.community_people order by id")).rows,roles:(await db.query<Record<string,unknown>>("select * from public.community_person_roles order by person_id,role")).rows});
 assert.equal((await snapshot()).people[0].phone,"legacy retained");assert.equal((await snapshot()).roles.length,2);
 for(const [values,roles] of [[{display_name:"x"},["member"]],[{display_name:"TESTFIXTURE",organization_id:other},["member"]],[{account_user_id:otherUser},["member"]],[{display_name:"TESTFIXTURE"},["invalid"]],[{display_name:"TESTFIXTURE"},[null]]] as [Record<string,unknown>,(string|null)[]][]){const before=await snapshot();await assert.rejects(save(created,values,roles));assert.deepEqual(await snapshot(),before);}
 await db.exec(`reset role;create function public.fixture_fail() returns trigger language plpgsql as $$begin raise exception 'fixture role failure';end$$;
 create function public.fixture_skip() returns trigger language plpgsql as $$begin return null;end$$;set role authenticated;`);
 for(const fn of ["fixture_fail","fixture_skip"]){
  await db.exec(`reset role;create trigger fixture_reject before insert on public.community_person_roles for each row execute function public.${fn}();set role authenticated;`);
  const before=await snapshot();await assert.rejects(save(created));assert.deepEqual(await snapshot(),before);
  await assert.rejects(save());assert.deepEqual(await snapshot(),before);
  await db.exec(`reset role;drop trigger fixture_reject on public.community_person_roles;set role authenticated;`);
 }
 await db.exec(`reset role;create trigger fixture_delete_skip before delete on public.community_person_roles for each row execute function public.fixture_skip();set role authenticated;`);
 const beforeSkippedDelete=await snapshot();await assert.rejects(save(created));assert.deepEqual(await snapshot(),beforeSkippedDelete);
 await db.exec(`reset role;drop trigger fixture_delete_skip on public.community_person_roles;alter policy "managers delete person roles" on public.community_person_roles using(false);set role authenticated;`);
 let before=await snapshot();await assert.rejects(save(created));assert.deepEqual(await snapshot(),before);
 await db.exec(`reset role;alter policy "managers delete person roles" on public.community_person_roles using(private.is_org_manager(organization_id));alter policy person_update on public.community_people using(false);set role authenticated;`);
 before=await snapshot();await assert.rejects(save(created));assert.deepEqual(await snapshot(),before);
 await db.exec(`reset role;alter policy person_update on public.community_people using(private.is_org_manager(organization_id));set role authenticated;`);
 await save(created,{display_name:"TESTFIXTURE cleared"},[]);assert.equal((await snapshot()).roles.length,0);
 await db.exec(`reset role;update public.community_people set deleted_at=now() where id='${created}';set role authenticated;`);
 before=await snapshot();await assert.rejects(save(created));assert.deepEqual(await snapshot(),before);
 await db.exec(`reset role;update public.organization_members set manager=false where user_id='${actor}';set role authenticated;`);
 await assert.rejects(save());
 await db.exec("reset role");
 assert.equal((await db.query<{safe:boolean}>("select not p.prosecdef and has_function_privilege('authenticated',p.oid,'EXECUTE') and not has_function_privilege('anon',p.oid,'EXECUTE') as safe from pg_proc p where proname='save_community_person_bundle'")).rows[0].safe,true);
 }finally{await db.close();}
});
