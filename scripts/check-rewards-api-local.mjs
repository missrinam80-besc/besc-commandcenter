import assert from "node:assert/strict";
import { createHash,randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { createServer as httpServer } from "node:http";
import { once } from "node:events";
// Only loopback fixtures. No real account, client, database, Discord or mail.
const examples=JSON.parse(readFileSync(new URL("../tests/fixtures/rewards-v1.json",import.meta.url),"utf8"));
const uid="20000000-0000-4000-8000-000000000003",org="10000000-0000-4000-8000-000000000001";
const key=`bb_fixture-rewards.${randomBytes(32).toString("base64url")}`;
const reservation=createServer();reservation.listen(0,"127.0.0.1");await once(reservation,"listening");
const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
let mode="ok",stalled=false,closed=false;
const upstream=httpServer(async(req,res)=>{
 if(mode==="stall-body"){
  stalled=true;req.socket.once("close",()=>{closed=true;});res.writeHead(200,{"Content-Type":"application/json"});res.write('{"id":');return;
 }
 res.setHeader("Content-Type","application/json");
 if(req.url.startsWith("/rest/v1/profiles"))return res.end(JSON.stringify({id:uid}));
 if(req.url.startsWith("/auth/v1/admin/users/"))return res.end(JSON.stringify({id:uid,identities:[{id:examples.discordUserId,provider:"discord",identity_data:{provider_id:examples.discordUserId}}]}));
 if(req.url.startsWith("/rest/v1/organization_members"))return res.end(JSON.stringify({organization_id:org,status:"active",role:"member",finance_role:"none",organization_access_roles:null}));
 if(req.url==="/rest/v1/rpc/rewards_bot"){
  const chunks=[];for await(const part of req)chunks.push(part);const body=JSON.parse(Buffer.concat(chunks));
  assert.equal(body.o,org);assert.equal(body.g,examples.guildId);assert.equal(body.u,uid);
  if(body.op==="account"){
   const data={...examples.account};delete data.schemaVersion;delete data.nextOffset;return res.end(JSON.stringify(data));
  }
  if(body.op==="request"){
   assert.equal(body.c,"discord-command");assert.equal(body.k,`${examples.guildId}:command:${examples.requestEnvelope.idempotency_key}`);
   const data={...examples.requestAccepted};delete data.schemaVersion;return res.end(JSON.stringify(data));
  }
 }
 res.statusCode=503;res.end(JSON.stringify({message:"TESTFIXTURE unknown upstream operation"}));
});
upstream.listen(0,"127.0.0.1");await once(upstream,"listening");
const url=`http://127.0.0.1:${upstream.address().port}`;
const child=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port",String(port)],{
 cwd:fileURLToPath(new URL("../",import.meta.url)),stdio:["ignore","pipe","pipe"],windowsHide:true,
 env:{...process.env,NEXT_TELEMETRY_DISABLED:"1",SUPABASE_URL_SERVER:url,NEXT_PUBLIC_SUPABASE_URL:url,
  SUPABASE_SECRET_KEY:"TESTFIXTURE-NOT-A-REAL-SECRET",NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"TESTFIXTURE-NOT-A-REAL-KEY",
  BESC_REWARDS_ACTIVITY_ENABLED:"false",BESC_BOT_CLIENTS_JSON:JSON.stringify([{id:"fixture-rewards",keyHash:createHash("sha256").update(key).digest("hex"),organizationId:org,guildId:examples.guildId,scopes:["rewards:own:read","rewards:own:write","rewards:activity:ingest"],expiresAt:"2099-01-01T00:00:00Z",revoked:false}])},
});
child.stdout.resume();child.stderr.resume();const exited=once(child,"exit");
try{
 const base=`http://127.0.0.1:${port}/api/v1/bot/rewards/`,headers={authorization:`Bearer ${key}`};
 let ready=false;for(let n=0;n<100;n++){
  if(child.exitCode!==null)throw Error("Local Next process exited");
  try{await fetch(`${base}config?guild_id=${examples.guildId}`,{signal:AbortSignal.timeout(300)});ready=true;break;}catch{await new Promise(resolve=>setTimeout(resolve,100));}
 }
 assert.equal(ready,true);
 assert.equal((await fetch(`${base}account?guild_id=${examples.guildId}`)).status,401);
 const config=await fetch(`${base}config?guild_id=${examples.guildId}`,{headers});assert.equal(config.status,200);assert.deepEqual(await config.json(),examples.configDisabled);
 assert.equal(config.headers.get("cache-control"),"no-store");
 assert.equal((await fetch(`${base}config?guild_id=222222222222222222`,{headers})).status,403);
 const personal=`${base}account?guild_id=${examples.guildId}&discord_user_id=${examples.discordUserId}`;
 const account=await fetch(personal,{headers});assert.equal(account.status,200);assert.deepEqual(await account.json(),examples.account);
 const request=await fetch(`${base}requests`,{method:"POST",headers:{...headers,"content-type":"application/json"},body:JSON.stringify(examples.requestEnvelope)});
 assert.equal(request.status,200);assert.deepEqual(await request.json(),examples.requestAccepted);
 const inactive=await fetch(`${base}activity`,{method:"POST",headers:{...headers,"content-type":"application/json"},body:JSON.stringify(examples.voiceEnvelope)});assert.equal(inactive.status,409);
 mode="stall-body";const start=Date.now();const timeout=await fetch(personal,{headers,signal:AbortSignal.timeout(8000)});
 assert.equal(timeout.status,503);assert.equal((await timeout.json()).error.code,"upstream_unavailable");assert.ok(Date.now()-start<7500);assert.equal(stalled,true);
 for(let n=0;n<100&&!closed;n++)await new Promise(resolve=>setTimeout(resolve,10));assert.equal(closed,true,"Echte upstreambody moet worden geannuleerd");
 console.info("PASS: lokale Bucks-API met accountidentity, ingestelde organisatie/guild, idempotency-namespace, uitgeschakelde activiteit en echte responsebodyannulering. Geen Cloud of Discord benaderd.");
}finally{child.kill();await exited;upstream.close();upstream.closeAllConnections();}
