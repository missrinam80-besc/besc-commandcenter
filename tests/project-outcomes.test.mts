import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { z } from "zod";
import { missingProjectOutcomes, projectOutcomeShape } from "../src/lib/project-outcomes.ts";
const migration=readFileSync(new URL("../supabase/migrations/20261006175008_add_project_outcomes.sql",import.meta.url),"utf8");
const fields={goal:"TESTFIXTURE doel",deliverables:"TESTFIXTURE resultaten",acceptance_criteria:"TESTFIXTURE criteria",closure_evaluation:"TESTFIXTURE evaluatie"};
test("Projectuitkomsten normaliseren lege tekst en bewaken veldlengtes",()=>{
 const schema=z.object(projectOutcomeShape);assert.equal(schema.parse({goal:" \n "}).goal,null);
 assert.equal(schema.parse({goal:"  doel  "}).goal,"doel");assert.equal(schema.parse({}).goal,undefined);
 assert.equal(schema.safeParse({goal:"x".repeat(2001)}).success,false);
 for(const key of ["deliverables","acceptance_criteria","closure_evaluation"])assert.equal(schema.safeParse({[key]:"x".repeat(5001)}).success,false);
 assert.deepEqual(missingProjectOutcomes(fields),[]);assert.equal(missingProjectOutcomes({...fields,goal:"\t"}).length,1);
});
test("Postgres-migratie bewaart historische data, RLS en audit en blokkeert incomplete nieuwe afsluiting",async()=>{
 const db=new PGlite();try{
  await db.exec(`create schema private; create role authenticated; create role anon;
    create table projects(id int primary key,title text,status text,description text);
    insert into projects values (1,'TESTFIXTURE actief','active','Beschrijving'),(2,'TESTFIXTURE eerder klaar','done','Historisch');
    alter table projects enable row level security;
    grant select,insert,update on projects to authenticated;
    create policy fixture_read on projects for select to authenticated using(true);
    create policy fixture_write on projects for update to authenticated using(true) with check(true);
    create table fixture_audit(id int); grant insert on fixture_audit to authenticated;
    create function fixture_log() returns trigger language plpgsql as $$ begin insert into fixture_audit values(new.id); return new; end $$;
    create trigger fixture_log after update on projects for each row execute function fixture_log();`);
  const before=(await db.query("select id,title,status,description from projects order by id")).rows;
  const policies=(await db.query("select policyname,cmd,qual,with_check from pg_policies where tablename='projects' order by policyname")).rows;
  await db.exec(migration);
  assert.deepEqual((await db.query("select id,title,status,description from projects order by id")).rows,before);
  assert.deepEqual((await db.query("select policyname,cmd,qual,with_check from pg_policies where tablename='projects' order by policyname")).rows,policies);
  assert.equal((await db.query<{enabled:boolean}>("select relrowsecurity as enabled from pg_class where oid='projects'::regclass")).rows[0].enabled,true);
  assert.equal((await db.query<{prosecdef:boolean}>("select prosecdef from pg_proc where oid='private.guard_project_closure()'::regprocedure")).rows[0].prosecdef,false);
  assert.equal((await db.query("select * from fixture_audit")).rows.length,0);
  await db.exec("set role authenticated");
  await assert.rejects(db.query("update projects set status='done' where id=1"),/project_closure_required/);
  assert.equal((await db.query<{status:string}>("select status from projects where id=1")).rows[0].status,"active");
  await db.query("update projects set goal=$1,deliverables=$2,acceptance_criteria=$3,closure_evaluation=$4 where id=1",Object.values(fields));
  for(const key of Object.keys(fields)){
    await db.query(`update projects set ${key}=$1 where id=1`,[" \t\n "]);
    await assert.rejects(db.query("update projects set status='done' where id=1"),/project_closure_required/);
    await db.query(`update projects set ${key}=$1 where id=1`,[fields[key as keyof typeof fields]]);
  }
  await db.exec("update projects set status='done' where id=1");
  await db.exec("update projects set title='TESTFIXTURE legacy tekst aangepast' where id=2");
  assert.equal((await db.query<{evaluation:string|null}>("select closure_evaluation as evaluation from projects where id=2")).rows[0].evaluation,null);
  await db.exec("reset role");
  await assert.rejects(db.exec("insert into projects(id,title,status) values (3,'TESTFIXTURE incomplete','done')"),/project_closure_required/);
  await db.query("insert into projects(id,title,status,goal,deliverables,acceptance_criteria,closure_evaluation) values (3,'TESTFIXTURE compleet','done',$1,$2,$3,$4)",Object.values(fields));
  await assert.rejects(db.query("update projects set goal=$1 where id=1",["x".repeat(2001)]),/project_goal_length/);
  await db.exec("update projects set status='active' where id=1; update projects set closure_evaluation=null where id=1;");
  await assert.rejects(db.exec("update projects set status='done' where id=1"),/project_closure_required/);
  assert.ok((await db.query("select * from fixture_audit")).rows.length>0);
 }finally{await db.close();}
});
