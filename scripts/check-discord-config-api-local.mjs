import assert from 'node:assert/strict';
import { createHash,randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer as netServer } from 'node:net';
import { createServer } from 'node:http';
import {readFileSync} from 'node:fs';
import { once } from 'node:events';
const org='10000000-0000-4000-8000-000000000001',guild='1067893182387474432',actor='111111111111111111',parent='222222222222222222';
const key=`bb_config-http-fixture.${randomBytes(32).toString('base64url')}`,readKey=`bb_read-http-fixture.${randomBytes(32).toString('base64url')}`;
let mode='normal',calls=0,closed=false;
const upstream=createServer(async(req,res)=>{
 if(mode==='stall'){res.writeHead(200,{'content-type':'application/json'});res.write('{');req.socket.once('close',()=>{closed=true;});return;}
 if(req.url.startsWith('/rest/v1/profiles')){res.writeHead(200,{'content-type':'application/json'});res.end('[]');return;}
 let text='';for await(const chunk of req)text+=chunk;
 assert.equal(req.url,'/rest/v1/rpc/discord_bot_operation');
 const data=JSON.parse(text);assert.equal(data.p_org,org);assert.equal(data.p_client,'config-http-fixture');assert.equal(data.p_guild,guild);calls++;
 const f=JSON.parse(readFileSync(new URL('../docs/contracts/ticketing-v2.fixtures.json',import.meta.url),'utf8'));const responses={report:{recorded:true},config:f.configResponse,revision:f.typeRevisionResponse,intent:f.intentResponse,intake:f.intakeResponse,claim:{deliveries:[]},complete:{recorded:true},fail:{recorded:true},inspect:{withdrawn:false}};
 res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(responses[data.p_op]));
});
upstream.listen(0,'127.0.0.1');await once(upstream,'listening');
const reservation=netServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
const upstreamUrl=`http://127.0.0.1:${upstream.address().port}`;
const configs=[[key,'config-http-fixture',['tickets:create','bot-config:read','bot-config:report','bot-config:deliver']],[readKey,'read-http-fixture',['identity:read','account:read','events:read']]].map(([k,c,scopes])=>({id:c,keyHash:createHash('sha256').update(k).digest('hex'),organizationId:org,guildId:guild,scopes,ticketParentChannelId:parent,expiresAt:'2099-01-01',revoked:false}));
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{cwd:fileURLToPath(new URL('../',import.meta.url)),windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,NEXT_TELEMETRY_DISABLED:'1',SUPABASE_URL_SERVER:upstreamUrl,NEXT_PUBLIC_SUPABASE_URL:upstreamUrl,SUPABASE_SECRET_KEY:'TESTFIXTURE-NOT-A-REAL-SECRET',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'TESTFIXTURE-NOT-A-REAL-KEY',BESC_BOT_CLIENTS_JSON:JSON.stringify(configs)}});
child.stdout.resume();child.stderr.resume();const exited=once(child,'exit');
try{
 const base=`http://127.0.0.1:${port}/api/v1/bot/`,headers={authorization:`Bearer ${key}`,'content-type':'application/json','idempotency-key':actor};
 let ready=false;for(let n=0;n<100;n++){if(child.exitCode!==null)throw Error('Next process exited');try{await fetch(base+'identity',{signal:AbortSignal.timeout(300)});ready=true;break;}catch{await new Promise(resolve=>setTimeout(resolve,100));}}assert.equal(ready,true);
 const post=(path,body,extra={})=>fetch(base+path,{method:'POST',headers:{...headers,...extra},body:JSON.stringify(body),signal:AbortSignal.timeout(8000)});
 const f=JSON.parse(readFileSync(new URL('../docs/contracts/ticketing-v2.fixtures.json',import.meta.url),'utf8'));
 assert.equal((await post('ticket-intents',f.requests.find(r=>r.name==='slash-intent').body,{authorization:''})).status,401);
 assert.equal((await post('bot-runtime/report',f.requests[0].body,{authorization:`Bearer ${readKey}`})).status,403);assert.equal(calls,0);
 for(const item of f.requests){const response=item.method==='GET'?await fetch(base+item.path,{headers,signal:AbortSignal.timeout(8000)}):await post(item.path,item.body);assert.ok([200,201].includes(response.status),item.name+': '+response.status);assert.equal(response.headers.get('cache-control'),'no-store');await response.json();}assert.equal(calls,f.requests.length);
 mode='stall';const started=Date.now();const failed=await post('bot-config-deliveries/claim',{guild_id:guild,worker_id:'worker_123'});assert.equal(failed.status,503);assert.equal((await failed.json()).error.code,'upstream_unavailable');assert.ok(Date.now()-started<7500);
 for(let n=0;n<100&&!closed;n++)await new Promise(resolve=>setTimeout(resolve,10));assert.equal(closed,true,'Responsebody fetch was not cancelled');
 console.info('PASS: all schema-2 fixture requests through actual local Next.js routes, scope/auth denial and real stalled-body cancellation. No Cloud or Discord connections.');
}finally{child.kill();await exited;upstream.close();upstream.closeAllConnections();}
