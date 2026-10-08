import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import test from "node:test";

test("de dossiergenerator weigert schrijven naar historische, ontbrekende of externe migraties",()=>{
 const migration="supabase/migrations/20261008094405_unified_dossier_editor.sql";
 const before=readFileSync(migration);
 for(const args of [[],["--output",migration],["--output","supabase/migrations/20990101000000_missing.sql"],["--output","../20990101000000_external.sql"]]){
  const result=spawnSync(process.execPath,["scripts/build-dossier-editor-migration.cjs",...args],{encoding:"utf8"});
  assert.equal(result.status,1);
  assert.match(result.stderr,/Historische migraties|nieuw migratiebestand|nieuwe migratie/);
  assert.deepEqual(readFileSync(migration),before);
 }
});
