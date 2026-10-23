import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
test('F3 release: exact additive migration, historical SQL unchanged and live gates retained', () => {
  const root = new URL('../', import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL('ops/f3-release-manifest.json', root), 'utf8'));
  assert.equal(manifest.synthetic_build_authorized, true); assert.equal(manifest.live_cloud_apply_authorized, false); assert.equal(manifest.runtime_default, 'off');
  assert.equal(manifest.migrations.length, 1); assert.equal(manifest.historical_migrations.length, 125);
  const files = [...manifest.historical_migrations, ...manifest.migrations];
  assert.deepEqual(readdirSync(new URL('supabase/migrations/', root)).filter(f => f.endsWith('.sql')).sort(), files.map(f => f.file).sort());
  for (const f of files) assert.equal(createHash('sha256').update(readFileSync(new URL('supabase/migrations/' + f.file, root), 'utf8').replaceAll('\r\n', '\n')).digest('hex'), f.sha256_lf, f.file);
  assert.deepEqual(manifest.excluded_history, ['20261001110000_seed_operational_guidelines.sql']);
});
