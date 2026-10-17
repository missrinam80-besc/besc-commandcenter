import assert from "node:assert/strict";
import test from "node:test";
import { handleRewardsBotRequest } from "../src/lib/rewards-bot-api.ts";
import { hashBotKey, parseBotClients, type BotClient } from "../src/lib/bot-api.ts";
import { rewardSchemas } from "../src/lib/rewards.ts";
import { hasPermission } from "../src/lib/permissions.ts";
import { canViewInternalPath, requiredCapabilityForQuery } from "../src/lib/route-permissions.ts";
import { readFileSync } from "node:fs";
const guild="1067893182387474432", actor="111111111111111111", channel="1558853872766689382", org="10000000-0000-4000-8000-000000000001",uid="20000000-0000-4000-8000-000000000003";
const token="bb_fixture-rewards."+"a".repeat(43);
const client:BotClient={id:"fixture-rewards",keyHash:hashBotKey(token),organizationId:org,guildId:guild,revoked:false,expiresAt:"2099-01-01T00:00:00Z",scopes:["rewards:own:read","rewards:own:write","rewards:activity:ingest"]};
function fixture(patch:Partial<Parameters<typeof handleRewardsBotRequest>[1]>={}){
 const calls:{op:string;actor:string|null;data:Record<string,unknown>;key?:string}[]=[];
 return {calls,deps:{clients:[client],activityEnabled:false,
  identity:{async findAccount(){return {userId:uid,verifiedDiscordId:actor,banned:false};},async findMembership(){return {organization_id:org,status:"active",role:"member",finance_role:"none"};}},
  store:()=>({async operation(op:string,user:string|null,data:Record<string,unknown>,key?:string){calls.push({op,actor:user,data,key});return {ok:true};}}),...patch}};
}
const get=(path="account",q=`guild_id=${guild}&discord_user_id=${actor}`,key=token)=>new Request(`https://fixture.invalid/api/v1/bot/rewards/${path}?${q}`,{headers:{authorization:`Bearer ${key}`}});
const post=(path:string,data:Record<string,unknown>,patch:Record<string,unknown>={})=>new Request(`https://fixture.invalid/api/v1/bot/rewards/${path}`,{method:"POST",headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},body:JSON.stringify({guild_id:guild,discord_user_id:actor,idempotency_key:"1558853872766689382",data,...patch})});
test("Bucks API: beperkte nieuwe scopes worden gevalideerd zonder oude clients te wijzigen",()=>{
 assert.deepEqual(parseBotClients(JSON.stringify([client])),[client]);assert.throws(()=>parseBotClients(JSON.stringify([{...client,scopes:["rewards:all"]}])));
});
test("Bucks API: clientauthenticatie, verlopen/intrekken, scopes en guildbinding",async()=>{
 for(const changed of [{revoked:true},{expiresAt:"2020-01-01T00:00:00Z"}]){const f=fixture({clients:[{...client,...changed}]});assert.equal((await handleRewardsBotRequest(get(),f.deps)).status,401);assert.equal(f.calls.length,0);}
 const f=fixture({clients:[{...client,scopes:["identity:read"]}]});assert.equal((await handleRewardsBotRequest(get(),f.deps)).status,403);
 const g=fixture();assert.equal((await handleRewardsBotRequest(get("account",`guild_id=222222222222222222&discord_user_id=${actor}`),g.deps)).status,403);assert.equal(g.calls.length,0);
 assert.equal((await handleRewardsBotRequest(get("account",undefined,"wrong"),g.deps)).status,401);
});
test("Bucks API: actuele identity, blokkering en actief lidmaatschap worden opnieuw gecontroleerd",async()=>{
 for(const identity of [
  {async findAccount(){return null;}},
  {async findAccount(){return {userId:uid,verifiedDiscordId:"222222222222222222",banned:false};}},
  {async findAccount(){return {userId:uid,verifiedDiscordId:actor,banned:true};}},
 ]){const base=fixture();const f=fixture({identity:{...base.deps.identity,...identity}});assert.equal((await handleRewardsBotRequest(get(),f.deps)).status,404);assert.equal(f.calls.length,0);}
 const f=fixture();f.deps.identity.findMembership=async()=>({organization_id:org,status:"pending",role:"member",finance_role:"none"});assert.equal((await handleRewardsBotRequest(get(),f.deps)).status,403);
});
test("Bucks API: minimale eigen projectie en geen vrij gekozen organisatie of actor",async()=>{
 const f=fixture();const r=await handleRewardsBotRequest(get(),f.deps);assert.equal(r.status,200);assert.equal(r.headers.get("cache-control"),"no-store");assert.equal(f.calls[0].actor,uid);
 assert.equal((await handleRewardsBotRequest(get("account",`guild_id=${guild}&discord_user_id=${actor}&organization_id=${org}`),f.deps)).status,400);
 const bad=post("requests",{reward_id:org,version:1,user_id:uid});assert.equal((await handleRewardsBotRequest(bad,f.deps)).status,400);
});
test("Bucks API: paginering en dubbele queryparameters zijn begrensd",async()=>{
 for(const q of [`offset=99976`,`offset=-1`,`offset=1&offset=2`,`discord_user_id=${actor}`]){
  const f=fixture();assert.equal((await handleRewardsBotRequest(get("account",`guild_id=${guild}&discord_user_id=${actor}&${q}`),f.deps)).status,400);
 }
 const f=fixture();assert.equal((await handleRewardsBotRequest(get("requests",`guild_id=${guild}&discord_user_id=${actor}&offset=99975`),f.deps)).status,200);
});
test("Bucks API: uitgeschakelde activiteit verstuurt niets naar datalaag en config is leeg",async()=>{
 const f=fixture();const r=await handleRewardsBotRequest(post("activity",{kind:"text",channel_id:channel,occurred_at:new Date().toISOString()}),f.deps);assert.equal(r.status,409);assert.equal(f.calls.length,0);
 const c=await handleRewardsBotRequest(get("config",`guild_id=${guild}`),f.deps);assert.deepEqual(await c.json(),{schemaVersion:1,enabled:false,rules:[]});assert.equal(f.calls.length,0);
});
test("Bucks API: tekstgebeurtenis moet een echt getimed Discord-ID hebben",async()=>{
 const f=fixture({activityEnabled:true}),now=Date.now(),id=((BigInt(now-1420070400000)<<BigInt(22))).toString();
 const data={kind:"text",channel_id:channel,occurred_at:new Date(now).toISOString()};
 assert.equal((await handleRewardsBotRequest(post("activity",data,{idempotency_key:id}),f.deps)).status,200);assert.equal(f.calls[0].key,`${guild}:text:${id}`);
 assert.equal((await handleRewardsBotRequest(post("activity",data),f.deps)).status,400);
});
test("Bucks API: voice levert begrensde feiten, geen puntenbedragen of berichtinhoud",async()=>{
 const data={kind:"voice",channel_id:channel,occurred_at:new Date().toISOString(),started_at:new Date(Date.now()-60000).toISOString(),eligible_participants:2,muted:false,deafened:false,afk:false};
 const f=fixture({activityEnabled:true});assert.equal((await handleRewardsBotRequest(post("activity",data),f.deps)).status,200);
 assert.equal((await handleRewardsBotRequest(post("activity",{...data,bucks:500}),f.deps)).status,400);
 assert.equal((await handleRewardsBotRequest(post("activity",{...data,content:"TESTFIXTURE"}),f.deps)).status,400);
});
test("Bucks API: businessconflicten zijn veilig en opslagfouten tonen geen details",async()=>{
 const f=fixture({store:()=>({async operation(){return {error:"idempotency_conflict"};}})});assert.equal((await handleRewardsBotRequest(post("requests",{reward_id:org,version:1}),f.deps)).status,409);
 const g=fixture({store:()=>({async operation(){throw Error("TESTFIXTURE private database detail");}})});const r=await handleRewardsBotRequest(get(),g.deps);assert.equal(r.status,503);assert.equal((await r.text()).includes("private"),false);
});
test("Bucks API: onbekende velden, te grote bodies, methoden en beheerroutes geweigerd",async()=>{
 const f=fixture();assert.equal((await handleRewardsBotRequest(post("requests",{reward_id:org,version:1},{organization_id:org}),f.deps)).status,400);
 assert.equal((await handleRewardsBotRequest(post("decide",{}),f.deps)).status,404);
 assert.equal((await handleRewardsBotRequest(post("account",{}),f.deps)).status,405);
 const r=post("requests",{});r.headers.set("content-length","10000");assert.equal((await handleRewardsBotRequest(r,f.deps)).status,413);
 assert.equal((await handleRewardsBotRequest(post(`requests/${org}/cancel`,{id:uid,version:1}),f.deps)).status,400);
});
test("Bucks: aparte bevoegdheid en serveractieconfiguratie zonder automatische activering",()=>{
 assert.equal(hasPermission({role:"volunteer",finance_role:"none",capabilities:["manageTickets","manageDiscordBot"]},"manageRewards"),false);
 assert.equal(hasPermission({role:"volunteer",finance_role:"none",capabilities:["manageRewards"]},"manageRewards"),true);
 assert.equal(canViewInternalPath("/app/bucks",{role:"volunteer",finance_role:"none"}),true);
 assert.equal(requiredCapabilityForQuery("/app/bucks",new URLSearchParams("tab=regels")),"manageRewards");
 assert.equal(rewardSchemas.rule_save.safeParse({guild_id:guild,kind:"text",channel_ids:[],xp:1,bucks:0,cooldown_seconds:60,daily_xp:10,daily_bucks:0,enabled:true,version:0}).success,false);
 assert.equal(rewardSchemas.levels_save.safeParse({version:0,thresholds:[100,50]}).success,false);
});
test("Bucks API: gedeelde fixtures volgen werkelijk geprojecteerde responses en veldvalidatie",async()=>{
 const examples=JSON.parse(readFileSync(new URL("./fixtures/rewards-v1.json",import.meta.url),"utf8"));
 for(const [resource,response] of [["account",examples.account],["catalog",examples.catalog],["requests",examples.requests]] as const){
  const data={...response};delete data.schemaVersion;delete data.nextOffset;
  const f=fixture({store:()=>({async operation(){return data;}})});const r=await handleRewardsBotRequest(get(resource),f.deps);
  assert.equal(r.status,200);assert.deepEqual(await r.json(),response);
 }
 assert.equal(rewardSchemas.activity.safeParse(examples.voiceEnvelope.data).success,true);
 assert.equal(rewardSchemas.request.safeParse(examples.requestEnvelope.data).success,true);
});
