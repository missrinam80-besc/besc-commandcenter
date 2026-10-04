// Synthetic production HTTP check; no real account, token, or database connection.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
const port=3111,base=`http://127.0.0.1:${port}`,origin=`https://127.0.0.1:${port}`;
const child=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port",String(port)],{
  windowsHide:true,stdio:["ignore","ignore","ignore"],env:{...process.env,
    COMMANDCENTER_MCP_ENABLED:"true",COMMANDCENTER_MCP_ORIGIN:origin,COMMANDCENTER_MCP_SIGNING_KEY:randomBytes(32).toString("hex"),
    COMMANDCENTER_MCP_ORGANIZATION_ID:"11111111-1111-4111-8111-111111111111",COMMANDCENTER_MCP_DATA_STATE:"test",
    SUPABASE_URL_SERVER:"http://127.0.0.1:9",SUPABASE_SECRET_KEY:"synthetic-only",NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"synthetic-only"}});
try{
  let ready=false;
  for(let i=0;i<60;i++){
    try{await fetch(`${base}/.well-known/oauth-protected-resource/mcp/commandcenter`);ready=true;break;}
    catch{await new Promise(resolve=>setTimeout(resolve,200));}}
  assert.ok(ready,"HTTP server not available");
  const protectedResource=await(await fetch(`${base}/.well-known/oauth-protected-resource/mcp/commandcenter`)).json();
  assert.equal(protectedResource.resource,`${origin}/mcp/commandcenter`);
  assert.deepEqual(protectedResource.scopes_supported,["commandcenter:read"]);
  const issuer=await(await fetch(`${base}/.well-known/oauth-authorization-server/mcp/commandcenter`)).json();
  assert.equal(issuer.issuer,`${origin}/mcp/commandcenter`);assert.deepEqual(issuer.code_challenge_methods_supported,["S256"]);
  const unauth=await fetch(`${base}/mcp/commandcenter`);assert.equal(unauth.status,401);assert.match(unauth.headers.get("www-authenticate"),/commandcenter:read/);
  const register=body=>fetch(`${base}/mcp/commandcenter/register`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  assert.equal((await register({redirect_uris:["https://evil.example/callback"]})).status,400);
  const valid=await register({redirect_uris:["https://chatgpt.com/connector_platform_oauth_redirect"],scope:"commandcenter:read"});
  assert.equal(valid.status,201);const client=await valid.json();assert.equal(client.scope,"commandcenter:read");assert.equal("client_secret" in client,false);
  assert.equal((await register({redirect_uris:["https://chatgpt.com/connector_platform_oauth_redirect"],scope:"social:read"})).status,400);
  const badConsent=await fetch(`${base}/mcp/commandcenter/authorize?client_id=unknown`);
  assert.match(await badConsent.text(),/Verbindingsverzoek geweigerd/);
  console.log("PASS production HTTP: resource/issuer discovery, 401 protection, separate read scope, callback allowlist, DCR and denied consent. No database or live changes.");
}finally{child.kill();}
