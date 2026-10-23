import assert from 'node:assert/strict';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
if (process.env.PGHOST !== '127.0.0.1' || process.env.PGDATABASE !== 'besc_f1_fixture' || process.env.PGUSER !== 'postgres') throw Error('Dedicated localhost F3 fixture required');
const owner = new pg.Client(), a = new pg.Client(), b = new pg.Client();
await Promise.all([owner.connect(), a.connect(), b.connect()]);
try {
  const pilot = (await owner.query('select * from private.campaign_pilots order by campaign_id limit 1')).rows[0];
  assert(pilot, 'Run F3 database suite first');
  const org = pilot.organization_id, campaign = pilot.campaign_id;
  const participant = (await owner.query('select p.*,x.account_user_id from private.campaign_participants p join public.community_people x on x.id=p.person_id where p.campaign_id=$1', [campaign])).rows[0];
  const editor = (await owner.query("select user_id from private.campaign_access where campaign_id=$1 and role='editor'", [campaign])).rows[0].user_id;
  const reviewer = (await owner.query("select user_id from private.campaign_access where campaign_id=$1 and role='reviewer'", [campaign])).rows[0].user_id;
  const sessions = (await owner.query('select user_id,id from auth.sessions')).rows;
  async function actor(client, user) {
    await client.query('reset role');
    await client.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false),set_config('request.jwt.claims',$2,false)", [user, JSON.stringify({ sub: user, role: 'authenticated', session_id: sessions.find(s => s.user_id === user).id })]);
    await client.query('set role authenticated');
  }
  const call = (client, op, data, request = randomUUID()) => client.query('select public.f3_workflow($1,$2,$3,$4,$5) v', [org, campaign, op, data, request]);
  await Promise.all([actor(a, participant.account_user_id), actor(b, participant.account_user_id)]);
  const payload = { participant_id: participant.id, external_id: '12345678901' }, request = randomUUID();
  const dup = await Promise.all([call(a, 'post.submit', payload, request), call(b, 'post.submit', payload, request)]);
  assert.equal(dup[0].rows[0].v.id, dup[1].rows[0].v.id);
  assert.equal(Number((await owner.query('select count(*) n from private.campaign_contributions where campaign_id=$1', [campaign])).rows[0].n), 1);
  await actor(a, reviewer); const postId = dup[0].rows[0].v.id;
  await call(a, 'post.review', { id: postId, expected_revision: 1, decision: 'verified', availability: 'available', reason: 'TESTFIXTURE' });
  const document = (await owner.query('select document_id from private.campaign_policies where campaign_id=$1', [campaign])).rows[0].document_id;
  await actor(a, participant.account_user_id); await actor(b, editor);
  await a.query('begin'); await call(a, 'participant.withdraw', { id: participant.id });
  let finished = false;
  const pending = call(b, 'measurement.record', { contribution_id: postId, expected_revision: 2, metric: 'views', definition: 'TESTFIXTURE v1', semantics: 'period', period_start: '2026-01-01T00:00:00Z', period_end: '2026-01-02T00:00:00Z', measured_at: '2026-01-02T00:00:00Z', value: 12, quality: 'known', source_kind: 'manual', source_reference: 'TESTFIXTURE', source_document_id: document, source_key: 'race-1' }).then(() => { finished = true; return false; }, () => { finished = true; return true; });
  await new Promise(resolve => setTimeout(resolve, 120)); assert.equal(finished, false);
  await a.query('commit'); assert.equal(await pending, true);
  await owner.query('update private.campaign_participants set withdrawn_at=null where id=$1', [participant.id]);
  await owner.query('begin'); await owner.query('delete from auth.sessions where user_id=$1', [editor]);
  finished = false;
  const afterSessionRevocation = call(b, 'report.capture', {}).then(() => { finished = true; return false; }, () => { finished = true; return true; });
  await new Promise(resolve => setTimeout(resolve, 120)); assert.equal(finished, false);
  await owner.query('commit'); assert.equal(await afterSessionRevocation, true);
  console.log(JSON.stringify({ native_f3_concurrency: true, duplicate_single_identity: true, withdrawal_blocks_stale_measurement: true, session_revocation_blocks_mutation: true, target: 'isolated localhost only' }));
} finally { await Promise.allSettled([a.query('rollback'), b.query('rollback')]); await Promise.all([owner.end(), a.end(), b.end()]); }
