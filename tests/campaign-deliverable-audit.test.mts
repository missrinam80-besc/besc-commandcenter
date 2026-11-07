import test,{before,after,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {f1Database,q,j} from './helpers/f1-database.mts';
let f:Awaited<ReturnType<typeof f1Database>>,campaign:string,child:string;
before(async()=>{f=await f1Database();});
after(async()=>{await f?.db.close();});
beforeEach(async()=>{await f.owner();await f.db.exec('begin');campaign=randomUUID();child=randomUUID();await f.actor(f.ids.admin);await f.db.exec(`insert into public.campaigns(id,organization_id,title,created_by) values(${q(campaign)},${q(f.ids.org)},'TESTFIXTURE - NIET PUBLICEREN',${q(f.ids.admin)})`);});
afterEach(async()=>{await f.db.exec('rollback');await f.owner();});
async function add(id=child,createdBy=f.ids.admin){await f.db.exec(`insert into public.campaign_deliverables(id,organization_id,campaign_id,title,notes,created_by) values(${q(id)},${q(f.ids.org)},${q(campaign)},'TESTFIXTURE oplevering','PRIVATE FIXTURE NOTES',${q(createdBy)})`);}
async function events(id=child){return (await f.db.query<{action:string;actor_id:string;entity_label:string;changed_fields:string[];previous_status:string|null;new_status:string|null;metadata:Record<string,unknown>;created_at:unknown}>(`select * from public.audit_log where entity_type='campaign_deliverables' and entity_id=${q(id)} order by created_at,id`)).rows;}
async function denied(sql:string,pattern=/permission denied|row-level security|fixture_audit_failure/){await f.db.exec('savepoint forbidden');try{await assert.rejects(()=>f.db.exec(sql),pattern);}finally{await f.db.exec('rollback to savepoint forbidden;release savepoint forbidden');}}
async function row(table:string,id:string){return (await f.db.query<{v:Record<string,unknown>}>(`select to_jsonb(t) v from public.${table} t where id=${q(id)}`)).rows[0].v;}
function bundle(parts:unknown[],base:unknown,values:Record<string,unknown>={}){return `select public.save_dossier_bundle(${q(f.ids.org)},${j({kind:'campaign',root:{id:campaign,new:false,base,values},parts})})`;}

test('creation records actual actor, timestamp, label and parent, without copying notes',async()=>{
 await add(child,f.ids.volunteer);const [event]=await events();assert.equal(event.action,'created');assert.equal(event.actor_id,f.ids.admin);assert.equal(event.entity_label,'TESTFIXTURE oplevering');assert.equal(event.previous_status,null);assert.equal(event.new_status,'todo');assert.equal(event.metadata.campaign_id,campaign);assert.ok(event.created_at);assert.equal((await events()).length,1);assert.ok(!JSON.stringify(event.metadata).includes('PRIVATE FIXTURE NOTES'));
});
test('successive states preserve each actual actor and previous/new status',async()=>{
 await add();await f.actor(f.ids.chair);await f.db.exec(`update public.campaign_deliverables set status='doing' where id=${q(child)}`);await f.actor(f.ids.admin);await f.db.exec(`update public.campaign_deliverables set status='completed' where id=${q(child)}`);
 const rows=await events();assert.equal(rows.length,3);const chain=['todo','doing','completed'].map(status=>rows.find(r=>r.new_status===status)!);assert.deepEqual(chain.map(r=>[r.previous_status,r.new_status]),[[null,'todo'],['todo','doing'],['doing','completed']]);assert.deepEqual(chain.map(r=>r.actor_id),[f.ids.admin,f.ids.chair,f.ids.admin]);assert.deepEqual(chain[1].changed_fields,['status']);
});
test('approval changes are captured in the same event with bounded metadata',async()=>{
 await add();await f.db.exec(`update public.campaign_deliverables set status='review',approval_status='pending' where id=${q(child)}`);const rows=await events();assert.equal(rows.length,2);const changed=rows.find(r=>r.action==='updated')!;assert.deepEqual(changed.changed_fields,['approval_status','status']);assert.equal(changed.metadata.previous_approval_status,'not_required');assert.equal(changed.metadata.new_approval_status,'pending');
});
test('a repeated save or timestamp-only update creates no fictitious status event',async()=>{
 await add();await f.db.exec(`update public.campaign_deliverables set status='todo',updated_at=clock_timestamp() where id=${q(child)}`);assert.equal((await events()).length,1);
});
test('unified dossier creation and editing use the same audit boundary',async()=>{
 const base=await row('campaigns',campaign);
 await f.db.exec(bundle([{collection:'campaign_deliverables',id:child,new:true,base:null,values:{title:'TESTFIXTURE editor',status:'todo'}}],base));
 await f.db.exec(bundle([{collection:'campaign_deliverables',id:child,new:false,base:await row('campaign_deliverables',child),values:{status:'doing'}}],await row('campaigns',campaign)));
 const history=await events();assert.equal(history.length,2);assert.equal(history.find(r=>r.new_status==='doing')?.previous_status,'todo');
});
test('audit failure rolls back the entire dossier write, including an earlier child and parent edit',async()=>{
 await add();const second=randomUUID();await add(second);const parent=await row('campaigns',campaign);const first=await row('campaign_deliverables',child),other=await row('campaign_deliverables',second);
 await f.owner();await f.db.exec("create function private.fixture_audit_failure() returns trigger language plpgsql set search_path='' as $$begin if new.entity_type='campaign_deliverables' and new.new_status='blocked' then raise exception 'fixture_audit_failure';end if;return new;end$$;create trigger fixture_audit_failure before insert on public.audit_log for each row execute function private.fixture_audit_failure();");await f.actor(f.ids.admin);
 await denied(bundle([{collection:'campaign_deliverables',id:child,new:false,base:first,values:{status:'doing'}},{collection:'campaign_deliverables',id:second,new:false,base:other,values:{status:'blocked'}}],parent,{notes:'TESTFIXTURE must roll back'}));
 assert.equal((await row('campaign_deliverables',child)).status,'todo');assert.equal((await row('campaign_deliverables',second)).status,'todo');assert.equal((await row('campaigns',campaign)).notes,null);assert.equal((await events()).length,1);assert.equal((await events(second)).length,1);
});
test('volunteers and foreign-organization managers cannot create history through unauthorized writes',async()=>{
 await add();for(const actor of [f.ids.volunteer,f.ids.other]){await f.actor(actor);const result=await f.db.query(`update public.campaign_deliverables set status='completed' where id=${q(child)} returning id`);assert.equal(result.rows.length,0);}
 await f.actor(f.ids.volunteer);await denied(`insert into public.campaign_deliverables(organization_id,campaign_id,title,created_by) values(${q(f.ids.org)},${q(campaign)},'TESTFIXTURE denied',${q(f.ids.volunteer)})`);
 await f.actor(f.ids.admin);assert.equal((await events()).length,1);
});
test('clients cannot forge, overwrite or delete audit rows and foreign managers cannot read them',async()=>{
 await add();const id=(await f.db.query<{id:string}>(`select id from public.audit_log where entity_type='campaign_deliverables' and entity_id=${q(child)}`)).rows[0].id;
 await denied(`update public.audit_log set new_status='approved' where id=${q(id)}`);await denied(`delete from public.audit_log where id=${q(id)}`);
 await denied(`insert into public.audit_log(organization_id,entity_type,entity_id,action) values(${q(f.ids.org)},'campaign_deliverables',${q(child)},'updated')`);
 await f.actor(f.ids.other);assert.equal((await events()).length,0);
});
test('deletion retains the final status and parent reference without overwriting previous events',async()=>{
 await add();await f.db.exec(`delete from public.campaign_deliverables where id=${q(child)}`);const rows=await events();assert.equal(rows.length,2);const removed=rows.find(r=>r.action==='deleted')!;assert.equal(removed.previous_status,'todo');assert.equal(removed.new_status,null);assert.equal(removed.metadata.campaign_id,campaign);
});
test('installing the fix preserves existing records, policies and generic audit code without backfilling history',async()=>{
 await f.owner();await f.db.exec('drop trigger campaign_deliverable_audit on public.campaign_deliverables;drop function private.log_campaign_deliverable_change();');await f.actor(f.ids.admin);await add();await f.db.exec(`update public.campaign_deliverables set status='completed' where id=${q(child)}`);assert.equal((await events()).length,0);
 await f.owner();const previous=await row('campaign_deliverables',child);const policies=(await f.db.query("select * from pg_policies where schemaname='public' and tablename in ('campaign_deliverables','audit_log') order by tablename,policyname")).rows;
 const generic=(await f.db.query<{v:string}>("select pg_get_functiondef('private.log_organization_change()'::regprocedure) v")).rows[0].v;
 await f.db.exec(await readFile(new URL('../supabase/migrations/20261107001527_campaign_deliverable_history.sql',import.meta.url),'utf8'));
 assert.deepEqual(await row('campaign_deliverables',child),previous);assert.deepEqual((await f.db.query("select * from pg_policies where schemaname='public' and tablename in ('campaign_deliverables','audit_log') order by tablename,policyname")).rows,policies);assert.equal((await f.db.query<{v:string}>("select pg_get_functiondef('private.log_organization_change()'::regprocedure) v")).rows[0].v,generic);
 await f.actor(f.ids.admin);assert.equal((await events()).length,0);await f.db.exec(`update public.campaign_deliverables set status='doing' where id=${q(child)}`);const [event]=await events();assert.equal(event.previous_status,'completed');assert.equal(event.new_status,'doing');
});
test('the private definer is fixed to audit appends and has no direct client execution grants',async()=>{
 await f.owner();const result=(await f.db.query<{definer:boolean;config:string[];anon:boolean;authenticated:boolean;service:boolean}>("select prosecdef definer,proconfig config,has_function_privilege('anon',oid,'execute') anon,has_function_privilege('authenticated',oid,'execute') authenticated,has_function_privilege('service_role',oid,'execute') service from pg_proc where oid='private.log_campaign_deliverable_change()'::regprocedure")).rows[0];assert.equal(result.definer,true);assert.ok(result.config.includes('search_path=""'));assert.equal(result.anon,false);assert.equal(result.authenticated,false);assert.equal(result.service,false);
});
