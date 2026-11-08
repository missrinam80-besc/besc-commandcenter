import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url),mod={exports:{}};
runInNewContext(ts.transpileModule(readFileSync(new URL('../src/components/inbox-sync-status.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module:mod,exports:mod.exports,require,Date});
const {InboxSyncStatus}=mod.exports as typeof import('../src/components/inbox-sync-status.tsx');
test('Inboxvoortgang: wachttijd, bevestigde voortgang, onderbreking en historie zijn duidelijk zonder providergeheimen',()=>{
 const job={id:'fixture',state:'retry_wait',pages_committed:2,attempts:3,reason:'rate_limited',available_at:'2026-01-01T12:00:00Z',events:[{operation:'committed',reason:null},{operation:'attention',reason:'SECRET_TOKEN cursor'}]};const html=renderToStaticMarkup(InboxSyncStatus({jobs:[job,{...job,id:'second',state:'processing'}]}));assert.match(html,/2 bevestigde pagina/);assert.match(html,/Meta vraagt tijdelijk te wachten/);assert.match(html,/Nieuwe poging mogelijk vanaf/);assert.match(html,/claimtermijn/);assert.match(html,/Berichten en voortgang bevestigd/);assert.doesNotMatch(html,/SECRET_TOKEN|cursor|name="token"|Antwoord versturen/);
});
test('Inboxvoortgang: geen leesrondes en onbekende uitkomst krijgen geen vals geslaagd resultaat',()=>{
 assert.match(renderToStaticMarkup(InboxSyncStatus({jobs:[]})),/geen leesrondes gestart/);const html=renderToStaticMarkup(InboxSyncStatus({jobs:[{id:'fixture',state:'SECRET_STATE',pages_committed:0,attempts:0,reason:'SECRET_REASON',available_at:'2026-01-01T12:00:00Z'}]}));assert.match(html,/niet bevestigd/);assert.doesNotMatch(html,/SECRET_STATE|SECRET_REASON|Leesronde afgerond/);
});
