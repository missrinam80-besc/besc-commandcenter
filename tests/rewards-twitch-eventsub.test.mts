import assert from 'node:assert/strict';
import test from 'node:test';
import {createHmac} from 'node:crypto';
import {handleTwitchRewards,twitchRewardSources,type TwitchRewardFacts} from '../src/lib/rewards-twitch-eventsub.ts';
import {prepareTargetRows} from '../src/lib/rewards-transfer.ts';
const source={organizationId:'10000000-0000-4000-8000-000000000001',broadcasterId:'555',moderatorId:'666',callback:'https://example.invalid/api/v1/integrations/rewards/twitch/fixture',secret:'TESTFIXTURE'+ 'a'.repeat(40),subscriptions:{follow:'sub-follow',cheer:'sub-cheer'}};
const now=Date.parse('2026-11-03T18:00:00Z');
function request(patch:Record<string,unknown>={},headers:Record<string,string>={}){
 const body=JSON.stringify({subscription:{id:'sub-follow',type:'channel.follow',version:'2',status:'enabled',condition:{broadcaster_user_id:'555',moderator_user_id:'666'},transport:{method:'webhook',callback:source.callback}},event:{broadcaster_user_id:'555',user_id:'102',followed_at:'2026-11-03T18:00:00Z',user_name:'MUST NOT PERSIST'},...patch});
 const id='opaque message ID',stamp='2026-11-03T18:00:00.000000000Z';
 return new Request(source.callback,{method:'POST',headers:{'Content-Type':'application/json','Twitch-Eventsub-Message-Id':id,'Twitch-Eventsub-Message-Timestamp':stamp,'Twitch-Eventsub-Message-Type':'notification','Twitch-Eventsub-Subscription-Type':'channel.follow','Twitch-Eventsub-Subscription-Version':'2','Twitch-Eventsub-Message-Signature':'sha256='+createHmac('sha256',source.secret).update(id+stamp+body).digest('hex'),...headers},body});
}
test('RE02 EventSub signature verified on raw bytes; only minimal facts enter store',async()=>{
 const calls:TwitchRewardFacts[]=[];const response=await handleTwitchRewards(request(),source,{enabled:true,now,store:async(_,f)=>{calls.push(f);return {ok:true};}});
 assert.equal(response.status,204);assert.equal(calls.length,1);assert.deepEqual(Object.keys(calls[0]).sort(),['kind','message_id','occurred_at','subscription_id','twitch_user_id']);
});
test('RE02 disabled, forged, expired, wrong subscription and source never enter store',async()=>{
 let calls=0;const deps={enabled:true,now,store:async()=>{calls++;return {ok:true};}};
 assert.equal((await handleTwitchRewards(request(),source,{...deps,enabled:false})).status,404);
 assert.equal((await handleTwitchRewards(request({}, {'Twitch-Eventsub-Message-Signature':'sha256='+'0'.repeat(64)}),source,deps)).status,403);
 assert.equal((await handleTwitchRewards(request(),source,{...deps,now:now+600001})).status,403);
 const wrong={subscription:{id:'not-registered',type:'channel.follow',version:'2',status:'enabled',condition:{broadcaster_user_id:'555',moderator_user_id:'666'},transport:{method:'webhook',callback:source.callback}}};
 assert.equal((await handleTwitchRewards(request(wrong),source,deps)).status,403);assert.equal(calls,0);
});
test('RE02 callback challenge cannot award; revocation is durable store input',async()=>{
 let calls=0;const deps={enabled:true,now,store:async()=>{calls++;return {ok:true};}};
 const pending={subscription:{id:'sub-follow',type:'channel.follow',version:'2',status:'webhook_callback_verification_pending',condition:{broadcaster_user_id:'555',moderator_user_id:'666'},transport:{method:'webhook',callback:source.callback}},challenge:'challenge'};
 const res=await handleTwitchRewards(request(pending,{'Twitch-Eventsub-Message-Type':'webhook_callback_verification'}),source,deps);assert.equal(await res.text(),'challenge');assert.equal(calls,0);
 const revoked={...pending,subscription:{...pending.subscription,status:'authorization_revoked'}};
 assert.equal((await handleTwitchRewards(request(revoked,{'Twitch-Eventsub-Message-Type':'revocation'}),source,deps)).status,204);assert.equal(calls,1);
});
test('RE02 registry rejects weak secrets and duplicate subscriptions',()=>{
 assert.deepEqual(twitchRewardSources(undefined),{});assert.throws(()=>twitchRewardSources(JSON.stringify({fixture:{...source,secret:'weak'}})));
 assert.throws(()=>twitchRewardSources(JSON.stringify({fixture:{...source,subscriptions:{follow:'same',cheer:'same'}}})));
});
test('RE03 frozen canonical values cannot be changed by mapping and totals must match',()=>{
 const id='20000000-0000-4000-8000-000000000002',csv='external_id,bucks\ntwitch:102,100\n',mapping='external_id,cc_user_id\ntwitch:102,'+id;
 assert.deepEqual(prepareTargetRows(csv,mapping,'100'),[{twitch_user_id:'102',user_id:id,target:'100'}]);
 assert.throws(()=>prepareTargetRows(csv,mapping,'101'));assert.throws(()=>prepareTargetRows(csv,mapping+'\ntwitch:103,'+id,'100'));
 assert.throws(()=>prepareTargetRows(csv+'twitch:102,100',mapping,'200'));assert.throws(()=>prepareTargetRows(csv,mapping+',999','100'));
});
