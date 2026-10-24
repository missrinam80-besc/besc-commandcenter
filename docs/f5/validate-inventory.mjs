// Documentation/source inventory only. No network, application or database calls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const base = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(base, '../..');
const botIndex = process.argv.indexOf('--bot');
assert(botIndex > -1 && process.argv[botIndex + 1], 'Pass --bot with the separate pinned bot checkout');
const bot = path.resolve(process.argv[botIndex + 1]);
assert.notEqual(repo, bot, 'Repositories must remain separate');
const read = name => JSON.parse(fs.readFileSync(path.join(base, name), 'utf8'));
const sources = read('bronregister.json');
const inventory = read('capabilities.json');
assert.equal(sources.format, 'besc-f5-source-register-v1');
assert.equal(inventory.format, 'besc-f5-capability-inventory-v1');
assert.equal(sources.runtime_inspection_performed, false);
assert.equal(sources.secrets_or_private_kit_configuration_read, false);
assert.equal(inventory.f5_0_complete, true);
assert.equal(inventory.first_package_state, 'prepared_not_implemented');
for (const field of ['f5_functionality_implemented', 'live_changes', 'database_changes', 'new_roles_or_scopes_granted', 'provider_calls_performed', 'runtime_flags_changed', 'extensive_tests_executed']) assert.equal(inventory[field], false, field);
assert.equal(inventory.original_acceptance_boundaries_preserved, true);
const ids = new Set(sources.sources.map(s => s.id));
assert.equal(ids.size, sources.sources.length);
let hashes = 0;
for (const source of sources.sources) {
  const root = source.repository === 'commandcenter' ? repo : source.repository === 'discordbot' ? bot : null;
  assert(root);
  assert.equal(source.commit, sources.baselines[source.repository]);
  const committed = execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, '-C', root, 'show', `${source.commit}:${source.path}`], { encoding: 'utf8' }).replaceAll('\r\n', '\n');
  const digest = text => createHash('sha256').update(text).digest('hex');
  assert.equal(digest(committed), source.sha256_lf, source.id + ': pinned commit');
  assert.equal(digest(fs.readFileSync(path.join(root, source.path), 'utf8').replaceAll('\r\n', '\n')), source.sha256_lf, source.id + ': source checkout');
  hashes++;
}
assert.deepEqual(inventory.capabilities.map(c => c.id), ['S01', 'S02', 'S03', 'B01', 'T01', 'R01', 'R02']);
for (const c of inventory.capabilities) {
  assert(['built', 'partial', 'gap'].includes(c.coverage));
  assert.equal(c.live_verified_in_this_inventory, false);
  for (const id of c.source_ids) assert(ids.has(id), id);
  for (const name of ['reuse', 'missing_or_next', 'rights', 'reliability_boundary', 'cost_status', 'minimum_build_check', 'later_human_acceptance']) assert(c[name]?.length > 20, c.id + ': ' + name);
}
let links = 0;
for (const file of fs.readdirSync(base).filter(n => n.endsWith('.md'))) {
  for (const match of fs.readFileSync(path.join(base, file), 'utf8').matchAll(/\]\(([^)]+)\)/g)) {
    if (/^https?:/.test(match[1])) continue;
    assert(fs.existsSync(path.resolve(base, match[1].split('#')[0])), file + ': ' + match[1]);
    links++;
  }
}
console.log(JSON.stringify({ inventory_valid: true, pinned_source_hashes_checked: hashes, capabilities: inventory.capabilities.length, local_links_checked: links, application_tests_executed: false, live_changes: false }));
