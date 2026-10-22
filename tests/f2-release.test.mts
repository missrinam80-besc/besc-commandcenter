import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
test('F2 release binds exactly one additive migration and preserves all 124 historical SQL files',()=>{
 const root=new URL('../',import.meta.url),manifest=JSON.parse(readFileSync(new URL('ops/f2-release-manifest.json',root),'utf8'));
 assert.equal(manifest.cloud_history_before,123);assert.equal(manifest.cloud_history_after,124);assert.equal(manifest.migrations.length,1);assert.equal(manifest.historical_migrations.length,124);
 assert.deepEqual(manifest.excluded_history,['20261001110000_seed_operational_guidelines.sql']);
 const files=[...manifest.historical_migrations,...manifest.migrations];
 assert.deepEqual(readdirSync(new URL('supabase/migrations/',root)).filter(f=>f.endsWith('.sql')).sort(),files.map(f=>f.file).sort());
 for(const f of files){const sql=readFileSync(new URL('supabase/migrations/'+f.file,root),'utf8').replaceAll('\r\n','\n');assert.equal(createHash('sha256').update(sql).digest('hex'),f.sha256_lf,f.file);}
 assert.equal(manifest.cloud_migrated,false);assert.equal(manifest.server_deployed,false);
});
