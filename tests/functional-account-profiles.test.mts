import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {communityProfileTypes,isNaturalPersonContact} from '../src/lib/community-people.ts';
import {toPersonPickerOptions} from '../src/lib/person-picker.ts';
import {isActiveStreamTeamMember} from '../src/lib/reporting-scope.ts';

test('functionele accounts blijven contacten maar geen personen of streamteamleden',()=>{
 const base={id:'shared',display_name:'TESTFIXTURE functioneel',handle:null,discord_handle:null,community_person_roles:[{role:'volunteer'},{role:'streamteam'}]};
 const functional={...base,person_type:'functional_account'};
 assert.equal(communityProfileTypes.functional_account,'Functioneel account');
 assert.equal(isNaturalPersonContact(functional),false);
 assert.deepEqual(toPersonPickerOptions([functional,{...base,id:'human',person_type:'crew'}]).map(p=>p.id),['human']);
 assert.equal(isActiveStreamTeamMember({...functional,status:'active',roles:[{role:'streamteam'}]}),false);
 assert.equal(isActiveStreamTeamMember({person_type:'streamer',status:'active',roles:[{role:'streamteam'}]}),true);
});

test('migratie behoudt accounts en historie en bewaakt persoonskoppelingen onder RLS',async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema private;
   create function private.f1_lock() returns void language sql as $$select$$;
   create table public.profiles(id uuid primary key,display_name text);
   create table public.organization_members(organization_id uuid,user_id uuid,role text,status text);
   create table public.community_people(id uuid primary key,organization_id uuid,display_name text,person_type text not null check(person_type in('crew','streamer','creator','volunteer','moderator','guest','external')),account_user_id uuid);
   create table public.community_person_roles(person_id uuid,role text);
   create table public.audit_log(id uuid,actor_id uuid,description text);
   create table public.reward_accounts(user_id uuid,balance integer);
   insert into public.profiles values('20000000-0000-4000-8000-000000000001','TESTFIXTURE account');
   insert into public.organization_members values('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','volunteer','active');
   insert into public.community_people values
    ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','TESTFIXTURE gedeeld','volunteer','20000000-0000-4000-8000-000000000001'),
    ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','TESTFIXTURE persoon','crew',null);
   insert into public.community_person_roles values('30000000-0000-4000-8000-000000000001','volunteer');
   insert into public.reward_accounts values('20000000-0000-4000-8000-000000000001',42);
   insert into public.audit_log values('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Bestaande geschiedenis');`);
  const bindings=[['public','association_members','community_person_id'],['public','association_identity_verifications','person_id'],['public','consent_records','person_id'],['public','community_assignments','person_id'],['public','event_schedule_items','person_id'],['public','event_materials','responsible_person_id'],['public','event_giveaways','responsible_person_id'],['public','assets','owner_person_id'],['public','kpi_records','community_person_id'],['private','campaign_participants','person_id'],['private','creator_profiles','person_id']];
  for(const [schema,table,column]of bindings)await db.exec(`create table ${schema}.${table}(id uuid primary key default gen_random_uuid(),organization_id uuid,${column} uuid,notes text);`);
  const snapshot=async()=>{const result:Record<string,unknown[]>={};for(const t of ['profiles','organization_members','community_people','community_person_roles','audit_log','reward_accounts'])result[t]=(await db.query(`select * from public.${t}`)).rows;return result;};
  const before=await snapshot();
  await db.exec(readFileSync('supabase/migrations/20261026160127_functional_account_profiles.sql','utf8'));
  assert.deepEqual(await snapshot(),before,'Migration must not classify or alter existing records');
  await db.exec('begin isolation level repeatable read');
  await assert.rejects(db.query("update public.community_people set person_type='functional_account' where id='30000000-0000-4000-8000-000000000001'"),/functional_account_classification_requires_read_committed/);
  await db.exec('rollback');
  await db.exec(`update public.community_people set person_type='functional_account' where id='30000000-0000-4000-8000-000000000001';
   alter table public.community_people enable row level security;grant select on public.community_people to authenticated;
   create policy hidden_contacts on public.community_people for select to authenticated using(false);
   grant usage on schema private to authenticated;`);
  const org='10000000-0000-4000-8000-000000000001',shared='30000000-0000-4000-8000-000000000001',human='30000000-0000-4000-8000-000000000002';
  for(const [schema,table,column]of bindings){
   await db.exec(`grant select,insert,update on ${schema}.${table} to authenticated;set role authenticated;`);
   await assert.rejects(db.query(`insert into ${schema}.${table}(organization_id,${column}) values($1,$2)`,[org,shared]),/functional_account_not_a_person/);
   await assert.rejects(db.query(`insert into ${schema}.${table}(organization_id,${column}) values($1,$2)`,['10000000-0000-4000-8000-000000000002',shared]),/person_reference_unavailable/);
   await db.query(`insert into ${schema}.${table}(organization_id,${column}) values($1,$2)`,[org,human]);
   await db.exec('reset role;');
  }
  await assert.rejects(db.query('update public.community_people set person_type=$1 where id=$2',['functional_account',human]),/functional_account_has_person_bindings/);
  // Optional references stay optional and historical rows remain editable.
  await db.query('insert into public.event_schedule_items(organization_id,person_id,notes) values($1,null,$2)',[org,'Ongewijzigd zonder persoon']);
  await db.query('update public.community_assignments set notes=$1 where person_id=$2',['Historie behouden',human]);
  for(const role of ['anon','authenticated','service_role'])assert.equal((await db.query<{allowed:boolean}>(`select has_function_privilege($1,'private.guard_functional_person_reference()','EXECUTE') as allowed`,[role])).rows[0].allowed,false);
  const after=await snapshot();for(const t of ['profiles','organization_members','community_person_roles','audit_log','reward_accounts'])assert.deepEqual(after[t],before[t],t);
 }finally{await db.close();}
});
