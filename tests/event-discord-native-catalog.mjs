import assert from 'node:assert/strict';
import {createRequire}from'node:module';
import{readFileSync}from'node:fs';
if(process.env.PGHOST!=='127.0.0.1'||process.env.PGDATABASE!=='besc_f1_fixture'||process.env.PGUSER!=='postgres'||process.env.F1_NATIVE_TEST!=='1')throw Error('Requires isolated native fixture');
const {Client}=createRequire(import.meta.url)('pg'),db=new Client();
try{await db.connect();const results=await db.query(readFileSync(new URL('../ops/foundation-effects-catalog.sql',import.meta.url),'utf8'));
const row=results.find(r=>r.rows?.length===1)?.rows[0];const effects=Object.values(row??{})[0];assert.equal(effects.read_only,'on');assert.match(effects.postgres_version,/^17\./);assert.equal(effects.tables.length,186);
for(const name of ['event_discord_settings','event_discord_publications','event_discord_jobs','event_presence','event_discord_interest']){const t=effects.tables.find(t=>t.schema==='private'&&t.name===name);assert.ok(t?.rls);assert.ok(Object.values(t.grants).every(g=>Object.values(g).every(v=>v===false)));}
for(const[name,anon,authenticated,service]of[['event_discord_manage',false,true,false],['event_public_info',true,true,false],['event_presence_own',false,true,false],['event_discord_bot',false,false,true]]){const f=effects.functions.find(f=>f.schema==='public'&&f.name===name);assert.ok(f?.security_definer);assert.equal(f.anon_execute,anon);assert.equal(f.authenticated_execute,authenticated);assert.equal(f.service_role_execute,service);}
console.log(JSON.stringify({native_catalog_verified:true,total_tables:186,five_private_tables_guarded:true,explicit_function_grants_verified:true,live_changes:false}));
}finally{await db.end();}
