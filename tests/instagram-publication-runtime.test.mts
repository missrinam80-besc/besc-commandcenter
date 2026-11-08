import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import * as kernel from '../src/lib/instagram-publication.ts';
const native=createRequire(import.meta.url),org='11111111-1111-4111-8111-111111111111',job='22222222-2222-4222-8222-222222222222',nonce='33333333-3333-4333-8333-333333333333';
function load<T>(file:string,mocks:Record<string,unknown>,env:Record<string,string|undefined>):T{const compiled={exports:{}};runInNewContext(ts.transpileModule(readFileSync(new URL('../src/'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:compiled,exports:compiled.exports,process:{env},Error,Response,Request,URL,fetch:()=>{throw Error('Ambient HTTP forbidden');},setTimeout,require:(name:string)=>name==='server-only'?{}:name in mocks?mocks[name]:native(name)});return compiled.exports as T;}
function runtime(options:{enabled?:boolean;empty?:boolean;foreign?:boolean;invalid?:boolean}={}){
 const calls:string[]=[],mutations:string[]=[],requests:Record<string,unknown>[]=[];let state='scheduled';
 const env={BESC_INSTAGRAM_PUBLICATION_ENABLED:options.enabled===false?'false':'true',BESC_INSTAGRAM_PUBLICATION_ORGANIZATION_ID:options.invalid?'invalid':org,BESC_INSTAGRAM_PUBLICATION_MEDIA_ORIGIN:'https://media.example.invalid',META_GRAPH_API_VERSION:'v25.0',META_APP_ID:'fixture-app',META_APP_SECRET:'fixture-secret'};
 const mocks={'./supabase/admin':{createAdminClient:()=>({rpc:async(name:string,input:Record<string,unknown>)=>{
  calls.push(String(input.p_action));requests.push(input);
  if(input.p_action==='due')return{data:options.empty?[]:[{id:job}],error:null};
  if(input.p_action==='read')return{data:{id:job,post_id:job,account_id:job,organization_id:options.foreign?job:org,state,scheduled_at:'2020-01-01T00:00:00Z',caption:'TESTFIXTURE - NIET PUBLICEREN',image_url:'https://media.example.invalid/image.jpg',image_sha256:'a'.repeat(64),external_account_id:'123'},error:null};
  if(input.p_action==='claim'){state='preparing';return{data:{state,nonce},error:null};}
  state=input.p_action==='complete'?'published':String(input.p_action);return{data:{state},error:null};
 }})},'./meta-integration':{usableMetaCredentials:async()=>{calls.push('credentials');return{access_token:'fixture-token'};}},'./instagram-publication-image':{verifyInstagramImage:async()=>{calls.push('image');}},'./instagram-publication':kernel,
 './instagram-publication-provider':{instagramGraphProvider:()=>({preflight:async()=>{},quota:async()=>{},create:async()=>{mutations.push('create');return'456';},status:async()=>'FINISHED',publish:async()=>{mutations.push('publish');return'789';},receipt:async()=>({media_id:'789',permalink:'https://www.instagram.com/p/FIXTURE/'})})}};
 const api=load<typeof import('../src/lib/instagram-publication-runtime.ts')>('lib/instagram-publication-runtime.ts',mocks,env);return{api,calls,requests,mutations};
}
test('Instagram-runtime: uitgeschakeld of onvolledige configuratie opent geen database',async()=>{
 for(const options of [{enabled:false},{invalid:true}]){const f=runtime(options);await assert.rejects(f.api.dispatchInstagramPublications());assert.deepEqual(f.calls,[]);}
});
test('Instagram-runtime: vaste organisatie, één opgeslagen job, eigen credential en volledige dispatcherketen',async()=>{
 const f=runtime();assert.deepEqual(JSON.parse(JSON.stringify(await f.api.dispatchInstagramPublications())),{processed:1,published:1,attention:0,skipped:0});assert.deepEqual(f.mutations,['create','publish']);
 assert.deepEqual(JSON.parse(JSON.stringify(f.requests[0])),{p_job:null,p_action:'due',p_data:{organization_id:org}});assert.ok(f.calls.includes('credentials'));assert.ok(f.calls.includes('image'));
});
test('Instagram-runtime: lege queue en buitenlandse job veroorzaken geen providerverzoek',async()=>{
 const f=runtime({empty:true});assert.equal((await f.api.dispatchInstagramPublications()).processed,0);assert.deepEqual(f.mutations,[]);
 const foreign=runtime({foreign:true});await assert.rejects(foreign.api.dispatchInstagramPublications(),/organization_mismatch/);assert.deepEqual(foreign.mutations,[]);assert.ok(!foreign.calls.includes('credentials'));
});
test('Instagram-route: uitgeschakeld, ontbrekend cron-geheim en verkeerde afzender starten geen dispatcher',async()=>{
 let calls=0;
 for(const env of [{BESC_INSTAGRAM_PUBLICATION_ENABLED:'false',CRON_SECRET:'fixture'},{BESC_INSTAGRAM_PUBLICATION_ENABLED:'true'},{BESC_INSTAGRAM_PUBLICATION_ENABLED:'true',CRON_SECRET:'fixture'}]){
  const route=load<typeof import('../src/app/api/cron/instagram-publication/route.ts')>('app/api/cron/instagram-publication/route.ts',{'@/lib/instagram-publication-runtime':{dispatchInstagramPublications:async()=>{calls++;}}},env);
  const response=await route.POST(new Request('https://example.invalid/api/cron/instagram-publication',{method:'POST'}));assert.ok([401,503].includes(response.status));assert.equal(response.headers.get('cache-control'),'no-store, private');
 }assert.equal(calls,0);
});
test('Instagram-route: bevestigde resultaten, onzekerheid en fouten blijven onderscheiden zonder geheime details',async()=>{
 for(const mode of ['success','uncertain','error']){
  const route=load<typeof import('../src/app/api/cron/instagram-publication/route.ts')>('app/api/cron/instagram-publication/route.ts',{'@/lib/instagram-publication-runtime':{dispatchInstagramPublications:async()=>{if(mode==='error')throw Error('PRIVATE_TOKEN');return{processed:1,published:mode==='success'?1:0,attention:mode==='uncertain'?1:0,skipped:0};}}},{BESC_INSTAGRAM_PUBLICATION_ENABLED:'true',CRON_SECRET:'fixture'});
  const response=await route.POST(new Request('https://example.invalid/api/cron/instagram-publication',{method:'POST',headers:{authorization:'Bearer fixture'}}));assert.equal(response.status,mode==='success'?200:503);assert.doesNotMatch(await response.text(),/PRIVATE_TOKEN/);
 }
});
