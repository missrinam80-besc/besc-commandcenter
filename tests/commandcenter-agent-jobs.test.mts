import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { TECHNICAL_AGENT_ID, agentResultInput } from "../src/lib/commandcenter-agent-contract.ts";
import { parseAuthorization, oauthMetadata, issueMcpCode, AGENT_COMBINED_SCOPE, type OAuthStore } from "../src/lib/commandcenter-mcp-oauth.ts";
import { handleCommandCenterMcp, type Dependencies } from "../src/lib/commandcenter-mcp-server.ts";
import { technicalChannelConfig,triggerTechnicalAgent } from "../src/lib/commandcenter-agent-trigger.ts";

const org=randomUUID(),user=randomUUID(),other=randomUUID(),otherOrg=randomUUID(),grant=randomUUID(),readGrant=randomUUID(),source=randomUUID();
const version="2026-10-05T12:00:00.000Z";
const config={origin:"https://besc.example",resource:"https://besc.example/mcp/commandcenter",organizationId:org,
  signingKey:"fixture-only".repeat(4),redirects:["https://chatgpt.com/connector_platform_oauth_redirect"],agentResultsEnabled:true};
const payload={kind:"evaluation",summary:"TESTFIXTURE — NIET PUBLICEREN",sourceVersion:version,
  findings:[{statement:"Dossierinhoud is niet beschikbaar.",classification:"uncertain"}]};

test("explicit write consent is feature-gated and existing read grants retain their scope",async()=>{
  const params=new URLSearchParams({response_type:"code",client_id:"besc-commandcenter-chatgpt",redirect_uri:config.redirects[0],resource:config.resource,
    scope:AGENT_COMBINED_SCOPE,state:"fixture",code_challenge:"a".repeat(43),code_challenge_method:"S256"});
  assert.throws(()=>parseAuthorization(params,{...config,agentResultsEnabled:false}));
  assert.equal(parseAuthorization(params,config).scope,AGENT_COMBINED_SCOPE);
  params.set("scope","agent_results:write commandcenter:read");assert.equal(parseAuthorization(params,config).scope,AGENT_COMBINED_SCOPE);params.set("scope",AGENT_COMBINED_SCOPE);
  assert.deepEqual(oauthMetadata(config).scopes_supported,["commandcenter:read","agent_results:write"]);
  let scope="";
  const store={createCode:async (input:Parameters<OAuthStore["createCode"]>[0])=>{scope=input.grant.scope;}} as OAuthStore;
  await issueMcpCode(parseAuthorization(params,config),user,config,store);assert.equal(scope,AGENT_COMBINED_SCOPE);
  params.set("scope","commandcenter:read");await issueMcpCode(parseAuthorization(params,config),user,config,store);assert.equal(scope,"commandcenter:read");
  for(const value of ["agent_results:write","commandcenter:read agent_results:write delete:all","commandcenter:read commandcenter:read"]){params.set("scope",value);assert.throws(()=>parseAuthorization(params,config));}
});

test("durable PostgreSQL job, result, audit and access boundaries",async t=>{
  const db=new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create table public.organizations(id uuid primary key);
      create table public.organization_members(user_id uuid,organization_id uuid,status text,role text);
      create table public.projects(id uuid primary key,organization_id uuid,title text,status text,notes text,updated_at timestamptz,deleted_at timestamptz);
      create table public.events(like public.projects including all);
      grant usage on schema public,auth to service_role;
      grant select,update on public.organization_members,public.projects,public.events to service_role;`);
    await db.exec(readFileSync(new URL("../supabase/migrations/20261004202223_commandcenter_read_mcp.sql",import.meta.url),"utf8"));
    await db.exec(readFileSync(new URL("../supabase/migrations/20261006051457_commandcenter_agent_jobs.sql",import.meta.url),"utf8"));
    await db.query("insert into auth.users values($1),($2)",[user,other]);
    await db.query("insert into public.organizations values($1),($2)",[org,otherOrg]);
    await db.query("insert into public.organization_members values($1,$2,'active','admin'),($3,$2,'active','board')",[user,org,other]);
    for(const [id,scope] of [[grant,AGENT_COMBINED_SCOPE],[readGrant,"commandcenter:read"]])await db.query("insert into public.commandcenter_mcp_oauth_grants(id,user_id,organization_id,client_id,resource,scope,redirect_uri,code_challenge,expires_at) values($1,$2,$3,'fixture',$4,$5,'fixture','fixture',now()+interval '1 day')",[id,user,org,config.resource,scope]);
    await db.query("insert into public.projects values($1,$2,'TESTFIXTURE','idea','PRIVATE MUST NOT LEAVE DATABASE',$3,null)",[source,org,version]);
    const key=randomUUID();
    const create=async(overrides:Record<string,unknown>={})=>{
      const p={actor:user,org,grant,agent:TECHNICAL_AGENT_ID,key,request:"Evalueer de metadata van deze TESTFIXTURE",entity:"projects",source,version,...overrides};
      return (await db.query<{job:Record<string,unknown>}>("select public.create_commandcenter_agent_job($1,$2,$3,$4,$5,$6,$7,$8,$9) as job",Object.values(p))).rows[0].job;
    };
    const submit=async(jobId:string,result=payload,k=randomUUID(),actor=user,organization=org,g=grant)=>
      (await db.query<{result:Record<string,unknown>}>("select public.submit_commandcenter_agent_result($1,$2,$3,$4,$5,$6) as result",[actor,organization,g,jobId,k,result])).rows[0].result;
    let job:Record<string,unknown>;
    await t.test("service role can create and read a durable, projected job",async()=>{
      await db.exec("set role service_role");try{job=await create();}finally{await db.exec("reset role");}
      assert.equal(job.agent_id,TECHNICAL_AGENT_ID);assert.equal(JSON.stringify(job).includes("PRIVATE"),false);
      assert.equal((job.source_snapshot as {coverage:string}).coverage,"header_metadata_only");
      assert.equal((await db.query("select * from public.agent_jobs")).rows.length,1);
    });
    await t.test("duplicate preparation returns the same job and rejects changed request",async()=>{
      assert.equal((await create()).id,job.id);
      await assert.rejects(()=>create({request:"Een gewijzigde opdracht"}),/agent_idempotency_conflict/);
      assert.equal((await db.query("select * from public.agent_audit")).rows.length,1);
    });
    await t.test("tenant, user, read-only scope, unknown agent and source table are rejected",async()=>{
      for(const change of [{org:otherOrg},{actor:other},{grant:readGrant},{agent:"agt_replacement",key:randomUUID()},{entity:"auth.users",key:randomUUID()}])await assert.rejects(()=>create(change));
      for(const [a,o,g] of [[other,org,grant],[user,otherOrg,grant],[user,org,readGrant]])await assert.rejects(()=>submit(job.id as string,payload,randomUUID(),a,o,g));
    });
    await t.test("strict result fields and types are checked in SQL and tool schema",async()=>{
      for(const result of [{...payload,status:"approved"},{...payload,kind:"publish"},{...payload,summary:null},{...payload,findings:[{statement:"x",classification:"confirmed",owner_id:user}]},{...payload,findings:[{statement:1,classification:"confirmed"}]}]){
        assert.equal(agentResultInput.safeParse({jobId:job.id,idempotencyKey:randomUUID(),payload:result}).success,false);
        await assert.rejects(()=>submit(job.id as string,result as typeof payload));
      }
      assert.equal((await db.query("select * from public.agent_results")).rows.length,0);
    });
    await t.test("changed and deleted sources reject submission atomically",async()=>{
      await db.query("update public.projects set updated_at=$1 where id=$2",["2026-10-06T12:00:00Z",source]);
      await assert.rejects(()=>submit(job.id as string),/agent_source_conflict/);
      await db.query("update public.projects set updated_at=$1,deleted_at=now() where id=$2",[version,source]);
      await assert.rejects(()=>submit(job.id as string),/agent_source_conflict/);
      await db.query("update public.projects set deleted_at=null where id=$1",[source]);
      assert.equal((await db.query("select * from public.agent_results")).rows.length,0);
    });
    await t.test("membership loss and revoked grants reject writes",async()=>{
      await db.query("update public.organization_members set status='inactive' where user_id=$1",[user]);
      await assert.rejects(()=>submit(job.id as string),/agent_access_denied/);
      await db.query("update public.organization_members set status='active' where user_id=$1",[user]);
      await db.query("update public.commandcenter_mcp_oauth_grants set revoked_at=now() where id=$1",[grant]);
      await assert.rejects(()=>submit(job.id as string),/agent_grant_denied/);
      await db.query("update public.commandcenter_mcp_oauth_grants set revoked_at=null where id=$1",[grant]);
    });
    await t.test("expired job rejects first result",async()=>{
      await db.query("update public.agent_jobs set expires_at=now()-interval '1 second' where id=$1",[job.id]);
      await assert.rejects(()=>submit(job.id as string),/agent_job_expired/);
      await db.query("update public.agent_jobs set expires_at=now()+interval '1 hour' where id=$1",[job.id]);
    });
    await t.test("one durable result, retry and audit; no canonical mutation",async()=>{
      const k=randomUUID();const result=await submit(job.id as string,payload,k);
      assert.equal((await submit(job.id as string,payload,k)).id,result.id);
      await assert.rejects(()=>submit(job.id as string,{...payload,summary:"changed"},k),/agent_idempotency_conflict/);
      await assert.rejects(()=>submit(job.id as string,payload,randomUUID()),/agent_idempotency_conflict/);
      assert.equal((await db.query("select * from public.agent_results")).rows.length,1);
      assert.equal((await db.query("select * from public.agent_audit")).rows.length,2);
      assert.equal((await db.query<{status:string}>("select status from public.projects")).rows[0].status,"idea");
    });
    await t.test("review is idempotent and source-version protected without dossier changes",async()=>{
      await db.query("update public.projects set updated_at=now() where id=$1",[source]);
      await assert.rejects(()=>db.query("select public.review_commandcenter_agent_result($1,$2,$3,'accepted')",[user,org,job.id]),/agent_source_conflict/);
      await db.query("update public.projects set updated_at=$1 where id=$2",[version,source]);
      for(let i=0;i<2;i++)await db.query("select public.review_commandcenter_agent_result($1,$2,$3,'accepted')",[other,org,job.id]);
      assert.equal((await db.query("select * from public.agent_audit")).rows.length,3);
      assert.equal((await db.query<{status:string}>("select status from public.projects")).rows[0].status,"idea");
    });
    await t.test("dispatch lease, stable channel, receipt and unknown retry are durable",async()=>{
      const fresh=await create({key:randomUUID()});const lease=randomUUID();
      const claim=async(channel="agtch_fixture",l=lease)=>
        (await db.query<{job:Record<string,unknown>}>("select public.claim_commandcenter_agent_dispatch($1,$2,$3,$4,$5) as job",[user,org,fresh.id,channel,l])).rows[0].job;
      assert.equal((await claim()).dispatch_state,"dispatching");
      await assert.rejects(()=>claim(),/agent_dispatch_busy/);
      await assert.rejects(()=>claim("agtch_other"),/agent_channel_conflict/);
      const finish=(l:string,url:string|null,run:string|null=null)=>db.query("select public.finish_commandcenter_agent_dispatch($1,$2,$3,$4,$5,$6)",[user,org,fresh.id,l,url,run]);
      await assert.rejects(()=>finish(randomUUID(),null),/agent_lease_denied/);
      await assert.rejects(()=>finish(lease,"https://evil.example/"),/agent_receipt_invalid/);
      await finish(lease,null);const next=randomUUID();assert.equal((await claim("agtch_fixture",next)).dispatch_lease,next);
      await finish(next,"https://chatgpt.com/c/fixture","apirun_fixture");
      assert.equal((await claim()).dispatch_state,"accepted");
      assert.equal((await db.query("select * from public.agent_results where job_id=$1",[fresh.id])).rows.length,0);
    });
    await t.test("anon and authenticated cannot read, insert, update, delete or invoke server mutations",async()=>{
      const rls=await db.query<{enabled:boolean}>("select relrowsecurity as enabled from pg_class where relname in ('agent_jobs','agent_results','agent_audit')");
      assert.equal(rls.rows.length,3);assert.ok(rls.rows.every(r=>r.enabled));
      for(const role of ["anon","authenticated"]){
        await db.exec(`set role ${role}`);
        for(const table of ["agent_jobs","agent_results","agent_audit"]){
          for(const query of [`select * from public.${table}`,`insert into public.${table} default values`,`update public.${table} set id=id`,`delete from public.${table}`])await assert.rejects(()=>db.query(query),/permission denied/);
        }
        await assert.rejects(()=>db.query("select public.agent_assert_manager($1,$2)",[user,org]),/permission denied/);
        await assert.rejects(()=>submit(job.id as string),/permission denied/);
        await db.exec("reset role");
      }
    });
  }finally{await db.close();}
});

test("existing-agent trigger uses official endpoint, stable keys, safe receipt and no answer-text assumptions",async()=>{
  assert.equal(technicalChannelConfig({}),null);
  assert.equal(technicalChannelConfig({BESC_TECHNICAL_AGENT_CHANNEL_ID:TECHNICAL_AGENT_ID,BESC_WORKSPACE_AGENT_ACCESS_TOKEN:"fixture"}),null);
  const job=randomUUID(),channel={channelId:"agtch_fixture",token:"fixture-not-a-real-token"};
  const fetcher:typeof fetch=async(url,init)=>{
    assert.equal(url,"https://api.chatgpt.com/v1/workspace_agents/agtch_fixture/trigger");assert.equal(init?.redirect,"error");
    assert.equal((init?.headers as Record<string,string>)["Idempotency-Key"],job);
    const input=JSON.parse(init?.body as string);assert.equal(input.conversation_key,`besc-cc-${job}`);
    assert.ok(input.input.includes("submit_commandcenter_agent_result"));assert.equal(input.input.includes(channel.token),false);
    return Response.json({conversation_url:"https://chatgpt.com/c/fixture",agent_trigger_run_id:"apirun_fixture"},{status:202});
  };
  const result=await triggerTechnicalAgent(channel,job,fetcher);assert.equal(result.providerRunId,"apirun_fixture");assert.equal("answer" in result,false);
  await assert.rejects(()=>triggerTechnicalAgent(channel,job,async()=>Response.json({error:"fixture"},{status:429})));
  await assert.rejects(()=>triggerTechnicalAgent(channel,job,async()=>Response.json({conversation_url:"https://chatgpt.com.evil.example/c/fixture"},{status:202})));
});

test("MCP old connections cannot discover or invoke write tools; explicit consent exposes bounded tools",async()=>{
  const token="a".repeat(43);
  const request=(method:string,params:unknown={})=>new Request(config.resource,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json",Accept:"application/json, text/event-stream"},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params})});
  let writes=0;
  const d:Dependencies={origin:config.origin,challenge:"Bearer",allowRequest:()=>true,authenticate:async()=>({userId:user}),
    reader:()=>({organizationId:org,userId:user,origin:config.origin,signingKey:config.signingKey,dataState:"ready",readPage:async()=>[]}),
    agentTools:()=>({readJob:async()=>({coverage:"header_metadata_only"}),submitResult:async()=>{writes++;return {dossierChanged:false};}})};
  const list=await(await handleCommandCenterMcp(request("tools/list"),d)).json();assert.equal(list.result.tools.length,3);
  const denied=await(await handleCommandCenterMcp(request("tools/call",{name:"submit_commandcenter_agent_result",arguments:{jobId:randomUUID(),idempotencyKey:randomUUID(),payload}}),d)).json();
  assert.ok(denied.error||denied.result?.isError);assert.equal(writes,0);
  const enabled={...d,authenticate:async()=>({userId:user,grantId:grant,agentResultsWrite:true})};
  const tools=(await(await handleCommandCenterMcp(request("tools/list"),enabled)).json()).result.tools;
  assert.equal(tools.length,5);assert.equal(tools.find((x:{name:string})=>x.name==="submit_commandcenter_agent_result").annotations.readOnlyHint,false);
  const ok=await(await handleCommandCenterMcp(request("tools/call",{name:"submit_commandcenter_agent_result",arguments:{jobId:randomUUID(),idempotencyKey:randomUUID(),payload}}),enabled)).json();
  assert.equal(ok.result.isError,false);assert.equal(writes,1);
  const invalid=await(await handleCommandCenterMcp(request("tools/call",{name:"submit_commandcenter_agent_result",arguments:{jobId:randomUUID(),idempotencyKey:randomUUID(),payload:{...payload,owner:user}}}),enabled)).json();
  assert.ok(invalid.error||invalid.result?.isError);assert.equal(writes,1);
});
