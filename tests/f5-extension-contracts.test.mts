import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,readdir,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {discoverCampaignTwitch} from '../src/lib/campaign-discovery.ts';
import {parseBalanceSnapshot,balanceSnapshotMaterial,reconcileBalances,parseExternalBalances} from '../src/lib/balance-reconciliation.ts';
import {handleCampaignReference,parseReferenceClients} from '../src/lib/campaign-reference-api.ts';
import {handleCampaignBotSubmit} from '../src/lib/campaign-bot-submit.ts';
import {hashBotKey} from '../src/lib/bot-api.ts';
import {loadBridgeConfig,processQueueOnce,referenceKey} from '../integrations/streamerbot/bridge.mjs';
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const org='11111111-1111-4111-8111-111111111111',user='22222222-2222-4222-8222-222222222222',source='33333333-3333-4333-8333-333333333333',guild='111111111111111111',discord='222222222222222222';
test('Twitch discovery is bounded, owner-bound and validates token again before returning suggestions',async()=>{
 const start=new Date(Date.now()-3600000).toISOString(),end=new Date().toISOString(),when=new Date(Date.now()-60000).toISOString();let calls=0,checks=0;
 const fetcher:typeof fetch=async input=>{calls++;const url=String(input);if(url.includes('/validate')){checks++;return Response.json({client_id:'fixture',user_id:checks===2?'different':'123',expires_in:100});}
 return Response.json({data:url.includes('/videos?')?[{id:'42',user_id:'123',title:'TESTFIXTURE VOD',created_at:when}]:[{id:'TESTFIXTURE_Clip',broadcaster_id:'123',title:'TESTFIXTURE clip',created_at:when}]});};
 await assert.rejects(discoverCampaignTwitch({accessToken:'TESTFIXTURE',clientId:'fixture',broadcasterId:'123',start,end},fetcher),/identity_mismatch/);assert.equal(calls,4);
 const valid:typeof fetch=async input=>String(input).includes('/validate')?Response.json({client_id:'fixture',user_id:'123',expires_in:100}):Response.json({data:[]});
 assert.deepEqual(await discoverCampaignTwitch({accessToken:'TESTFIXTURE',clientId:'fixture',broadcasterId:'123',start,end},valid),[]);
});
test('Reference route is default-off and rejects mismatched source before any write',async()=>{
 const denied=()=>{throw Error('must not touch');},request=new Request('https://example.invalid',{method:'POST'});
 assert.equal((await handleCampaignReference(request,{enabled:false,clients:denied,receive:denied})).status,404);
 const token=`bcr_fixture-source.${'a'.repeat(43)}`,clients=parseReferenceClients(JSON.stringify([{id:'fixture-source',keyHash:hash(token),organizationId:org,sourceId:source,broadcasterId:'123',scopes:['campaigns:reference:write'],expiresAt:'2099-01-01T00:00:00Z',revoked:false}]));let writes=0;
 const reference={schemaVersion:1,kind:'clip',reference_id:'clip:TESTFIXTURE',canonical_url:'https://clips.twitch.tv/TESTFIXTURE',occurred_at:new Date().toISOString()};
 const run=(source_id:string)=>handleCampaignReference(new Request('https://example.invalid',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({source_id,broadcaster_id:'123',reference})}),{enabled:true,clients:()=>clients,receive:async()=>{writes++;return{receiptId:user,accepted:true,providerVerified:false,awarded:false,replay:false};}});
 assert.equal((await run(user)).status,403);assert.equal(writes,0);const ok=await run(source);assert.equal(ok.status,200);assert.equal((await ok.json()).awarded,false);
});
test('Bot submission binds actor, passes original interaction key and never accepts amounts',async()=>{
 const token=`bb_fixture-campaign.${'a'.repeat(43)}`;let writes=0;
 const store={async findAccount(){return{userId:user,verifiedDiscordId:discord,banned:false};},async findMembership(){return{organization_id:org,status:'active',role:'member',finance_role:'none'};},async submit(...args:unknown[]){writes++;assert.deepEqual(args.slice(0,6),[org,guild,discord,user,source,guild]);return{id:user,status:'candidate',replay:false};}};
 const client={id:'fixture-campaign',keyHash:hashBotKey(token),organizationId:org,guildId:guild,scopes:['campaigns:own:write' as const],expiresAt:'2099-01-01',revoked:false};
 const run=(extra={})=>handleCampaignBotSubmit(new Request('https://example.invalid/api/v1/bot/campaigns',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({guild_id:guild,discord_user_id:discord,idempotency_key:guild,data:{campaign_id:source,url:'https://clips.twitch.tv/TESTFIXTURE',...extra}})}),{enabled:true,pilot:true,real:false,clients:()=>[client],store:()=>store});
 assert.equal((await run({bucks:100})).status,400);assert.equal(writes,0);assert.equal((await run()).status,200);assert.equal(writes,1);
});
test('Comparison uses exact integer totals, rejects guessing and leaves balances unchanged',()=>{
 const raw={schemaVersion:1,source:'BESC_CC',organizationId:org,capturedAt:new Date().toISOString(),accounts:[{userId:user,xp:'0',bucks:'9000000000000000000',reserved:'3'},{userId:source,xp:'1',bucks:'9000000000000000000',reserved:'0'}],accountsDigest:'a'.repeat(64),ledgerCount:0,ledgerDigest:'b'.repeat(64),mode:'comparison_only'};
 const snap=parseBalanceSnapshot(raw),before=JSON.stringify(snap),csv=`external_id,cc_user_id,bucks\r\ntwitch:123,${user},9000000000000000000\r\ndiscord:111111111111111111,${source},9000000000000000000\r\n`;
 assert(balanceSnapshotMaterial(snap).includes('|9000000000000000000|'));const report=reconcileBalances(snap,csv,'18000000000000000000',hash(csv));assert.equal(report.totalMatches,true);assert.equal(report.comparisonComplete,true);assert.equal(report.wouldWrite,false);assert.equal(report.mappingVerifiedBySystem,false);assert.equal(JSON.stringify(snap),before);
 const duplicate=`external_id,cc_user_id,bucks\ntwitch:123,${user},1\ntwitch:123,${user},1`;assert.equal(reconcileBalances(snap,duplicate,'2',hash(duplicate)).comparisonComplete,false);
 assert.throws(()=>parseExternalBalances('name,bucks\nname,10'));assert.throws(()=>parseExternalBalances(`external_id,cc_user_id,bucks\ntwitch:123,${user},=1+1`));
});
test('Durable local source queue retries the same body and archives only acknowledged references',async()=>{
 assert.equal((await processQueueOnce(null,async()=>{throw Error('must not send');})).disabled,true);
 const dir=await mkdtemp(path.join(os.tmpdir(),'besc-f5-bridge-'));
 try{
  const env={BESC_REFERENCE_FORWARD_ENABLED:'true',BESC_REFERENCE_API_URL:'https://example.invalid/api/v1/integrations/campaigns/references',BESC_REFERENCE_SOURCE_ID:source,BESC_REFERENCE_BROADCASTER_ID:'123',BESC_REFERENCE_API_KEY:`bcr_fixture-source.${'a'.repeat(43)}`,BESC_REFERENCE_QUEUE_DIR:dir};
  const config=loadBridgeConfig(env),reference={schemaVersion:1,kind:'clip',reference_id:'clip:TESTFIXTURE',canonical_url:'https://clips.twitch.tv/TESTFIXTURE',occurred_at:new Date().toISOString()};await mkdir(path.join(dir,'inbox'));
  await writeFile(path.join(dir,'inbox',referenceKey(reference)+'.json'),JSON.stringify(reference));const sent:string[]=[];
  await processQueueOnce(config,async(_url,options)=>{sent.push(String(options?.body));return new Response(null,{status:503});},Date.now());
  await processQueueOnce(config,async(_url,options)=>{sent.push(String(options?.body));return Response.json({receiptId:user,accepted:true,providerVerified:false,awarded:false,replay:true});},Date.now()+10000);
  assert.equal(sent.length,2);assert.equal(sent[0],sent[1]);assert.equal((await readdir(path.join(dir,'inbox'))).length,0);assert.equal((await readdir(path.join(dir,'sent'))).length,1);
  const changed=loadBridgeConfig({...env,BESC_REFERENCE_SOURCE_ID:user});await assert.rejects(processQueueOnce(changed,async()=>{throw Error('must not send');}),/queue_binding_changed/);
 }finally{assert.equal(path.dirname(dir),path.resolve(os.tmpdir()));assert(path.basename(dir).startsWith('besc-f5-bridge-'));await rm(dir,{recursive:true});}
});
