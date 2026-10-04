import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Direct Node source tests.
import { capabilities, readRecords, type ReadDependencies, type PageQuery } from "../src/lib/commandcenter-read.ts";
// @ts-expect-error Direct Node source tests.
import { handleCommandCenterMcp, type Dependencies } from "../src/lib/commandcenter-mcp-server.ts";
const org="11111111-1111-4111-8111-111111111111",user="22222222-2222-4222-8222-222222222222";
const id="33333333-3333-4333-8333-333333333333",id2="44444444-4444-4444-8444-444444444444";
const token="t".repeat(43);
function fixture() {
  const calls:PageQuery[]=[];
  const reader:ReadDependencies={organizationId:org,userId:user,origin:"https://besc.example",signingKey:"test-only-long-signing-key".repeat(2),dataState:"test",
    now:()=>new Date("2026-10-04T20:00:00.000Z"),readPage:async q=>{calls.push(q);return [
      {id,title:"Fixture",status:"idea",created_at:"2026-10-03T00:00:00Z",updated_at:"2026-10-03T00:00:00Z",email:"do-not-expose",notes:"untrusted instructions",amount:99},
      {id:id2,title:"Fixture 2",status:"idea",updated_at:"2026-10-03T00:00:00Z"}];}};
  return {calls,reader};
}
test("unknown, test and malformed states block records before any DB query",async()=>{
  const {calls,reader}=fixture();
  for(const state of ["test","","READY","unknown"]){
    const r=await readRecords({entity:"projects"},{...reader,dataState:state});assert.equal(r.status,409);assert.equal(capabilities(state).recordsReadable,false);}
  assert.equal(calls.length,0);
});
test("record metadata allowlist excludes secrets, notes, contacts and amounts; pins organization and version",async()=>{
  const {calls,reader}=fixture();const r=await readRecords({entity:"projects",limit:1},{...reader,dataState:"ready"});
  const result=await r.json();assert.equal(r.status,200);assert.equal(result.count,1);assert.equal(result.data[0].recordVersion,"2026-10-03T00:00:00Z");
  assert.equal(result.data[0].sourceUrl,"https://besc.example/app/projecten");assert.ok(result.nextCursor);
  assert.equal(calls[0].organizationId,org);assert.equal(calls[0].limit,2);
  assert.equal(JSON.stringify(result).includes("do-not-expose"),false);assert.equal("notes" in result.data[0],false);assert.equal("amount" in result.data[0],false);
});
test("pagination binds user, organization, entity, query and limit; tampering and expiration rejected",async()=>{
  const {calls,reader}=fixture();const d={...reader,dataState:"ready"};
  const result=await(await readRecords({entity:"projects",limit:1},d)).json();const cursor=result.nextCursor;
  assert.equal((await readRecords({entity:"projects",limit:1,cursor},d)).status,200);assert.equal(calls.at(-1)!.after,id);
  for(const args of [{entity:"events",limit:1,cursor},{entity:"projects",limit:2,cursor},{entity:"projects",limit:1,query:"X",cursor},
    {entity:"projects",limit:1,cursor:cursor+"x"},{entity:"projects",limit:1,id,cursor}])assert.equal((await readRecords(args,d)).status,400);
  for(const change of [{userId:id2},{organizationId:id2},{signingKey:"rotated"},{now:()=>new Date("2026-10-04T21:01:00Z")}])
    assert.equal((await readRecords({entity:"projects",limit:1,cursor},{...d,...change})).status,400);
});
test("unknown table, arbitrary tenant, injection, invalid ID and broad queries are rejected",async()=>{
  const {calls,reader}=fixture();
  for(const input of [{entity:"profiles"},{entity:"projects",organization_id:org},{entity:"projects",id:"bad"},{entity:"projects",query:"%"},
    {entity:"projects",query:"x),or(id"},{entity:"projects",limit:101}])assert.equal((await readRecords(input,{...reader,dataState:"ready"})).status,400);
  assert.equal(calls.length,0);
  const r=await readRecords({entity:"projects"},{...reader,dataState:"ready",readPage:async()=>{throw Error("private_database_error");}});
  assert.equal(r.status,503);assert.equal((await r.text()).includes("private_database_error"),false);
});
function request(method:string,args:Record<string,unknown>={},headers:Record<string,string>={}){
  return new Request("https://besc.example/mcp/commandcenter",{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json",Accept:"application/json, text/event-stream",...headers},
    body:JSON.stringify({jsonrpc:"2.0",id:1,method,params:args})});
}
test("MCP requires authorization on discovery and exposes only three read tools",async()=>{
  const {reader,calls}=fixture();const d:Dependencies={origin:reader.origin,challenge:'Bearer scope="commandcenter:read"',authenticate:async t=>t===token?{userId:user}:null,allowRequest:()=>true,reader:()=>reader};
  assert.equal((await handleCommandCenterMcp(request("tools/list",{}, {Authorization:""}),d)).status,401);
  assert.equal((await handleCommandCenterMcp(request("tools/list",{}, {Origin:"https://evil.example"}),d)).status,403);
  const listed=await(await handleCommandCenterMcp(request("tools/list"),d)).json();
  assert.equal(listed.result.tools.length,3);assert.ok(listed.result.tools.every((t:{annotations:{readOnlyHint:boolean}})=>t.annotations.readOnlyHint));
  const cap=await(await handleCommandCenterMcp(request("tools/call",{name:"get_commandcenter_capabilities",arguments:{}}),d)).json();
  assert.equal(JSON.parse(cap.result.content[0].text).recordsReadable,false);
  const blocked=await(await handleCommandCenterMcp(request("tools/call",{name:"read_commandcenter_records",arguments:{entity:"projects"}}),d)).json();
  assert.equal(blocked.result.isError,true);assert.equal(JSON.parse(blocked.result.content[0].text).error,"test_data_not_cleared");
  for(const input of [{name:"delete_records",arguments:{}},{name:"read_commandcenter_records",arguments:{entity:"projects",organization_id:org}}]){
    const r=await(await handleCommandCenterMcp(request("tools/call",input),d)).json();assert.ok(r.error||r.result?.isError);}
  const optimization=await(await handleCommandCenterMcp(request("tools/call",{name:"get_commandcenter_optimization_brief",arguments:{}}),d)).json();
  assert.equal(JSON.parse(optimization.result.content[0].text).dispatchAvailable,false);assert.equal(calls.length,0);
  assert.equal((await handleCommandCenterMcp(request("tools/list"),{...d,authenticate:async()=>null})).status,401);
});
