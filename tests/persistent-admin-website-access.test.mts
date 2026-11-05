import test,{before,after,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {f1Database,q,j} from './helpers/f1-database.mts';
let f:Awaited<ReturnType<typeof f1Database>>,site:string;
const sessions=new Map<string,string>();
async function actor(id=f.ids.admin){await f.owner();await f.actor(id);await f.db.exec(`select set_config('request.jwt.claims',${j({sub:id,role:'authenticated',session_id:sessions.get(id)})}::text,false)`);}
async function grant(id=f.ids.admin){await f.owner();await f.db.exec(`insert into private.publication_admin_access(organization_id,site_id,user_id,basis,created_by) values(${q(f.ids.org)},${q(site)},${q(id)},'TESTFIXTURE explicit grant',${q(f.ids.chair)})`);}
async function read(){return (await f.db.query<{items:unknown[]}>(`select public.f2_publications(${q(site)},'news') items`)).rows[0].items;}
async function denied(sql=`select public.f2_publications(${q(site)},'news')`){await f.db.exec('savepoint denied');await assert.rejects(f.db.exec(sql),/f2_not_authorized|permission denied/);await f.db.exec('rollback to denied');}
before(async()=>{
 f=await f1Database();await f.owner();site=randomUUID();
 await f.db.exec(`insert into public.publication_sites(id,organization_id,host,active,key_sha256,created_by) values(${q(site)},${q(f.ids.org)},'website-dev.belgianstreamerscommunity.be',true,repeat('a',64),${q(f.ids.chair)})`);
 for(const id of [f.ids.admin,f.ids.member]){const sid=randomUUID();sessions.set(id,sid);await f.db.exec(`update auth.users set email_confirmed_at=clock_timestamp() where id=${q(id)};insert into auth.sessions(id,user_id) values(${q(sid)},${q(id)})`);}
});
after(async()=>{await f?.db.close();});
beforeEach(async()=>{await f.owner();await f.db.exec('begin');});
afterEach(async()=>{await f.db.exec('rollback');await f.owner();});

test('Permanent website access requires an explicit site-scoped grant, even for admins',async()=>{await actor();await denied();await grant();await actor();assert.deepEqual(await read(),[]);});
test('Permanent grant survives expiry of the independent temporary tester grant',async()=>{
 await grant();await f.db.exec(`insert into public.publication_site_viewers(organization_id,site_id,user_id,eligibility,basis,created_at,valid_until,created_by) values(${q(f.ids.org)},${q(site)},${q(f.ids.admin)},'crew','TESTFIXTURE expired',clock_timestamp()-interval '2 days',clock_timestamp()-interval '1 day',${q(f.ids.chair)})`);await actor();assert.deepEqual(await read(),[]);
});
test('Loss of admin role, inactive membership, closed site or explicit revocation stops permanent access',async()=>{
 await grant();
 for(const change of [`update public.organization_members set role='member' where user_id=${q(f.ids.admin)}`,`update public.organization_members set status='suspended' where user_id=${q(f.ids.admin)}`,`update public.publication_sites set active=false where id=${q(site)}`,`update private.publication_admin_access set revoked_at=clock_timestamp()`]){
  await f.owner();await f.db.exec('savepoint changed');await f.db.exec(change);await actor();await denied();await f.owner();await f.db.exec('rollback to changed');
 }
});
test('Unconfirmed, banned, deleted accounts and revoked sessions retain the existing fences',async()=>{
 await grant();
 for(const change of [`update auth.users set email_confirmed_at=null where id=${q(f.ids.admin)}`,`update auth.users set banned_until=clock_timestamp()+interval '1 hour' where id=${q(f.ids.admin)}`,`update auth.users set deleted_at=clock_timestamp() where id=${q(f.ids.admin)}`,`delete from auth.sessions where user_id=${q(f.ids.admin)}`]){
  await f.owner();await f.db.exec('savepoint changed');await f.db.exec(change);await actor();await denied();await f.owner();await f.db.exec('rollback to changed');
 }
});
test('Grant alone cannot authorize a non-admin, another account or another organization',async()=>{
 await grant(f.ids.member);await actor(f.ids.member);await denied();await grant();await actor(f.ids.member);await denied();
 await f.owner();await f.db.exec(`update public.organization_members set organization_id=${q(f.ids.otherOrg)} where user_id=${q(f.ids.admin)}`);await actor();await denied();
});
test('Browser and server roles cannot read, mint or modify permanent grants',async()=>{
 await grant();
 for(const role of ['authenticated','anon','service_role']){await f.owner();await f.db.exec(`set role ${role}`);await denied('select * from private.publication_admin_access');await denied(`update private.publication_admin_access set revoked_at=null`);}
});
