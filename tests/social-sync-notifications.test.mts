import test,{before,after,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {f1Database,q} from './helpers/f1-database.mts';
let f:Awaited<ReturnType<typeof f1Database>>,account:string;
const at='2026-11-06T12:00:00Z';
before(async()=>{f=await f1Database();});
after(async()=>{await f?.db.close();});
beforeEach(async()=>{
 await f.owner();await f.db.exec('begin');account=randomUUID();
 await f.db.exec(`insert into public.social_accounts(id,organization_id,platform,account_name,status,sync_enabled,last_sync_at,created_by,created_at)
 values(${q(account)},${q(f.ids.org)},'youtube','TESTFIXTURE kanaal','connected',true,${q(at)},${q(f.ids.admin)},${q(at)})`);
 await f.actor(f.ids.admin);
});
afterEach(async()=>{await f.db.exec('rollback');await f.owner();});
async function run(status:string,time=at){await f.owner();await f.db.exec(`insert into public.social_sync_runs(organization_id,social_account_id,status,idempotency_key,created_at,finished_at,error_message)
 values(${q(f.ids.org)},${q(account)},${q(status)},${q(randomUUID())},${q(time)},${q(time)},'TESTFIXTURE confidential provider error must not be copied')`);await f.actor(f.ids.admin);}
async function refresh(time=at){return(await f.db.query<{n:number}>(`select public.refresh_social_sync_notifications(${q(time)}) n`)).rows[0].n;}
async function notices(){return(await f.db.query<{id:string;title:string;body:string;severity:string;read_at:string|null}>(`select id,title,body,severity,read_at from public.notifications where type='social_sync' order by created_at,id`)).rows;}
test('failure creates one personal warning, repeat reads do not duplicate and raw provider errors stay private',async()=>{
 await run('failed');assert.equal(await refresh(),1);assert.equal(await refresh(),0);const rows=await notices();assert.equal(rows.length,1);assert.match(rows[0].body,/mislukt/);assert.doesNotMatch(rows[0].body,/confidential/);assert.equal(rows[0].severity,'warning');
});
test('repeated failed attempts update one incident without resetting a read notification',async()=>{
 await run('failed');await refresh();const first=(await notices())[0];await f.db.exec(`update public.notifications set read_at=now() where id=${q(first.id)}`);
 await run('failed','2026-11-06T12:15:00Z');await refresh('2026-11-06T12:15:01Z');const rows=await notices();assert.equal(rows.length,1);assert.equal(rows[0].id,first.id);assert.ok(rows[0].read_at);
});
test('reconnecting without a new successful run does not falsely claim synchronization recovered',async()=>{
 await f.owner();await f.db.exec(`update public.social_accounts set status='expired' where id=${q(account)}`);await f.actor(f.ids.admin);await refresh();
 await f.owner();await f.db.exec(`update public.social_accounts set status='connected' where id=${q(account)}`);await f.actor(f.ids.admin);await refresh();const row=(await notices())[0];assert.doesNotMatch(row.title,/hersteld/);assert.match(row.body,/nog niet bevestigd/);
});
test('unauthenticated RPC and cross-organization incident state cannot be forged',async()=>{
 await f.owner();const otherAccount=randomUUID();await f.db.exec(`insert into public.social_accounts(id,organization_id,platform,account_name,created_by)values(${q(otherAccount)},${q(f.ids.otherOrg)},'youtube','TESTFIXTURE foreign',${q(f.ids.other)})`);await f.actor(f.ids.admin);
 await f.db.exec('savepoint denied');await assert.rejects(f.db.exec(`insert into private.social_sync_notification_state(organization_id,user_id,account_id,reason,opened_at)values(${q(f.ids.org)},${q(f.ids.admin)},${q(otherAccount)},'failed',now())`),/row-level security/);await f.db.exec('rollback to denied');
 await f.owner();await f.actor(f.ids.admin,'anon');await f.db.exec('savepoint denied');await assert.rejects(refresh(),/permission denied/);await f.db.exec('rollback to denied');
});
test('partial and expired states remain distinguishable while sharing one active incident',async()=>{
 await run('partial');await refresh();assert.match((await notices())[0].body,/gedeeltelijk/);
 await f.owner();await f.db.exec(`update public.social_accounts set status='expired' where id=${q(account)}`);await f.actor(f.ids.admin);await refresh();const rows=await notices();assert.equal(rows.length,1);assert.match(rows[0].body,/toegang is verlopen/);
});
test('overdue has a 30 minute grace period and a never-synchronized account uses creation time',async()=>{
 assert.equal(await refresh('2026-11-07T12:30:00Z'),0);assert.equal(await refresh('2026-11-07T12:30:01Z'),1);assert.match((await notices())[0].body,/te laat/);
 await f.owner();await f.db.exec(`delete from public.notifications where type='social_sync';delete from private.social_sync_notification_state;update public.social_accounts set last_sync_at=null where id=${q(account)}`);await f.actor(f.ids.admin);assert.equal(await refresh('2026-11-07T12:30:01Z'),1);
});
test('success resolves the same notification once and later failure opens a new incident',async()=>{
 await run('failed');await refresh();const first=(await notices())[0].id;
 await f.db.exec(`update public.notifications set read_at=now() where id=${q(first)}`);
 await run('succeeded','2026-11-06T12:15:00Z');await f.owner();await f.db.exec(`update public.social_accounts set last_sync_at='2026-11-06T12:15:00Z' where id=${q(account)}`);await f.actor(f.ids.admin);await refresh('2026-11-06T12:15:01Z');
 const recovered=(await notices())[0];assert.equal(recovered.id,first);assert.match(recovered.title,/hersteld/);assert.equal(recovered.severity,'info');assert.equal(recovered.read_at,null);
 await f.db.exec(`update public.notifications set read_at=now() where id=${q(first)}`);await refresh('2026-11-06T12:16:00Z');assert.ok((await notices())[0].read_at);
 await run('failed','2026-11-06T12:20:00Z');await refresh('2026-11-06T12:20:01Z');assert.equal((await notices()).length,2);
});
test('own opt-out suppresses warning creation without changing synchronization settings',async()=>{
 await f.db.exec(`insert into public.notification_preferences(organization_id,user_id,social_sync_notifications) values(${q(f.ids.org)},${q(f.ids.admin)},false) on conflict(organization_id,user_id) do update set social_sync_notifications=false`);
 await run('failed');assert.equal(await refresh(),0);assert.equal((await notices()).length,0);
});
test('member cannot generate social warnings or write incident state, and revoked manager cannot read historical warning',async()=>{
 await run('failed');await refresh();await f.actor(f.ids.member);assert.equal(await refresh(),0);assert.equal((await notices()).length,0);
 await f.db.exec('savepoint denied');await assert.rejects(f.db.exec(`insert into private.social_sync_notification_state(organization_id,user_id,account_id,reason,opened_at)values(${q(f.ids.org)},${q(f.ids.member)},${q(account)},'failed',now())`),/row-level security/);await f.db.exec('rollback to denied');
 await f.owner();await f.db.exec(`update public.organization_members set role='member' where user_id=${q(f.ids.admin)} and organization_id=${q(f.ids.org)}`);await f.actor(f.ids.admin);assert.equal((await notices()).length,0);
});
test('background reconciliation honors opt-out and inactive membership without touching channel state',async()=>{
 await run('failed');await f.owner();await f.db.exec(`insert into public.notification_preferences(organization_id,user_id,social_sync_notifications)values(${q(f.ids.org)},${q(f.ids.admin)},false) on conflict(organization_id,user_id) do update set social_sync_notifications=false;update public.organization_members set status='suspended' where organization_id=${q(f.ids.org)} and user_id=${q(f.ids.chair)};grant select on public.organization_members,public.social_accounts,public.social_sync_runs,public.notification_preferences to service_role;grant insert,select,update on public.notifications to service_role;grant usage on schema private to service_role;`);
 await f.actor(f.ids.admin,'service_role');await refresh();await f.owner();const rows=(await f.db.query<{user_id:string}>(`select user_id from public.notifications where type='social_sync' and dedupe_key like ${q('social-sync:'+account+':%')}`)).rows;assert.ok(rows.every(r=>r.user_id!==f.ids.admin&&r.user_id!==f.ids.chair));
 const channels=(await f.db.query<{status:string;last_sync_at:Date;sync_enabled:boolean}>(`select status,last_sync_at,sync_enabled from public.social_accounts where id=${q(account)}`)).rows;assert.equal(channels[0].status,'connected');assert.equal(channels[0].sync_enabled,true);assert.equal(new Date(channels[0].last_sync_at).toISOString(),new Date(at).toISOString());
});
test('service reconciliation reaches only active managers in the matching organization',async()=>{
 await run('failed');await f.owner();await f.db.exec(`grant select on public.organization_members,public.social_accounts,public.social_sync_runs,public.notification_preferences to service_role;grant insert,select,update on public.notifications to service_role;grant usage on schema private to service_role;`);
 await f.actor(f.ids.admin,'service_role');await refresh();await f.owner();const rows=(await f.db.query<{user_id:string;organization_id:string}>(`select user_id,organization_id from public.notifications where type='social_sync' and dedupe_key like ${q('social-sync:'+account+':%')}`)).rows;assert.ok(rows.some(r=>r.user_id===f.ids.admin));assert.ok(rows.some(r=>r.user_id===f.ids.chair));assert.ok(rows.every(r=>r.organization_id===f.ids.org&&![f.ids.member,f.ids.volunteer,f.ids.other].some(id=>id===r.user_id)));
});
test('disabled, removed or disconnected monitoring closes warning without claiming recovery',async()=>{
 await run('failed');await refresh();await f.owner();await f.db.exec(`update public.social_accounts set sync_enabled=false where id=${q(account)}`);await f.actor(f.ids.admin);await refresh();const rows=await notices();assert.equal(rows.length,1);assert.match(rows[0].title,/niet actief/);assert.doesNotMatch(rows[0].title,/hersteld/);assert.equal(rows[0].severity,'info');
});
