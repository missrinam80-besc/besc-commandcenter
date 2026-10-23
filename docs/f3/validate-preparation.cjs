// Validates this preparation package, never application behavior or live access.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const base = __dirname;
const repo = path.resolve(base, '../..');
const read = (name) => JSON.parse(fs.readFileSync(path.join(base, name), 'utf8'));
const register = read('acceptatiegevallen.json');
assert.equal(register.status, 'prepared_not_executed');
assert.equal(register.live_changes, false);
assert.equal(register.application_tests_executed, false);
assert.equal(register.cases.length, 53);
assert.equal(new Set(register.cases.map(c => c.id)).size, 53);
assert.deepEqual([...new Set(register.cases.map(c => c.package))].sort(),
  ['F3.0', 'F3.1', 'F3.2', 'F3.3', 'F3.4', 'F3.5', 'F3.6']);
for (const c of register.cases) {
  for (const key of ['id', 'title', 'action', 'expected', 'required_evidence_layer']) assert.ok(c[key]);
  assert.equal(c.status, 'planned');
  assert.equal(c.actual_result, null);
  assert.deepEqual(c.evidence, []);
}
const f2 = read('f2-open-afhankelijkheden.json');
assert.equal(f2.partial_cases.length, 38);
assert.equal(new Set(f2.partial_cases.map(c => c.id)).size, 38);
assert.deepEqual(f2.skipped_by_user, ['P10']);
assert.equal(f2.f3_test_result_inferred, false);
const manifest = read('bronmanifest.json');
for (const source of manifest.source_files) {
  const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(repo, source.path), 'utf8').replace(/\r\n/g, '\n')).digest('hex');
  assert.equal(actual, source.sha256, `Source changed: ${source.path}; review baseline before updating hash`);
}
const spec = read('meetvoorbeelden.json');
assert.equal(spec.synthetic, true);
assert.equal(spec.fixtures.length, 8);
for (const f of spec.fixtures.filter(f => f.input)) {
  const known = f.input.filter(v => v !== null);
  assert.equal(known.length, f.expected.measured);
  assert.equal(f.input.length - known.length, f.expected.missing);
  assert.equal(known.length ? known.reduce((a, b) => a + b, 0) : null, f.expected.measured_sum);
}
const examples = Object.fromEntries(spec.fixtures.map(f => [f.id, f]));
assert.equal(examples.known_delta.after - examples.known_delta.before, examples.known_delta.expected.delta);
assert.equal(examples.reset_delta.expected.delta, null);
assert.equal(examples.reset_delta.expected.status, 'conflicted');
assert.equal(examples.zero_baseline.expected.percent_change, null);
assert.equal(examples.reach_no_unique.expected.unique_campaign_reach, null);
assert.equal(examples.zero_denominator.expected.engagement_rate, null);
assert.equal((Date.parse(examples.dst_fall.end_utc) - Date.parse(examples.dst_fall.start_utc)) / 3600000,
  examples.dst_fall.expected.elapsed_hours);
let links = 0;
for (const file of fs.readdirSync(base).filter(f => f.endsWith('.md'))) {
  for (const match of fs.readFileSync(path.join(base, file), 'utf8').matchAll(/\]\(([^)]+)\)/g)) {
    if (/^https?:/.test(match[1])) continue;
    assert.ok(fs.existsSync(path.resolve(base, match[1].split('#')[0])), `Broken link: ${file}: ${match[1]}`);
    links++;
  }
}
console.log(JSON.stringify({ preparation_valid: true, packages: 7, planned_cases: 53,
  specification_examples: 8, source_hashes_verified: manifest.source_files.length,
  f2_partial_cases_preserved: 38, local_links_checked: links,
  application_tests_executed: false, live_changes: false }));
