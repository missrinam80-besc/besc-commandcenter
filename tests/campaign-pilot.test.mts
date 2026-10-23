import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePilotPostUrl, parsePilotOperation, pilotWindowSummary, pilotReport, pilotReportCsv, comparePilotValues, cumulativePilotDelta, type PilotState, type PilotSelection } from '../src/lib/campaign-pilot.ts';
const selection: PilotSelection = { metric: 'views', definition: 'TESTFIXTURE v1', semantics: 'period', first: { start: '2030-01-01T00:00:00Z', end: '2030-01-02T00:00:00Z' }, second: { start: '2030-01-02T00:00:00Z', end: '2030-01-03T00:00:00Z' }, asOf: '2030-01-04T00:00:00Z', freshnessHours: 168 };
function fixture(): PilotState {
  return { synthetic: true, campaign_id: 'fixture', chair: false, editor: false, reviewer: false, reader: true, policies: [], participants: [], access: [], posts: ['a', 'b', 'c'].map(id => ({ id, participant_id: 'person', canonical_url: 'https://www.youtube.com/watch?v=abcdefghijk', external_id: 'abcdefghijk', revision: 2, status: 'verified', availability: 'available', checked_at: null })), measurements: ['a', 'b'].map((id, index) => ({ id, contribution_id: id, revision: 2, metric: 'views', definition: selection.definition, unit: 'count', semantics: 'period', period_start: selection.first.start, period_end: selection.first.end, fetched_at: '2030-01-03T00:00:00Z', measured_at: '2030-01-02T00:00:00Z', value: index * 40, quality: 'known', source_kind: 'manual', source_reference: '=TESTFIXTURE' })) };
}
for (const url of ['https://www.youtube.com/watch?v=abcdefghijk&utm_source=test', 'https://youtu.be/abcdefghijk', 'https://m.youtube.com/shorts/abcdefghijk', 'https://youtube.com/live/abcdefghijk']) test('F3 URL canonical identity: ' + url, () => assert.equal(parsePilotPostUrl(url)?.externalId, 'abcdefghijk'));
for (const url of ['http://youtu.be/abcdefghijk', 'https://youtube.com.evil.test/watch?v=abcdefghijk', 'https://youtube.com@evil.test/watch?v=abcdefghijk', 'https://127.0.0.1/watch?v=abcdefghijk', 'https://youtube.com/watch?v=abcdefghijk&v=12345678901', 'https://youtu.be/abcdefghijk/extra', 'https://youtube.com:8443/watch?v=abcdefghijk', 'https://youtu.be/abcdefghijk#token', 'https://youtube.com\\@evil.test/watch?v=abcdefghijk']) test('F3 unsafe URL rejected: ' + url, () => assert.equal(parsePilotPostUrl(url), null));
test('F3 unknown is not zero and denominator remains three', () => {
  const x = pilotWindowSummary(fixture(), selection, selection.first);
  assert.equal(x.value, 40); assert.equal(x.measured, 2); assert.equal(x.missing, 1); assert.equal(x.total, 3); assert.equal(x.complete, false); assert.equal(x.rows[0].value, 0);
});
test('F3 no observations produces no sum', () => { const s = fixture(); s.measurements = []; assert.equal(pilotWindowSummary(s, selection, selection.first).value, null); });
test('F3 stale, conflict, deleted and changed revision are not current known totals', () => {
  for (const kind of ['stale', 'conflicted', 'deleted', 'revision']) {
    const s = fixture(); if (kind === 'deleted') s.posts[0].availability = 'deleted'; else if (kind === 'revision') s.posts[0].revision++; else s.measurements[0].quality = kind as 'stale' | 'conflicted';
    const x = pilotWindowSummary(s, selection, selection.first); assert.equal(x.measured, 1); assert.equal(x.total, 3); assert(!x.complete);
  }
});
test('F3 latest exact snapshot selected; no summing re-fetches', () => {
  const s = fixture(); s.measurements.push({ ...s.measurements[0], id: 'a2', value: 10, fetched_at: '2030-01-03T01:00:00Z' });
  assert.equal(pilotWindowSummary(s, selection, selection.first).value, 50);
});
test('F3 future, wrong period, definition and semantics excluded', () => {
  for (const change of [{ fetched_at: '2031-01-01T00:00:00Z' }, { definition: 'OTHER' }, { period_end: selection.second.end }, { semantics: 'cumulative' as const }]) {
    const s = fixture(); Object.assign(s.measurements[0], change); assert.equal(pilotWindowSummary(s, selection, selection.first).measured, 1);
  }
});
test('F3 reach and lifetime are not summed', () => {
  for (const change of [{ metric: 'reach' }, { semantics: 'cumulative' as const }]) {
    const s = fixture(); for (const m of s.measurements) Object.assign(m, change);
    const x = pilotWindowSummary(s, { ...selection, ...change }, selection.first); assert.equal(x.value, null); assert.equal(x.additive, false);
  }
});
test('F3 percentages require known baseline and comparable complete coverage', () => {
  assert.deepEqual(comparePilotValues(0, 40), { delta: 40, percent: null }); assert.deepEqual(comparePilotValues(null, 40), { delta: null, percent: null });
  assert.deepEqual(pilotReport(fixture(), selection).comparison, { delta: null, percent: null });
  assert.equal(cumulativePilotDelta(100, 140, true), 40); assert.equal(cumulativePilotDelta(100, 5, true), null); assert.equal(cumulativePilotDelta(100, 140, false), null);
});
test('F3 CSV has safe formula cells, explicit missing, source and both periods', () => {
  const csv = pilotReportCsv(pilotReport(fixture(), selection)); assert(csv.includes("'=TESTFIXTURE")); assert(csv.includes('Onbekend')); assert(csv.includes(selection.second.end)); assert(csv.includes('manual'));
});
test('F3 input cannot label manual evidence as official API', () => assert.equal(parsePilotOperation('measurement.record', { source_kind: 'official_api' }).success, false));
test('F3 windows must be exact and non-overlapping', () => assert.throws(() => pilotWindowSummary(fixture(), { ...selection, second: selection.first }, selection.first), /invalid_selection/));
