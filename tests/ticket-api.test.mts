import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { handleTicketRequest, type TicketStore } from "../src/lib/ticket-api.ts";
import { hashBotKey, BotRateLimiter, parseBotClients, type BotClient } from "../src/lib/bot-api.ts";
import { hasPermission } from "../src/lib/permissions.ts";
import { canViewInternalPath } from "../src/lib/route-permissions.ts";

const org="10000000-0000-4000-8000-000000000001",guild="1067893182387474432",actor="111111111111111111",parent="222222222222222222";
const key=`bb_ticket-fixture.${"a".repeat(43)}`;
const client:BotClient={id:"ticket-fixture",keyHash:hashBotKey(key),organizationId:org,guildId:guild,
 scopes:["tickets:create","tickets:own:read","tickets:ingest","tickets:deliver"],ticketParentChannelId:parent,expiresAt:"2099-01-01",revoked:false};
const id="20000000-0000-4000-8000-000000000001";
function fixture(c=client){
 const calls:unknown[][]=[];
 const store:TicketStore={async operation(...args){calls.push(args);return {ticketId:id};}};
 const run=(path="tickets",data:Record<string,unknown>={guild_id:guild,discord_user_id:actor,parent_channel_id:parent,subject:"TESTFIXTURE",content:"Niet publiceren"},extra:Record<string,string>={},method="POST")=>
  handleTicketRequest(new Request(`https://example.invalid/api/v1/bot/${path}`,{method,headers:{authorization:`Bearer ${key}`,"content-type":"application/json","idempotency-key":actor,...extra},...(method==="GET"?{}:{body:JSON.stringify(data)})}),{clients:[c],store,limiter:new BotRateLimiter(1000)});
 return{run,calls,store};
}
test("Unlinked ticket intake uses server org/client/guild and never reads account identity",async()=>{
 const f=fixture();assert.equal((await f.run()).status,201);assert.equal(f.calls.length,1);
 const args=f.calls[0];assert.deepEqual(args.slice(0,4),[org,client.id,guild,"create"]);
 assert.equal((args[4] as Record<string,unknown>).discord_user_id,actor);
 assert.match(String((args[4] as Record<string,unknown>).request_hash),/^[a-f0-9]{64}$/);
});
for(const mode of ["missing","wrong","revoked","expired","scope"])test(`Intake denied before effect: ${mode}`,async()=>{
 const c={...client,revoked:mode==="revoked",expiresAt:mode==="expired"?"2000-01-01":client.expiresAt,scopes:mode==="scope"?["identity:read" as const]:client.scopes};
 const f=fixture(c);const headers:Record<string,string>=mode==="missing"?{authorization:""}:mode==="wrong"?{authorization:`Bearer bb_ticket-fixture.${"b".repeat(43)}`} : {};
 const result=await f.run(undefined,undefined,headers);assert.equal(result.status,mode==="scope"?403:401);assert.equal(f.calls.length,0);
});
for(const field of ["organization_id","client_id","status","assigned_to","request_hash","actor_id"])test(`No request override ${field}`,async()=>{
 const f=fixture();const r=await f.run("tickets",{guild_id:guild,discord_user_id:actor,parent_channel_id:parent,subject:"TEST",content:"x",[field]:"override"});
 assert.equal(r.status,400);assert.equal(f.calls.length,0);
});
test("Wrong guild/channel and invalid body lengths cannot cause effects",async()=>{
 for(const patch of [{guild_id:actor},{parent_channel_id:actor},{content:" "},{content:"x".repeat(4001)},{subject:"x".repeat(161)},{discord_user_id:"invalid"}]){
  const f=fixture();assert.ok([400,403].includes((await f.run("tickets",{guild_id:guild,discord_user_id:actor,parent_channel_id:parent,subject:"TEST",content:"x",...patch})).status));assert.equal(f.calls.length,0);
 }
 const f=fixture();assert.equal((await f.run(undefined,undefined,{"content-length":"20000"})).status,413);
});
test("Canonical payload hash independent of JSON property order",async()=>{
 const f=fixture();await f.run();await f.run("tickets",{content:"Niet publiceren",subject:"TESTFIXTURE",parent_channel_id:parent,discord_user_id:actor,guild_id:guild});
 assert.equal((f.calls[0][4] as Record<string,unknown>).request_hash,(f.calls[1][4] as Record<string,unknown>).request_hash);
});
test("Ingest hash also binds ticket ID",async()=>{
 const f=fixture(),data={guild_id:guild,discord_user_id:actor,parent_channel_id:parent,thread_id:parent,source_message_id:parent,content:"x"};
 await f.run(`tickets/${id}/messages`,data,{"idempotency-key":parent});
 await f.run("tickets/20000000-0000-4000-8000-000000000002/messages",data,{"idempotency-key":parent});
 assert.notEqual((f.calls[0][4] as Record<string,unknown>).request_hash,(f.calls[1][4] as Record<string,unknown>).request_hash);
});
test("Chunked oversized body and stalled body are cancelled without a store effect",async()=>{
 for(const stalled of [false,true]){
  let cancelled=false;
  const stream=new ReadableStream({start(controller){if(!stalled)controller.enqueue(new Uint8Array(17000));},cancel(){cancelled=true;}});
  const f=fixture();const request=new Request("https://example.invalid/api/v1/bot/tickets",{method:"POST",headers:{authorization:`Bearer ${key}`,"content-type":"application/json"},body:stream,duplex:"half"} as RequestInit);
  const response=await handleTicketRequest(request,{clients:[client],store:f.store,limiter:new BotRateLimiter(1000)});
  assert.equal(response.status,stalled?408:413);assert.equal(f.calls.length,0);assert.equal(cancelled,true);
 }
});
test("Own read rejects duplicate query keys and only accepts controlled actor",async()=>{
 const f=fixture();assert.equal((await f.run(`tickets/${id}?guild_id=${guild}&discord_user_id=${actor}`,{}, {},"GET")).status,200);
 assert.equal((await f.run(`tickets/${id}?guild_id=${guild}&discord_user_id=${actor}&discord_user_id=${actor}`,{}, {},"GET")).status,400);
});
test("Ingest key must be source message ID and API rejects attachment/webhook overrides",async()=>{
 const f=fixture();const d={guild_id:guild,discord_user_id:actor,parent_channel_id:parent,thread_id:parent,source_message_id:parent,content:"hello"};
 assert.equal((await f.run(`tickets/${id}/messages`,d)).status,400);
 assert.equal((await f.run(`tickets/${id}/messages`,d,{"idempotency-key":parent})).status,200);
 assert.equal((await f.run(`tickets/${id}/messages`,{...d,attachments:["secret"]},{"idempotency-key":parent})).status,400);
});
test("Failure codes are bounded, with no arbitrary error content",async()=>{
 const f=fixture();const d={guild_id:guild,worker_id:"worker_123",lease_token:id,error_code:"secret body",uncertain:true};
 assert.equal((await f.run(`ticket-deliveries/${id}/fail`,d)).status,400);assert.equal(f.calls.length,0);
 assert.equal((await f.run(`ticket-deliveries/${id}/fail`,{...d,error_code:"outcome_unknown"})).status,200);
});
test("Known store failures map safely; unknown failure and thrown secret are sanitized",async()=>{
 const f=fixture();f.store.operation=async()=>({error:"idempotency_conflict"});assert.equal((await f.run()).status,409);
 f.store.operation=async()=>{throw Error("TOKEN=never_publish");};const r=await f.run();assert.equal(r.status,503);assert.equal((await r.text()).includes("TOKEN"),false);assert.equal(r.headers.get("cache-control"),"no-store");
});
test("Ticket scope requires fixed configured parent channel without changing old clients",()=>{
 assert.equal(parseBotClients(JSON.stringify([client])).length,1);
 assert.throws(()=>parseBotClients(JSON.stringify([{...client,ticketParentChannelId:undefined}])));
 assert.equal(parseBotClients(JSON.stringify([{...client,ticketParentChannelId:undefined,scopes:["events:read"]}])).length,1);
});
for(const role of ["admin","board","member","volunteer"])test(`Ticket page and staff capability match for ${role}`,()=>{
 const base={role,finance_role:"none"};const allowed=["admin","board"].includes(role);
 assert.equal(hasPermission(base,"manageTickets"),allowed);assert.equal(canViewInternalPath("/app/tickets/x",base),allowed);
 assert.equal(canViewInternalPath("/app/tickets",{...base,capabilities:["manageTickets"]}),true);
 assert.equal(canViewInternalPath("/app/events",{...base,capabilities:["manageTickets"]}),role!=="volunteer");
});
test("Shared bot contract fixtures are accepted by actual API validation",async()=>{
 const fixtures=JSON.parse(readFileSync(new URL("../docs/contracts/ticketing-v1.fixtures.json",import.meta.url),"utf8"));
 assert.equal(fixtures.contract,"besc-ticketing-v1");
 for(const name of ["intake","own","ingest","claim","createThreadComplete","sendMessageComplete","uncertainFailure"]){
  const example=fixtures[name];const f=fixture();
  const headers:Record<string,string>={};
  if(example.idempotencyKey)headers["idempotency-key"]=name==="intake"?actor:example.idempotencyKey;
  const response=await f.run(example.path.replace("/api/v1/bot/",""),example.body??{},headers,example.method);
  assert.equal(response.status,name==="intake"?201:200,name);assert.equal(f.calls.length,1);
 }
});
