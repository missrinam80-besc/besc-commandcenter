import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {PGlite} from "@electric-sql/pglite";
const actor='10000000-0000-4000-8000-000000000001',candidate='10000000-0000-4000-8000-000000000002',outsider='10000000-0000-4000-8000-000000000003';
const org='20000000-0000-4000-8000-000000000001',other='20000000-0000-4000-8000-000000000002',project='30000000-0000-4000-8000-000000000001';
test('Postgres-bundel rolt taak, toewijzing, checklist, koppeling en audit samen terug',async()=>{const db=new PGlite();try{
 await db.exec(`create role authenticated;create role anon;create schema auth;create schema private;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,private to authenticated;
 create type public.priority_level as enum('low','normal','high','urgent');
 create table public.organization_members(organization_id uuid,user_id uuid,status text);
 create table public.projects(id uuid primary key,organization_id uuid,deleted_at timestamptz);
 create table public.tasks(id uuid primary key default gen_random_uuid(),organization_id uuid,title text,description text,priority public.priority_level,due_at timestamptz,project_id uuid,created_by uuid,deleted_at timestamptz);
 create table public.task_assignees(task_id uuid references public.tasks(id),user_id uuid,primary key(task_id,user_id));
 create table public.task_checklist_items(id uuid default gen_random_uuid(),task_id uuid references public.tasks(id),title text,position integer,created_by uuid);
 create table public.record_relationships(id uuid default gen_random_uuid(),organization_id uuid,source_type text,source_id uuid,target_type text,target_id uuid,relationship_type text,created_by uuid);
 create table public.fixture_audit(task_id uuid);
 create function private.is_active_member(org_id uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.organization_members where organization_id=org_id and user_id=auth.uid() and status='active')$$;
 grant execute on function private.is_active_member(uuid) to authenticated;
 grant select,insert,update on public.tasks to authenticated;grant select,insert,delete on public.task_assignees to authenticated;
 grant select,insert on public.task_checklist_items,public.record_relationships,public.fixture_audit to authenticated;grant select on public.projects,public.organization_members to authenticated;
 alter table public.tasks enable row level security;alter table public.projects enable row level security;alter table public.organization_members enable row level security;alter table public.task_assignees enable row level security;alter table public.task_checklist_items enable row level security;alter table public.record_relationships enable row level security;
 create policy member_read on public.organization_members for select to authenticated using(private.is_active_member(organization_id));
 create policy project_read on public.projects for select to authenticated using(private.is_active_member(organization_id));
 create policy task_read on public.tasks for select to authenticated using(private.is_active_member(organization_id));
 create policy task_insert on public.tasks for insert to authenticated with check(private.is_active_member(organization_id) and created_by=auth.uid());
 create policy task_update on public.tasks for update to authenticated using(private.is_active_member(organization_id)) with check(private.is_active_member(organization_id));
 create policy assignee_read on public.task_assignees for select to authenticated using(exists(select 1 from public.tasks t where t.id=task_id and private.is_active_member(t.organization_id)));
 create policy assignee_insert on public.task_assignees for insert to authenticated with check(exists(select 1 from public.tasks t where t.id=task_id and private.is_active_member(t.organization_id)));
 create policy assignee_delete on public.task_assignees for delete to authenticated using(exists(select 1 from public.tasks t where t.id=task_id and private.is_active_member(t.organization_id)));
 create policy checklist_read on public.task_checklist_items for select to authenticated using(exists(select 1 from public.tasks t where t.id=task_id and private.is_active_member(t.organization_id)));
 create policy checklist_insert on public.task_checklist_items for insert to authenticated with check(created_by=auth.uid() and exists(select 1 from public.tasks t where t.id=task_id and private.is_active_member(t.organization_id)));
 create policy relation_read on public.record_relationships for select to authenticated using(private.is_active_member(organization_id));
 create policy relation_insert on public.record_relationships for insert to authenticated with check(created_by=auth.uid() and private.is_active_member(organization_id) and auth.uid()='${actor}');
 create function public.fixture_audit_task() returns trigger language plpgsql as $$begin insert into public.fixture_audit values(new.id);return new;end$$;
 create trigger fixture_audit after insert on public.tasks for each row execute function public.fixture_audit_task();
 insert into public.organization_members values('${org}','${actor}','active'),('${org}','${candidate}','active'),('${other}','${outsider}','active');
 insert into public.projects values('${project}','${org}',null);
 `);
 for(const file of ['20261006185257_atomic_task_assignment.sql','20261006192630_atomic_task_create.sql'])await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8'));
 await db.exec(`set role authenticated;set request.jwt.claim.sub='${actor}';`);
 const call=(overrides:Partial<{organization:string;assignee:string|null;checklist:string[];context:string|null;contextId:string|null;projectId:string|null}>={})=>{const o={organization:org,assignee:candidate,checklist:['Eerste','Tweede'],context:'project',contextId:project,projectId:project,...overrides};return db.query<{id:string}>(`select public.create_task_bundle($1,'Fixture','Beschrijving','normal',null,$2,$3,$4,$5,$6) as id`,[o.organization,o.projectId,o.assignee,o.checklist,o.context,o.contextId]);};
 const counts=async()=> (await db.query(`select (select count(*) from public.tasks) as tasks,(select count(*) from public.task_assignees) as assignees,(select count(*) from public.task_checklist_items) as checklist,(select count(*) from public.record_relationships) as relationships,(select count(*) from public.fixture_audit) as audit`)).rows;
 const success=await call();assert(success.rows[0].id);const before=await counts();assert.deepEqual(before,[{tasks:1,assignees:1,checklist:2,relationships:1,audit:1}]);
 for(const args of [{assignee:outsider},{projectId:outsider},{contextId:outsider},{context:'unsupported'},{contextId:null},{checklist:['x'.repeat(241)]},{organization:other}]){await assert.rejects(call(args));assert.deepEqual(await counts(),before);}
 await db.exec(`reset role;create function public.fixture_reject() returns trigger language plpgsql as $$begin raise exception 'fixture write failure';end$$;set role authenticated;`);
 for(const table of ['task_assignees','task_checklist_items','record_relationships']){
 await db.exec(`reset role;create trigger reject_fixture before insert on public.${table} for each row execute function public.fixture_reject();set role authenticated;`);
 await assert.rejects(call(),/fixture write failure/);assert.deepEqual(await counts(),before);
 await db.exec(`reset role;drop trigger reject_fixture on public.${table};set role authenticated;`);
 }
 await db.exec(`reset role;create function public.fixture_skip() returns trigger language plpgsql as $$begin return null;end$$;set role authenticated;`);
 for(const table of ['tasks','task_assignees','task_checklist_items','record_relationships']){
 await db.exec(`reset role;create trigger skip_fixture before insert on public.${table} for each row execute function public.fixture_skip();set role authenticated;`);
 await assert.rejects(call());assert.deepEqual(await counts(),before);
 await db.exec(`reset role;drop trigger skip_fixture on public.${table};set role authenticated;`);
 }
 await db.exec(`reset role;alter policy relation_insert on public.record_relationships with check(false);set role authenticated;`);
 await assert.rejects(call());assert.deepEqual(await counts(),before);
 await call({assignee:null,checklist:[],context:null,contextId:null,projectId:null});
 assert.deepEqual(await counts(),[{tasks:2,assignees:1,checklist:2,relationships:1,audit:2}]);
 await db.exec(`reset role;update public.organization_members set status='inactive' where user_id='${actor}';set role authenticated;`);await assert.rejects(call());
 await db.exec('reset role');assert.equal((await db.query<{safe:boolean}>(`select not p.prosecdef and has_function_privilege('authenticated',p.oid,'EXECUTE') and not has_function_privilege('anon',p.oid,'EXECUTE') as safe from pg_proc p where proname='create_task_bundle'`)).rows[0].safe,true);
 }finally{await db.close();}});
