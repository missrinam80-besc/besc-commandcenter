import test, { before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { f1Database, q, j } from './helpers/f1-database.mts';

let f: Awaited<ReturnType<typeof f1Database>>;
let post: string;
before(async () => { f = await f1Database(); });
after(async () => { await f?.db.close(); });
beforeEach(async () => {
  await f.owner(); await f.db.exec('begin'); post = randomUUID();
  await f.db.exec(`update public.organization_members set finance_role='approver' where user_id=${q(f.ids.chair)} and organization_id=${q(f.ids.org)}`);
  await f.actor(f.ids.admin);
  await f.db.exec(`insert into public.social_posts(id,organization_id,title,copy,created_by) values(${q(post)},${q(f.ids.org)},'TESTFIXTURE - NIET PUBLICEREN','Fictieve versie 1',${q(f.ids.admin)})`);
});
afterEach(async () => { await f.db.exec('rollback'); await f.owner(); });

async function denied(sql: string, pattern = /social_review|row-level security|permission denied/i) {
  await f.db.exec('savepoint rejected_write');
  try { await assert.rejects(() => f.db.exec(sql), pattern); }
  finally { await f.db.exec('rollback to savepoint rejected_write; release savepoint rejected_write'); }
}
async function submit() {
  const id = randomUUID();
  await f.db.exec(`insert into public.approval_requests(id,organization_id,entity_type,entity_id,title,module,source_href,requested_by)
    values(${q(id)},${q(f.ids.org)},'social',${q(post)},'Untrusted client title','content','/app/other',${q(f.ids.admin)})`);
  return id;
}
async function decide(id: string, status = 'approved', note: string | null = null) {
  await f.db.exec(`update public.approval_requests set status=${q(status)},decided_by=${q(f.ids.chair)},decision_note=${note === null ? 'null' : q(note)} where id=${q(id)}`);
}
async function status() { return (await f.db.query<{status: string}>(`select status from public.social_posts where id=${q(post)}`)).rows[0].status; }
async function variant() {
  const id = randomUUID();
  await f.db.exec(`insert into public.social_post_variants(id,organization_id,social_post_id,platform,copy,created_by) values(${q(id)},${q(f.ids.org)},${q(post)},'Facebook','Fictieve kanaaltekst',${q(f.ids.admin)})`);
  return id;
}

test('submission captures canonical source and variants, enters review and preserves audit', async () => {
  const v = await variant(); const id = await submit();
  const row = (await f.db.query<{title:string;module:string;source_href:string;source_snapshot:{post:{copy:string};variants:{id:string}[]}}>(`select * from public.approval_requests where id=${q(id)}`)).rows[0];
  assert.equal(row.title, 'TESTFIXTURE - NIET PUBLICEREN'); assert.equal(row.module, 'social'); assert.equal(row.source_href, `/app/social/${post}`);
  assert.equal(row.source_snapshot.post.copy, 'Fictieve versie 1'); assert.equal(row.source_snapshot.variants[0].id, v); assert.equal(await status(),'review');
  const audit = (await f.db.query<{actor_id:string}>(`select actor_id from public.audit_log where entity_type='approval_requests' and entity_id=${q(id)}`)).rows;
  assert.deepEqual(audit.map(r=>r.actor_id),[f.ids.admin]);
});
test('direct status changes and dossier RPC cannot bypass approval', async () => {
  for (const state of ['approved','scheduled','published']) await denied(`update public.social_posts set status=${q(state)} where id=${q(post)}`,/approval_required/);
  const base = (await f.db.query<{record:unknown}>(`select to_jsonb(s) record from public.social_posts s where id=${q(post)}`)).rows[0].record;
  await denied(`select public.save_dossier_bundle(${q(f.ids.org)},${j({kind:'social',root:{id:post,new:false,base,values:{status:'approved'}},parts:[]})})`,/approval_required/);
});
test('requester cannot self-approve or forge decision identity through direct SQL', async () => {
  const id=await submit();
  await denied(`update public.approval_requests set status='approved',decided_by=${q(f.ids.admin)} where id=${q(id)}`,/decision_denied/);
  await f.actor(f.ids.chair);
  await denied(`update public.approval_requests set status='approved',decided_by=${q(f.ids.admin)} where id=${q(id)}`,/decision_denied/);
  assert.equal(await status(),'review');
});
test('pending version cannot be edited, archived, deleted or have variants added/changed/deleted', async () => {
  const v=await variant(); await submit();
  for (const sql of [
    `update public.social_posts set copy='Other' where id=${q(post)}`,
    `update public.social_posts set status='archived' where id=${q(post)}`,
    `delete from public.social_posts where id=${q(post)}`,
    `update public.social_post_variants set copy='Other' where id=${q(v)}`,
    `delete from public.social_post_variants where id=${q(v)}`,
    `insert into public.social_post_variants(organization_id,social_post_id,platform,created_by) values(${q(f.ids.org)},${q(post)},'X',${q(f.ids.admin)})`,
  ]) await denied(sql,/pending/);
});
test('another authorized reviewer decides atomically and can register a planned status without publishing', async () => {
  const id=await submit(); await f.actor(f.ids.chair); await decide(id);
  assert.equal(await status(),'approved');
  await f.db.exec(`update public.social_posts set status='scheduled' where id=${q(post)}`);
  assert.equal(await status(),'scheduled');
  const rows=(await f.db.query<{status:string;actor_id:string}>(`select new_status status,actor_id from public.audit_log where entity_type='approval_requests' and entity_id=${q(id)} order by created_at,id`)).rows;
  assert.ok(rows.some(r=>r.status==='approved' && r.actor_id===f.ids.chair));
  const record=(await f.db.query<{publication_url:null}>(`select publication_url from public.social_posts where id=${q(post)}`)).rows[0]; assert.equal(record.publication_url,null);
});
test('changes and rejection require an explanation and preserve every resubmission round', async () => {
  const first=await submit(); await f.actor(f.ids.chair);
  await denied(`update public.approval_requests set status='changes_requested',decided_by=${q(f.ids.chair)} where id=${q(first)}`,/note_required/);
  await decide(first,'changes_requested','Tekst aanpassen'); await f.actor(f.ids.admin);
  await f.db.exec(`update public.social_posts set copy='Fictieve versie 2' where id=${q(post)}`);
  const second=await submit(); await f.actor(f.ids.chair); await decide(second,'rejected','Nog niet geschikt');
  await f.actor(f.ids.admin); const third=await submit();
  const rows=(await f.db.query<{id:string;status:string;source_snapshot:{post:{copy:string}}}>(`select id,status,source_snapshot from public.approval_requests where entity_id=${q(post)} order by requested_at`)).rows;
  assert.deepEqual(rows.map(r=>r.id),[first,second,third]); assert.deepEqual(rows.map(r=>r.status),['changes_requested','rejected','pending']);
  assert.equal(rows[0].source_snapshot.post.copy,'Fictieve versie 1'); assert.equal(rows[2].source_snapshot.post.copy,'Fictieve versie 2');
});
test('approved content edits invalidate current approval and require another round', async () => {
  const id=await submit(); await f.actor(f.ids.chair); await decide(id); await f.actor(f.ids.admin);
  await f.db.exec(`update public.social_posts set copy='Fictieve versie 2' where id=${q(post)}`);
  assert.equal(await status(),'review');
  await denied(`update public.social_posts set status='approved' where id=${q(post)}`,/approval_required/);
  await f.db.exec(`update public.social_posts set copy='Fictieve versie 1' where id=${q(post)}`);
  await denied(`update public.social_posts set status='approved' where id=${q(post)}`,/approval_required/);
  await denied(`update public.social_posts set review_version=0 where id=${q(post)}`,/version_immutable/);
  await submit();
  assert.equal((await f.db.query<{status:string}>(`select status from public.approval_requests where id=${q(id)}`)).rows[0].status,'approved');
});
test('approved variant edits and removal invalidate the bundle', async () => {
  const v=await variant(); const id=await submit(); await f.actor(f.ids.chair); await decide(id);
  await f.db.exec(`update public.social_post_variants set copy='Gewijzigde variant' where id=${q(v)}`);
  assert.equal(await status(),'review');
  await denied(`update public.social_posts set status='approved' where id=${q(post)}`,/approval_required/);
  await f.actor(f.ids.admin); const next=await submit(); await f.actor(f.ids.chair); await decide(next); await f.db.exec(`delete from public.social_post_variants where id=${q(v)}`);
  assert.equal(await status(),'review');
});
test('completed rounds and snapshots cannot be overwritten or converted into another approval type', async () => {
  const id=await submit();
  await f.actor(f.ids.chair);
  await denied(`update public.approval_requests set source_snapshot='{}'::jsonb where id=${q(id)}`,/immutable/);
  await denied(`update public.approval_requests set entity_type='content' where id=${q(id)}`,/immutable/);
  await decide(id);
  await denied(`update public.approval_requests set decision_note='Rewritten history' where id=${q(id)}`,/immutable/);
});
test('volunteer, other organization and revoked reviewer cannot decide', async () => {
  const id=await submit();
  for(const actor of [f.ids.volunteer,f.ids.other]) {
    await f.actor(actor);
    const update=await f.db.query(`update public.approval_requests set status='approved',decided_by=${q(actor)} where id=${q(id)} returning id`);
    assert.equal(update.rows.length,0);
  }
  await f.owner(); await f.db.exec(`update public.organization_members set status='suspended' where user_id=${q(f.ids.chair)} and organization_id=${q(f.ids.org)}`);
  await f.actor(f.ids.chair);
  const update=await f.db.query(`update public.approval_requests set status='approved',decided_by=${q(f.ids.chair)} where id=${q(id)} returning id`);
  assert.equal(update.rows.length,0);
});
test('volunteer cannot submit social approval and foreign or archived sources are rejected', async () => {
  await f.actor(f.ids.volunteer);
  await denied(`insert into public.approval_requests(organization_id,entity_type,entity_id,title,module,source_href,requested_by) values(${q(f.ids.org)},'social',${q(post)},'TESTFIXTURE','social','/app/social/x',${q(f.ids.volunteer)})`,/submit_denied|source_unavailable/);
  await f.actor(f.ids.admin); await f.db.exec(`update public.social_posts set status='archived' where id=${q(post)}`);
  await assert.rejects(submit,/source_unavailable/);
});
test('foreign source, forged initial approval and protected variants cannot enter through inserts', async () => {
  await denied(`insert into public.approval_requests(organization_id,entity_type,entity_id,title,module,source_href,requested_by)
    values(${q(f.ids.otherOrg)},'social',${q(post)},'TESTFIXTURE','social','/app/social/x',${q(f.ids.admin)})`,/source_unavailable|row-level security/);
  await denied(`insert into public.approval_requests(organization_id,entity_type,entity_id,title,module,source_href,requested_by,status)
    values(${q(f.ids.org)},'social',${q(post)},'TESTFIXTURE','social','/app/social/x',${q(f.ids.admin)},'approved')`,/submit_denied/);
  await denied(`insert into public.social_posts(organization_id,title,status,created_by) values(${q(f.ids.org)},'TESTFIXTURE','approved',${q(f.ids.admin)})`,/approval_required/);
  await denied(`insert into public.social_post_variants(organization_id,social_post_id,platform,status,created_by) values(${q(f.ids.org)},${q(post)},'Facebook','approved',${q(f.ids.admin)})`,/approval_required/);
});
test('one pending request per post; stale snapshot and repeated decisions cannot be accepted', async () => {
  const id=await submit();
  await f.db.exec('savepoint duplicate');await assert.rejects(submit,/duplicate key/);await f.db.exec('rollback to savepoint duplicate');
  await f.owner();
  // Simulate an out-of-band repair bypassing the application guards.
  await f.db.exec(`alter table public.social_posts disable trigger social_review_source_guard;update public.social_posts set copy='Out of band' where id=${q(post)};alter table public.social_posts enable trigger social_review_source_guard`);
  await f.actor(f.ids.chair);
  await denied(`update public.approval_requests set status='approved',decided_by=${q(f.ids.chair)} where id=${q(id)}`,/source_changed/);
  assert.equal(await status(),'review');
});
test('new review functions preserve invoker rights and expose no anonymous execution', async () => {
  await f.owner();
  const rows=(await f.db.query<{proname:string;prosecdef:boolean;anon:boolean}>(`select p.proname,p.prosecdef,has_function_privilege('anon',p.oid,'execute') anon from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname in ('social_review_snapshot','guard_social_approval','sync_social_approval','guard_social_review_source','guard_social_review_variant')`)).rows;
  assert.equal(rows.length,5);for(const row of rows){assert.equal(row.prosecdef,false,row.proname);assert.equal(row.anon,false,row.proname);}
});
