import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";

const compiled={exports:{} as Record<string,unknown>};
const code=ts.transpileModule(readFileSync(new URL("../src/lib/source-observation.ts",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
runInNewContext(code,{exports:compiled.exports,module:compiled,Date,Intl});
type Fields={source_version:string|null;source_modified_at:string|null;source_checked_at:string|null};
const observe=compiled.exports.sourceObservation as (input:Record<string,unknown>)=>Fields;
const labels=compiled.exports.sourceObservationLabels as (input:Partial<Fields>)=>string;
test("Drive int64-versie blijft exact, zonder afronding",()=>{
  assert.equal(observe({version:"9007199254740993"}).source_version,"9007199254740993");
});
for(const version of [undefined,null,9007199254740992,"v1","1.5",""] )test("Ontbrekende of ongeldige versie blijft onbekend",()=>{
  assert.equal(observe({version}).source_version,null);
});
test("Bronwijziging en controlepeildatum worden afzonderlijk genormaliseerd",()=>{
  const fields=observe({version:"42",modifiedTime:"2025-09-03T14:00:00+02:00",checkedAt:"2026-10-05T14:00:00+02:00"});
  assert.equal(fields.source_modified_at,"2025-09-03T12:00:00.000Z");assert.equal(fields.source_checked_at,"2026-10-05T12:00:00.000Z");
});
test("Geen controletijd afleiden uit bronwijziging of lokale klok",()=>{
  assert.equal(observe({modifiedTime:"2025-09-03T12:00:00Z"}).source_checked_at,null);
  assert.equal(observe({modifiedTime:"geen datum",checkedAt:0}).source_modified_at,null);
});
test("Oude registratie toont onbekende broninformatie zonder goedkeuringsclaim",()=>{
  const text=labels({});assert.match(text,/Drive-versie: onbekend/);assert.match(text,/Metadata gecontroleerd: onbekend/);assert.doesNotMatch(text,/goedgekeurd|gelezen|up.to.date/i);
});
test("Peildatum wordt weergegeven in Brusselse tijd",()=>{
  const text=labels({source_version:"42",source_checked_at:"2026-10-05T12:00:00Z"});assert.match(text,/14:00/);assert.match(text,/Drive-versie: 42/);
});
test("Migratie laat oude bronnen onbekend, bewaart precieze versie en behoudt bestaande RLS/policy",async()=>{
  const db=new PGlite();
  try {
    await db.exec("create table public.google_resource_links(id text primary key, organization_id text, name text); insert into public.google_resource_links values ('old','org','Existing source'); alter table public.google_resource_links enable row level security; create policy existing_read on public.google_resource_links for select using (true);");
    const before=await db.query("select policyname,cmd from pg_policies where tablename='google_resource_links'");
    await db.exec(readFileSync(new URL("../supabase/migrations/20261005190000_add_source_observation.sql",import.meta.url),"utf8"));
    const old=await db.query<Fields>("select source_version, source_modified_at, source_checked_at from public.google_resource_links where id='old'");
    assert.deepEqual(old.rows[0],{source_version:null,source_modified_at:null,source_checked_at:null});
    await db.query("update public.google_resource_links set source_version=$1,source_checked_at=$2 where id='old'",["9007199254740993","2026-10-05T12:00:00Z"]);
    const result=await db.query<{source_version:string}>("select source_version from public.google_resource_links where id='old'");assert.equal(result.rows[0].source_version,"9007199254740993");
    await assert.rejects(db.exec("update public.google_resource_links set source_version='v1' where id='old'"));
    const after=await db.query("select policyname,cmd from pg_policies where tablename='google_resource_links'");assert.deepEqual(after.rows,before.rows);
    const rls=await db.query<{relrowsecurity:boolean}>("select relrowsecurity from pg_class where oid='public.google_resource_links'::regclass");assert.equal(rls.rows[0].relrowsecurity,true);
  } finally {await db.close();}
});
