// Independent PostgreSQL sessions in an isolated CI database only.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {setTimeout as pause} from 'node:timers/promises';
if(process.env.PGHOST!=='127.0.0.1'||process.env.PGDATABASE!=='besc_concurrency_fixture')throw Error('Requires isolated local CI database');
let env=process.env;
const args=['-X','-q','-A','-t','-v','ON_ERROR_STOP=1'];
function processSql(query,interactive=false){
 const child=spawn('psql',interactive?args:[...args,'-c',query],{env,stdio:['pipe','pipe','pipe']});
 let out='',err='';
 child.stdout.on('data',chunk=>out+=chunk);child.stderr.on('data',chunk=>err+=chunk);
 const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>resolve({code,out,err}));});
 return {child,done,write:query=>child.stdin.write(query),ready:async()=>{
  const until=Date.now()+10000;while(Date.now()<until){if(out.includes('BESC_READY'))return;await pause(25);}throw Error(err||'Holder timeout');
 }};
}
async function sql(query){const result=await processSql(query).done;assert.equal(result.code,0,result.err);return result.out.trim();}
await sql('create database besc_asset_fiche_fixture;');
env={...process.env,PGDATABASE:'besc_asset_fiche_fixture'};
const migration=name=>readFileSync('supabase/migrations/'+name,'utf8');
let fixture=readFileSync('tests/helpers/asset-fiche-fixture.sql','utf8').replace('create role anon;create role authenticated;',()=>"do $$begin if not exists(select from pg_roles where rolname='anon')then create role anon;end if;if not exists(select from pg_roles where rolname='authenticated')then create role authenticated;end if;end$$;");
fixture+=migration('20260803163000_add_assets_and_shop_relations.sql').split('alter table public.shop_products')[0];
fixture+="create unique index asset_fixture_key on assets(organization_id,id);create table event_materials(id uuid primary key,organization_id uuid,event_id uuid,asset_id uuid,status text default 'arranged',pickup_at timestamptz,return_at timestamptz);grant select,insert,update,delete on event_materials to authenticated;";
fixture+=migration('20260803103432_add_record_links_and_relationships.sql').split('create table public.record_relationships')[0];
fixture+=migration('20260729134629_google_resource_links.sql');
fixture+="create function private.fixture_community_guard() returns trigger language plpgsql as $$begin return new;end$$;create trigger community_document_guard before update on google_resource_links for each row execute function private.fixture_community_guard();grant select,insert,update,delete on record_links to authenticated;alter table record_links enable row level security;create policy fixture_links on record_links to authenticated using(private.is_active_member(organization_id)) with check(private.is_org_manager(organization_id));";
const org='11111111-1111-4111-8111-111111111111',actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',asset='33333333-3333-4333-8333-000000000001',event='33333333-3333-4333-8333-000000000010',project='33333333-3333-4333-8333-000000000011';
await sql(fixture);
await sql("insert into organizations values('"+org+"');insert into profiles values('"+actor+"');insert into organization_members values('"+org+"','"+actor+"','admin','active',null);");
for(const name of ['20261012125349_asset_fiche_followup.sql','20261012125922_central_document_registry.sql','20261012125923_asset_reservations.sql','20261012130608_duplicate_materials.sql'])await sql(migration(name));
await sql("insert into assets(id,organization_id,name,created_by)values('"+asset+"','"+org+"','TESTFIXTURE','"+actor+"');insert into events(id,organization_id,title,start_at,end_at)values('"+event+"','"+org+"','TESTFIXTURE','2026-11-01T10:00Z','2026-11-01T12:00Z');insert into projects(id,organization_id,title)values('"+project+"','"+org+"','TESTFIXTURE');");
const prefix="set statement_timeout='12s';set lock_timeout='10s';set role authenticated;select set_config('request.jwt.claim.sub','"+actor+"',false);";
async function race(holderSql,contenderSql,expectedPattern){
 const holder=processSql('',true);
 holder.write(prefix+"begin;"+holderSql+"select 'BESC_READY';\n");
 await holder.ready();
 const second=processSql(prefix+"set application_name='asset-fiche-contender';"+contenderSql);
 const deadline=Date.now()+8000;let blocked=false;
 while(Date.now()<deadline){
  if(await sql("select count(*) from pg_stat_activity where application_name='asset-fiche-contender' and wait_event_type='Lock'")==='1'){blocked=true;break;}
  await pause(50);
 }
 assert.equal(blocked,true,'Independent contender must actually wait on a database lock');
 holder.write('commit;\n');holder.child.stdin.end();
 assert.equal((await holder.done).code,0);
 const outcome=await second.done;
 if(expectedPattern){assert.notEqual(outcome.code,0);assert.match(outcome.err,expectedPattern);}
 else assert.equal(outcome.code,0,outcome.err);
}
await race("insert into event_materials(id,organization_id,event_id,asset_id)values(gen_random_uuid(),'"+org+"','"+event+"','"+asset+"');",
 "insert into project_materials(organization_id,project_id,asset_id,name,starts_at,ends_at,created_by)values('"+org+"','"+project+"','"+asset+"','TESTFIXTURE','2026-11-01T11:00Z','2026-11-01T13:00Z','"+actor+"');",/asset_already_reserved/);
await sql("update event_materials set status='returned';");
const insertLink=(entity,label,url)=>"insert into record_links(organization_id,entity_type,entity_id,label,url,created_by)values('"+org+"','project','"+entity+"','"+label+"','"+url+"','"+actor+"');";
await race(insertLink(project,'TESTFIXTURE A','https://docs.google.com/document/d/concurrent-doc/edit'),insertLink(event,'TESTFIXTURE B','https://drive.google.com/file/d/concurrent-doc/view'),null);
assert.equal(await sql("select count(*) from document_registry where canonical_url='https://drive.google.com/file/d/concurrent-doc'"),'1');
console.log('Two independent-session checks passed: reservation serialization and canonical document deduplication.');
