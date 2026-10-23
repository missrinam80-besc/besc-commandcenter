import test, { before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { f1Database, q, j } from './helpers/f1-database.mts';
let f: Awaited<ReturnType<typeof f1Database>>, campaign: string, second: string, participant: string, policy: string;
const sessions = new Map<string, string>();
async function actor(id: string) { await f.owner(); await f.actor(id); await f.db.exec(`select set_config('request.jwt.claims',${q(JSON.stringify({ sub: id, role: 'authenticated', session_id: sessions.get(id) }))},false)`); }
async function call(op: string, data: unknown = {}, req = randomUUID(), c = campaign, o = f.ids.org) { return (await f.db.query<{ v: { id: string } }>(`select public.f3_workflow(${q(o)},${q(c)},${q(op)},${j(data)},${q(req)}) v`)).rows[0].v; }
async function state(c = campaign) { return (await f.db.query<{ v: { posts: { id: string; revision: number; status: string }[]; measurements: unknown[]; participants: { valid: boolean }[] } }>(`select public.f3_campaign_state(${q(f.ids.org)},${q(c)}) v`)).rows[0].v; }
async function deny(op: string, data: unknown = {}, c = campaign) { await f.db.exec('savepoint denied'); await assert.rejects(call(op, data, randomUUID(), c)); await f.db.exec('rollback to denied'); }
before(async () => {
  f = await f1Database(); await f.owner();
  for (const id of [f.ids.chair, f.ids.member, f.ids.reviewer, f.ids.admin, f.ids.other]) { const s = randomUUID(); sessions.set(id, s); await f.db.exec(`update auth.users set email_confirmed_at=clock_timestamp() where id=${q(id)};insert into auth.sessions(id,user_id) values(${q(s)},${q(id)})`); }
  campaign = randomUUID(); second = randomUUID();
  for (const id of [campaign, second]) await f.db.exec(`insert into public.campaigns(id,organization_id,title,created_by) values(${q(id)},${q(f.ids.org)},'TESTFIXTURE — NIET PUBLICEREN — F3',${q(f.ids.chair)})`);
  for (const c of [campaign, second]) {
    await actor(f.ids.chair); await call('pilot.open', {}, randomUUID(), c);
    for (const [user_id, role] of [[f.ids.chair, 'editor'], [f.ids.reviewer, 'reviewer']] as const) await call('access.assign', { user_id, role, valid_until: new Date(Date.now() + 86400000).toISOString() }, randomUUID(), c);
    const pol = await call('policy.set', { version: 1, body: 'TESTFIXTURE — alleen fictieve campagnegegevens.', retention: 'TESTFIXTURE — tijdens acceptatie bewaren; daarna afzonderlijk beoordelen.', fields: ['post_url', 'views'], document_id: f.ids.policyDoc }, randomUUID(), c);
    const part = await call('participant.select', { person_id: f.ids.otherPerson, policy_id: pol.id, expires_at: new Date(Date.now() + 86400000).toISOString() }, randomUUID(), c);
    if (c === campaign) { policy = pol.id; participant = part.id; }
    await actor(f.ids.member); await call('participant.accept', { id: part.id, accepted: true }, randomUUID(), c);
  }
  await f.owner();
});
after(async () => { await f.db.close(); });
beforeEach(async () => { await f.owner(); await f.db.exec('begin'); });
afterEach(async () => { await f.owner(); await f.db.exec('rollback'); });
async function verifiedPost() {
  await actor(f.ids.member); const p = await call('post.submit', { participant_id: participant, external_id: 'abcdefghijk' });
  await actor(f.ids.reviewer); await call('post.review', { id: p.id, expected_revision: 1, decision: 'verified', availability: 'available', reason: 'TESTFIXTURE gecontroleerd' }); return p.id;
}
test('F3 database: own selection, participation and independent review', async () => { const id = await verifiedPost(); await actor(f.ids.chair); assert.equal((await state()).posts[0].id, id); assert.equal((await state()).posts[0].status, 'verified'); });
test('F3 database: ordinary admin, unrelated member, anon and service role have no bypass', async () => {
  await actor(f.ids.admin); await deny('participant.select', { person_id: f.ids.person, policy_id: policy, expires_at: new Date(Date.now() + 86400000).toISOString() });
  for (const role of ['anon', 'authenticated', 'service_role']) { await f.owner(); await f.db.exec(`set role ${role};savepoint direct`); await assert.rejects(f.db.query('select * from private.campaign_measurements')); await f.db.exec('rollback to direct'); }
});
test('F3 database: chair is not automatically a private reader', async () => {
  await f.owner(); await f.db.exec(`update private.campaign_access set revoked_at=clock_timestamp() where user_id=${q(f.ids.chair)}`); await actor(f.ids.chair); assert.equal((await state()).posts.length, 0); await deny('measurement.record', {});
});
test('F3 database: duplicate post and request conflict', async () => {
  await actor(f.ids.member); const req = randomUUID(), data = { participant_id: participant, external_id: 'abcdefghijk' };
  const a = await call('post.submit', data, req); assert.equal((await call('post.submit', data, req)).id, a.id); assert.equal((await call('post.submit', data)).id, a.id);
  await f.db.exec('savepoint conflict'); await assert.rejects(call('post.submit', { ...data, external_id: '12345678901' }, req), /request_conflict/); await f.db.exec('rollback to conflict'); assert.equal((await state()).posts.length, 1);
});
test('F3 database: own reviewer cannot approve own submission', async () => {
  await actor(f.ids.chair); await call('access.assign', { user_id: f.ids.member, role: 'reviewer', valid_until: new Date(Date.now() + 86400000).toISOString() });
  await actor(f.ids.member); const p = await call('post.submit', { participant_id: participant, external_id: 'abcdefghijk' }); await deny('post.review', { id: p.id, expected_revision: 1, decision: 'verified', availability: 'available', reason: 'TESTFIXTURE' });
});
test('F3 database: campaign A withdrawal leaves B intact and hides dependent reads', async () => {
  await verifiedPost(); await actor(f.ids.member); await call('participant.withdraw', { id: participant });
  assert.equal((await state()).posts.length, 0); assert.equal((await state(second)).participants[0].valid, true); await deny('post.submit', { participant_id: participant, external_id: '12345678901' }); await deny('participant.accept', { id: participant, accepted: true });
});
test('F3 database: broader new policy does not inherit acceptance', async () => {
  await verifiedPost(); await actor(f.ids.chair); await call('policy.set', { version: 2, body: 'TESTFIXTURE — een nieuwe tekst en scope.', retention: 'TESTFIXTURE — uitsluitend voor de test.', fields: ['post_url', 'views', 'likes'], document_id: f.ids.policyDoc }); assert.equal((await state()).posts.length, 0);
});
test('F3 database: wrong person and cross-campaign policy rejected', async () => {
  await actor(f.ids.chair); await deny('participant.accept', { id: participant, accepted: true }); await deny('participant.select', { person_id: f.ids.person, policy_id: policy, expires_at: new Date(Date.now() + 86400000).toISOString() }, second);
});
test('F3 database: measurements are scoped, immutable, manual and never legacy-export rows', async () => {
  const id = await verifiedPost(); await actor(f.ids.chair);
  const data = { contribution_id: id, expected_revision: 2, metric: 'views', definition: 'TESTFIXTURE v1', semantics: 'period', period_start: '2026-01-01T00:00:00Z', period_end: '2026-01-02T00:00:00Z', measured_at: '2026-01-02T00:00:00Z', value: 0, quality: 'known', source_kind: 'manual', source_reference: 'TESTFIXTURE', source_document_id: f.ids.policyDoc, source_key: 'fixture-1' };
  const m = await call('measurement.record', data); assert(m.id); assert.equal((await state()).measurements.length, 1);
  assert.equal((await call('measurement.record', data)).id, m.id);
  await deny('measurement.record', { ...data, value: 99 });
  await deny('measurement.record', { ...data, source_key: 'fixture-2', metric: 'likes' }); await deny('measurement.record', { ...data, source_key: 'fixture-2', source_kind: 'official_api' });
  await actor(f.ids.member); assert.equal((await state()).measurements.length, 1);
  await call('participant.withdraw', { id: participant }); assert.equal((await state()).measurements.length, 0);
});
test('F3 database: revoked session blocks both reads and writes', async () => {
  await f.owner(); await f.db.exec(`delete from auth.sessions where user_id=${q(f.ids.member)}`); await actor(f.ids.member); await deny('post.submit', { participant_id: participant, external_id: 'abcdefghijk' }); await f.db.exec('savepoint read'); await assert.rejects(state()); await f.db.exec('rollback to read');
});
test('F3 database: no real campaign is silently activated', async () => {
  await f.owner(); const id = randomUUID(); await f.db.exec(`insert into public.campaigns(id,organization_id,title,created_by) values(${q(id)},${q(f.ids.org)},'Echte campagne',${q(f.ids.chair)})`); await actor(f.ids.chair); await deny('pilot.open', {}, id);
});
test('F3 database: report revision freezes inputs and loses access after purpose withdrawal', async () => {
  await verifiedPost(); await actor(f.ids.chair); const report = await call('report.capture');
  const read = () => f.db.query<{ v: { posts: unknown[] } }>(`select public.f3_report_revision(${q(f.ids.org)},${q(campaign)},${q(report.id)}) v`);
  assert.equal((await read()).rows[0].v.posts.length, 1);
  await actor(f.ids.member); await call('participant.withdraw', { id: participant }); await actor(f.ids.chair);
  await f.db.exec('savepoint old'); await assert.rejects(read(), /report_access_changed/); await f.db.exec('rollback to old');
});
test('F3 database: direct RPC rejects missing expected revision and unknown private fields', async () => {
  const id = await verifiedPost(); await actor(f.ids.reviewer); await deny('post.review', { id, decision: 'verified', availability: 'available', reason: 'TESTFIXTURE' });
  await actor(f.ids.chair); await deny('report.capture', { secret: 'TESTFIXTURE' });
});
test('F3 database: closed pilot revokes roles and blocks older reports', async () => {
  await verifiedPost(); await actor(f.ids.chair); const report = await call('report.capture'); await call('pilot.close');
  await deny('post.submit', { participant_id: participant, external_id: '12345678901' });
  await f.db.exec('savepoint closed'); await assert.rejects(f.db.query(`select public.f3_report_revision(${q(f.ids.org)},${q(campaign)},${q(report.id)})`)); await f.db.exec('rollback to closed');
});
test('F3 database: reauthorizing a new text requeues the same post for independent review', async () => {
  const id = await verifiedPost(); await actor(f.ids.chair);
  const next = await call('policy.set', { version: 2, body: 'TESTFIXTURE — nieuwe doeltekst.', retention: 'TESTFIXTURE — bewaarbehandeling blijft testbewijs.', fields: ['post_url', 'views'], document_id: f.ids.policyDoc });
  const person = await call('participant.select', { person_id: f.ids.otherPerson, policy_id: next.id, expires_at: new Date(Date.now() + 86400000).toISOString() });
  await actor(f.ids.member); await call('participant.accept', { id: person.id, accepted: true });
  assert.equal((await call('post.submit', { participant_id: person.id, external_id: 'abcdefghijk' })).id, id);
  const post = (await state()).posts[0]; assert.equal(post.status, 'candidate'); assert.equal(post.revision, 3);
});
test('F3 database: role and person expiry plus other-tenant access fail closed', async () => {
  await verifiedPost(); await f.owner(); await f.db.exec(`update private.campaign_access set valid_until=clock_timestamp()-interval '1 minute' where user_id=${q(f.ids.reviewer)}`);
  await actor(f.ids.reviewer); await deny('post.review', {});
  await actor(f.ids.other); await deny('access.assign', { user_id: f.ids.other, role: 'editor', valid_until: new Date(Date.now() + 86400000).toISOString() });
  await f.owner(); await f.db.exec(`update private.campaign_participants set expires_at=clock_timestamp()-interval '1 minute' where id=${q(participant)}`);
  await actor(f.ids.chair); assert.equal((await state()).posts.length, 0);
});
