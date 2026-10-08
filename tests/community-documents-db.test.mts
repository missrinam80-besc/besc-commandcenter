import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {PGlite} from "@electric-sql/pglite";
const org="10000000-0000-4000-8000-000000000001",other="10000000-0000-4000-8000-000000000002",admin="20000000-0000-4000-8000-000000000001",viewer="20000000-0000-4000-8000-000000000002";
const person="30000000-0000-4000-8000-000000000001",foreign="30000000-0000-4000-8000-000000000002",deleted="30000000-0000-4000-8000-000000000003";
test("documenten op persoonsfiches bewaren RLS en weigeren vreemde of verwijderde personen",async()=>{
  const db=new PGlite();try{
    await db.exec(`create role authenticated;create role anon;create schema auth;create schema private;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table organizations(id uuid primary key);create table profiles(id uuid primary key);
      create table community_people(id uuid primary key,organization_id uuid,deleted_at timestamptz);
      create function private.is_active_member(o uuid) returns boolean language sql stable as $$select o='${org}' and auth.uid() in('${admin}','${viewer}')$$;
      create function private.is_org_manager(o uuid) returns boolean language sql stable as $$select o='${org}' and auth.uid()='${admin}'$$;
      grant usage on schema auth,private to authenticated;grant select,update on community_people to authenticated;
      alter table community_people enable row level security;create policy people_read on community_people for select to authenticated using(private.is_active_member(organization_id));
      create policy people_update on community_people for update to authenticated using(private.is_org_manager(organization_id));
      insert into organizations values('${org}'),('${other}');insert into profiles values('${admin}'),('${viewer}');
      insert into community_people values('${person}','${org}',null),('${foreign}','${other}',null),('${deleted}','${org}',now());`);
    for(const name of ["20260729134629_google_resource_links.sql","20260803121000_allow_multiple_google_documents_per_record.sql","20261008074044_community_contact_documents.sql"])await db.exec(readFileSync(`supabase/migrations/${name}`,"utf8"));
    const save=async(id:string,kind="community_person")=>db.query<{id:string}>(`insert into google_resource_links(organization_id,entity_type,entity_id,resource_type,google_id,name,web_url,created_by) values($1,$2,$3,'document',gen_random_uuid()::text,'TESTFIXTURE','https://docs.google.com/example',$4) returning id`,[org,kind,id,admin]);
    await db.exec(`set role authenticated;set request.jwt.claim.sub='${admin}';`);
    const saved=await save(person);await save(person); // multiple documents remain supported
    await assert.rejects(save(foreign));await assert.rejects(save(deleted));await assert.rejects(save("30000000-0000-4000-8000-000000000999"));
    await save(person,"partner"); // previous entity types remain compatible
    await assert.rejects(db.query(`update google_resource_links set entity_id=$1 where id=$2`,[foreign,saved.rows[0].id]));
    await db.exec(`set request.jwt.claim.sub='${viewer}';`);await assert.rejects(save(person));
    assert.equal((await db.query(`select id from google_resource_links where entity_type='community_person'`)).rows.length,2);
    await db.exec(`reset role;set role anon;`);await assert.rejects(db.query(`select * from google_resource_links`));
    await db.exec(`reset role;`);
    assert.equal((await db.query<{rls:boolean}>(`select relrowsecurity rls from pg_class where oid='public.google_resource_links'::regclass`)).rows[0].rls,true);
  }finally{await db.close();}
});
