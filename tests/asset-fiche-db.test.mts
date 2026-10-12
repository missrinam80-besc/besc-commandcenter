import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {PGlite} from "@electric-sql/pglite";
import {assetStorageValues,materialBlocked} from "../src/lib/asset-followup.ts";
const org="11111111-1111-4111-8111-111111111111",other="22222222-2222-4222-8222-222222222222",actor="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const id=(n:number)=>"33333333-3333-4333-8333-"+String(n).padStart(12,"0");
const migration=(name:string)=>readFileSync("supabase/migrations/"+name,"utf8");
async function setup(beforeMigrations?:(db:PGlite)=>Promise<void>){
 const db=new PGlite();
 await db.exec(readFileSync("tests/helpers/asset-fiche-fixture.sql","utf8"));
 await db.exec(migration("20260803163000_add_assets_and_shop_relations.sql").split("alter table public.shop_products")[0]);
 await db.exec("create unique index asset_fixture_key on assets(organization_id,id);");
 await db.exec("create table event_materials(id uuid primary key,organization_id uuid,event_id uuid,asset_id uuid,status text default 'arranged',pickup_at timestamptz,return_at timestamptz);grant select,insert,update,delete on event_materials to authenticated;");
 await db.exec(migration("20260803103432_add_record_links_and_relationships.sql").split("create table public.record_relationships")[0]);
 await db.exec(migration("20260729134629_google_resource_links.sql"));
 await db.exec("create function private.fixture_community_guard() returns trigger language plpgsql as $$begin return new;end$$; create trigger community_document_guard before update on google_resource_links for each row execute function private.fixture_community_guard();grant select,insert,update,delete on record_links to authenticated;alter table record_links enable row level security;create policy fixture_links on record_links to authenticated using(private.is_active_member(organization_id)) with check(private.is_org_manager(organization_id));");
 await db.query("insert into organizations values($1),($2)",[org,other]);
 await db.query("insert into profiles values($1)",[actor]);
 await db.query("insert into organization_members values($1,$2,'admin','active',null)",[org,actor]);
 if(beforeMigrations)await beforeMigrations(db);
 for(const name of ["20261012125349_asset_fiche_followup.sql","20261012125922_central_document_registry.sql","20261012125923_asset_reservations.sql","20261012130608_duplicate_materials.sql","20261012125447_asset_editor_catalog.sql"])await db.exec(migration(name));
 await db.exec("set role authenticated;");
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);
 return db;
}
test("Acquisition preserves unknown history and suppresses non-purchase values",()=>{
 const values={acquisition_type:"gifted",purchase_value:9,current_value:8,acquired_date:"2026-10-12",name:"TESTFIXTURE"};
 assert.deepEqual(assetStorageValues(values),{...values,purchase_value:null,current_value:null,acquired_date:null});
 assert.equal(assetStorageValues({...values,acquisition_type:null}).purchase_value,9);
});
test("Picker blocks overlapping periods and repair, while allowing other dates",()=>{
 const calendar={id:id(1),unavailable:false,repair:false,bookings:[{table:"event_materials",id:id(5),start:"2026-11-01T10:00:00Z",end:"2026-11-01T12:00:00Z"}]};
 assert.equal(materialBlocked(calendar,{start:Date.parse("2026-11-01T11:00Z"),end:Date.parse("2026-11-01T13:00Z")},"project_materials",id(6)),"Gereserveerd");
 assert.equal(materialBlocked(calendar,{start:Date.parse("2026-11-02T11:00Z"),end:Date.parse("2026-11-02T13:00Z")},"project_materials",id(6)),null);
 assert.equal(materialBlocked({...calendar,repair:true},{start:Date.parse("2026-11-02T11:00Z"),end:Date.parse("2026-11-02T13:00Z")},"project_materials",id(6)),"In herstelling");
});
test("Actual migrations protect shared document identity, organization boundaries, reservations and repairs",async()=>{
 const db=await setup();
 try{
  await db.query("insert into assets(id,organization_id,name,created_by,purchase_value) values($1,$2,'TESTFIXTURE materiaal',$3,25)",[id(1),org,actor]);
  await db.query("update assets set acquisition_type='borrowed',current_value=99 where id=$1",[id(1)]);
  assert.equal((await db.query<{current_value:number|null}>("select current_value from assets")).rows[0].current_value,null);
  await db.query("insert into asset_document_links(id,organization_id,asset_id,label,url,created_by) values($1,$2,$3,'Factuur','https://docs.google.com/document/d/fixture-doc/edit',$4)",[id(2),org,id(1),actor]);
  await db.query("insert into record_links(organization_id,entity_type,entity_id,label,url,created_by) values($1,'project',$2,'Zelfde document','https://drive.google.com/file/d/fixture-doc/view',$3)",[org,id(3),actor]);
  assert.equal((await db.query<{n:number}>("select count(*)::integer n from document_registry")).rows[0].n,1);
  await assert.rejects(db.query("insert into asset_document_links(organization_id,asset_id,label,url,created_by) values($1,$2,'Dubbel','https://docs.google.com/document/d/fixture-doc/edit#heading',$3)",[org,id(1),actor]),/document_already_linked/);
  await assert.rejects(db.query("insert into asset_document_links(organization_id,asset_id,label,url,created_by) values($1,$2,'Verkeerd','https://example.com/foreign',$3)",[other,id(1),actor]));
  await db.query("insert into events(id,organization_id,title,start_at,end_at) values($1,$2,'TESTFIXTURE event','2026-11-01T10:00Z','2026-11-01T12:00Z')",[id(10),org]);
  await db.query("insert into projects(id,organization_id,title) values($1,$2,'TESTFIXTURE project')",[id(11),org]);
  await db.query("insert into event_materials(id,organization_id,event_id,asset_id) values($1,$2,$3,$4)",[id(12),org,id(10),id(1)]);
  const reserve=(day:number)=>db.query("insert into project_materials(organization_id,project_id,asset_id,name,starts_at,ends_at,created_by) values($1,$2,$3,'TESTFIXTURE reservering',$4,$5,$6)",[org,id(11),id(1),"2026-11-0"+day+"T11:00Z","2026-11-0"+day+"T13:00Z",actor]);
  await assert.rejects(reserve(1),/asset_already_reserved/);
  await reserve(2);
  await assert.rejects(db.query("update events set start_at='2026-11-02T10:00Z',end_at='2026-11-02T12:00Z' where id=$1",[id(10)]),/asset_already_reserved/);
  assert.equal((await db.query<{date:string}>("select to_char(start_at at time zone 'UTC','YYYY-MM-DD') date from events where id=$1",[id(10)])).rows[0].date,"2026-11-01");
  await db.query("insert into tasks(id,organization_id,title,repair_asset_id,created_by) values($1,$2,'TESTFIXTURE herstel',$3,$4)",[id(13),org,id(1),actor]);
  await assert.rejects(reserve(3),/asset_in_repair/);
  await db.query("update tasks set status='done' where id=$1",[id(13)]);
  await reserve(3);
  const copies=(await db.query<{ids:string[]}>("select duplicate_assets($1,array[$2::uuid]) ids",[org,id(1)])).rows[0].ids;
  assert.equal(copies.length,1);
  assert.equal((await db.query<{n:number}>("select count(*)::integer n from document_registry")).rows[0].n,1);
  assert.equal((await db.query<{n:number}>("select count(*)::integer n from asset_document_links where asset_id=$1",[copies[0]])).rows[0].n,1);
  const base=(await db.query<{row:Record<string,unknown>}>("select to_jsonb(a) row from assets a where id=$1",[copies[0]])).rows[0].row;
  await db.query("select save_dossier_bundle($1,$2::jsonb)",[org,JSON.stringify({kind:"asset",root:{id:copies[0],new:false,base,values:{name:"TESTFIXTURE editor"}},parts:[{collection:"asset_document_links",id:id(20),new:true,values:{label:"Website",url:"https://example.com/site"}}]})]);
  await assert.rejects(db.query("select save_dossier_bundle($1,$2::jsonb)",[org,JSON.stringify({kind:"asset",root:{id:id(30),new:true,values:{name:"TESTFIXTURE rollback"}},parts:[{collection:"asset_document_links",id:id(31),new:true,values:{label:"Ongeldig",url:"javascript:alert(1)"}}]})]));
  assert.equal((await db.query<{n:number}>("select count(*)::integer n from assets where id=$1",[id(30)])).rows[0].n,0);
  await db.exec("reset role");
  await db.query("insert into expenses(id,organization_id,title,proof_url,created_by) values($1,$2,'TESTFIXTURE financieel','https://example.com/private-invoice',$3)",[id(40),org,actor]);
  await db.query("insert into profiles values($1)",[id(41)]);
  await db.query("insert into organization_members values($1,$2,'member','active',null)",[org,id(41)]);
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(41)]);
  assert.equal((await db.query<{n:number}>("select count(*)::integer n from document_registry where url='https://example.com/private-invoice'")).rows[0].n,0);
  assert.equal((await db.query<{n:number}>("select count(*)::integer n from document_registry_sources where table_name='expenses'")).rows[0].n,0);
  await assert.rejects(db.query("select duplicate_assets($1,array[$2::uuid])",[org,id(1)]),/asset_no_access/);
 }finally{await db.close();}
});

test("Backfill preserves legacy links, timestamps and unknown acquisition while deduplicating documents",async()=>{
 let previousTimestamp:unknown;
 const db=await setup(async db=>{
  await db.query("insert into assets(id,organization_id,name,created_by,purchase_value,document_url) values($1,$2,'TESTFIXTURE bestaand',$3,75,'https://drive.google.com/file/d/legacy-shared/view')",[id(80),org,actor]);
  previousTimestamp=(await db.query<{updated_at:unknown}>("select updated_at from assets where id=$1",[id(80)])).rows[0].updated_at;
  await db.query("insert into record_links(organization_id,entity_type,entity_id,label,url,created_by) values($1,'project',$2,'TESTFIXTURE bestaande link','https://docs.google.com/document/d/legacy-shared/edit',$3)",[org,id(81),actor]);
  await db.query("insert into google_resource_links(organization_id,entity_type,entity_id,name,resource_type,google_id,web_url,created_by) values($1,'event',$2,'TESTFIXTURE bestaand Google-document','document','legacy-shared','https://docs.google.com/document/d/legacy-shared/edit#heading',$3)",[org,id(82),actor]);
 });
 try{
  const asset=(await db.query<{purchase_value:string;acquisition_type:string|null;document_url:string;updated_at:unknown}>("select purchase_value,acquisition_type,document_url,updated_at from assets where id=$1",[id(80)])).rows[0];
  assert.equal(Number(asset.purchase_value),75);
  assert.equal(asset.acquisition_type,null);
  assert.equal(asset.document_url,"https://drive.google.com/file/d/legacy-shared/view");
  assert.deepEqual(asset.updated_at,previousTimestamp);
  assert.equal((await db.query<{n:number}>("select count(*)::integer n from document_registry")).rows[0].n,1);
  assert.equal((await db.query<{n:number}>("select count(*)::integer n from google_resource_links")).rows[0].n,1);
  assert.equal((await db.query<{n:number}>("select count(*)::integer n from record_links")).rows[0].n,1);
 }finally{await db.close();}
});
