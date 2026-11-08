import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
test('Meta-leesadapter: bestaande OAuth, statistiekensynchronisatie, inbox, activeringsroutes en migratie blijven exact behouden',()=>{
 const root=new URL('../',import.meta.url),m=JSON.parse(readFileSync(new URL('ops/meta-inbox-reader-local-release.json',root),'utf8'));
 assert.equal(m.base_commit,'8453b0ef161e08b25ff2482c27495b81b697fb6c');assert.equal(m.runtime_default,'off');assert.equal(m.provider_factory_included,true);
 for(const field of ['database_changes_required','migration_added','runtime_factory_included','ambient_fetch','automatic_retry','webhook_added','scheduler_added','oauth_scopes_changed','cloud_apply_authorized','server_deploy_authorized','live_provider_authorized','live_message_read_authorized','activation_authorized','reply_authorized','moderation_authorized','live_contract_verified'])assert.equal(m[field],false,field);
 for(const file of m.preserved_files)assert.equal(createHash('sha256').update(readFileSync(new URL(file.file,root),'utf8').replaceAll('\r\n','\n')).digest('hex'),file.sha256_lf,file.file);
 const used:string[]=[];
 function scan(dir:URL){for(const entry of readdirSync(dir,{withFileTypes:true})){const url=new URL(entry.name+(entry.isDirectory()?'/':''),dir);if(entry.isDirectory())scan(url);else if(/\.[tj]sx?$/.test(entry.name)&&!['meta-inbox-reader.ts','meta-inbox-receive.ts'].includes(entry.name)&&/meta-inbox-(reader|receive)/.test(readFileSync(url,'utf8')))used.push(url.pathname);}}
 scan(new URL('src/',root));assert.deepEqual(used,[],'No application route, timer or runtime may invoke the new reader in this package');
});
