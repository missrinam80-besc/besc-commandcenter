import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {agentKeys,configuredAgent,existingAgentIds,workflowInput,selectedContext,AgentDispatchError} from '../src/lib/agent-workflows.ts';
import {triggerTechnicalAgent,readAgentRun} from '../src/lib/commandcenter-agent-trigger.ts';
import {buildAgentDocument,sourceTimestamp} from '../src/lib/agent-document.ts';

const migration='20261104095559_step11_agent_workflows.sql';
const read=(f:string)=>readFileSync(new URL('../supabase/migrations/'+f,import.meta.url),'utf8');
const org=randomUUID(),user=randomUUID(),other=randomUUID(),grant=randomUUID(),source=randomUUID();
const version='2026-11-04T10:00:00.000Z';
const payload={kind:'proposal',summary:'TESTFIXTURE — NIET PUBLICEREN',sourceVersion:version,findings:[{classification:'proposal',statement:'Controleer de gegevens.'}]};

test('selected context excludes unselected and protected fields, with explicit confirmation',()=>{
  const record={title:'fixture',description:'Selected description',location:'Fixture hall',start_at:version,governance:'SECRET',amount:123,people:['PRIVATE']};
  assert.deepEqual(selectedContext(record,[]),{});
  assert.deepEqual(selectedContext(record,['description']),{description:record.description});
  const ctx=JSON.stringify(selectedContext(record,['description','schedule'],'Chosen excerpt','Document v1'));
  assert.ok(ctx.includes('Chosen excerpt'));assert.ok(!ctx.includes('SECRET')&&!ctx.includes('PRIVATE')&&!ctx.includes('123'));
  assert.equal(workflowInput.safeParse({agent_key:'technical',context_sections:['description'],context_confirmed:false}).success,false);
  assert.equal(workflowInput.safeParse({agent_key:'technical',context_sections:[],context_excerpt:'Selected',context_confirmed:true}).success,false);
  assert.equal(workflowInput.safeParse({agent_key:'technical',context_sections:[],context_confirmed:false}).success,true);
});

test('all nine existing agents reuse IDs; unset channels and replacements remain unavailable',()=>{
  assert.equal(agentKeys.length,9);
  for(const key of agentKeys){
    assert.equal(configuredAgent(key,{}),null);
    const env={BESC_WORKSPACE_AGENT_ACCESS_TOKEN:'fixture',[`BESC_${key.toUpperCase()}_AGENT_CHANNEL_ID`]:'agtch_fixture'};
    assert.equal(configuredAgent(key,env)?.agentId,existingAgentIds[key]);
    assert.equal(configuredAgent(key,{...env,[`BESC_${key.toUpperCase()}_AGENT_ID`]:'agt_replacement'}),null);
  }
});

test('sanitized dispatch errors distinguish refusal, unknown receipt, timeout and rate limit',async()=>{
  const channel={channelId:'agtch_fixture',token:'SECRET_MUST_NEVER_BE_IN_ERROR'},job=randomUUID();
  for(const [status,code] of [[401,'credential'],[403,'permission'],[404,'channel'],[409,'not_runnable'],[429,'rate_limited'],[503,'provider_unavailable']] as const){
    await assert.rejects(()=>triggerTechnicalAgent(channel,job,async()=>Response.json({error:{message:channel.token}},{status})),e=>e instanceof AgentDispatchError&&e.code===code&&!e.message.includes(channel.token));
  }
  await assert.rejects(()=>triggerTechnicalAgent(channel,job,async()=>{throw new DOMException('SECRET','TimeoutError');}),e=>e instanceof AgentDispatchError&&e.code==='timeout');
  await assert.rejects(()=>triggerTechnicalAgent(channel,job,async()=>Response.json({conversation_url:'https://evil.example'},{status:202})),e=>e instanceof AgentDispatchError&&e.code==='receipt');
});

test('stable old trigger is retained and new prompt preserves a recoverable proposal',async()=>{
  const channel={channelId:'agtch_fixture',token:'fixture'},job=randomUUID();const bodies:string[]=[];
  const fetcher:typeof fetch=async(_u,init)=>{assert.equal((init?.headers as Record<string,string>)['Idempotency-Key'],job);bodies.push(String(init?.body));return Response.json({conversation_url:'https://chatgpt.com/c/fixture'},{status:202});};
  await triggerTechnicalAgent(channel,job,fetcher,1);await triggerTechnicalAgent(channel,job.toUpperCase(),fetcher,1);
  assert.equal(bodies[0],bodies[1]);assert.ok(!bodies[0].includes('volledige payload'));
  await triggerTechnicalAgent(channel,job,fetcher,2);assert.ok(bodies[2].includes('volledige payload-object'));
});

test('status check is read-only and validates run and channel before storing state',async()=>{
  const config={channelId:'agtch_fixture',token:'fixture'};
  for(const status of ['queued','in_progress','suspended','completed','failed']){
    const result=await readAgentRun(config,'apirun_fixture',async(url,init)=>{
      assert.ok(String(url).endsWith('/runs/apirun_fixture'));assert.equal(init?.method,'GET');assert.equal(init?.body,undefined);
      return Response.json({id:'apirun_fixture',api_trigger_id:config.channelId,status});
    });assert.equal(result,status);
  }
  await assert.rejects(()=>readAgentRun(config,'apirun_fixture',async()=>Response.json({id:'apirun_other',api_trigger_id:config.channelId,status:'completed'})));
});

test('document export is deterministic, accepted-only, source-bound and XML-escaped',()=>{
  const job={id:randomUUID(),source_entity:'events',source_id:source,source_version:version,source_snapshot:{title:'TESTFIXTURE — NIET PUBLICEREN'},review:'accepted'};
  const a=buildAgentDocument(job,{...payload,summary:'<script> & fixture'}),b=buildAgentDocument(job,{...payload,summary:'<script> & fixture'});
  assert.equal(a.sha256,b.sha256);assert.equal(a.bytes.readUInt32LE(),0x04034b50);
  assert.ok(a.bytes.includes(Buffer.from('&lt;script&gt; &amp; fixture')));assert.ok(!a.bytes.includes(Buffer.from('<script>')));
  assert.throws(()=>buildAgentDocument({...job,review:'pending'},payload));
  assert.throws(()=>buildAgentDocument({...job,source_version:'2026-11-03T10:00:00Z'},payload));
  assert.notEqual(sourceTimestamp('2026-11-04T10:00:00.000001Z'),sourceTimestamp('2026-11-04T10:00:00.000002Z'));
  assert.equal(sourceTimestamp('2026-11-04T10:00:00.700855+00:00'),sourceTimestamp('2026-11-04T11:00:00.700855+01:00'));
});

test('durable workflow gates, duplicate prevention, context isolation, cancellation and handoff',async t=>{
  const db=new PGlite();
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create schema auth;create schema private;create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table public.organizations(id uuid primary key);
      create table public.organization_members(user_id uuid,organization_id uuid,status text,role text);
      create table public.projects(id uuid primary key,organization_id uuid,title text,status text,description text,start_date date,due_date date,secret text,updated_at timestamptz,deleted_at timestamptz);
      create table public.events(id uuid primary key,organization_id uuid,title text,status text,description text,start_at timestamptz,end_at timestamptz,location text,is_online boolean,secret text,updated_at timestamptz,deleted_at timestamptz);
      create table public.audit_log(organization_id uuid,entity_type text,entity_id uuid,action text,actor_id uuid,entity_label text,metadata jsonb);
      create function private.f1_lock() returns void language sql as $$select pg_advisory_xact_lock(1)$$;
      create function private.f1_chair(o uuid) returns boolean language sql as $$select auth.uid()='${user}'::uuid and o='${org}'::uuid$$;
      grant usage on schema public,auth to service_role,authenticated;
      grant select,update on public.organization_members,public.projects,public.events to service_role;`);
    await db.exec(read('20261004202223_commandcenter_read_mcp.sql'));
    await db.exec(read('20261006051457_commandcenter_agent_jobs.sql'));
    await db.exec(read(migration));
    await db.query('insert into auth.users values($1),($2)',[user,other]);await db.query('insert into organizations values($1)',[org]);
    await db.query("insert into organization_members values($1,$2,'active','admin'),($3,$2,'active','admin')",[user,org,other]);
    await db.query("insert into commandcenter_mcp_oauth_grants(id,user_id,organization_id,client_id,resource,scope,redirect_uri,code_challenge,expires_at) values($1,$2,$3,'fixture','https://fixture/mcp','commandcenter:read agent_results:write','fixture','fixture',now()+interval '1 day')",[grant,user,org]);
    await db.query("insert into events values($1,$2,'TESTFIXTURE','aftercare','Selected description',$3,$3,'Fixture hall',false,'PRIVATE MUST STAY OUT',$3,null)",[source,org,version]);
    const create=async(sections:string[]=[],key=randomUUID(),excerpt='',reference='',confirmed=true)=>(await db.query<{j:Record<string,unknown>}>("select create_agent_workflow_job($1,$2,$3,$4,'technical',$5,'Controleer dit dossier','events',$6,$7,$8,$9,$10,$11) j",[user,org,grant,existingAgentIds.technical,key,source,version,JSON.stringify(sections),excerpt,reference,confirmed])).rows[0].j;
    const login=async(actor=user)=>{await db.exec('reset role;set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);};
    const service=()=>db.exec('reset role;set role service_role');
    const pause=async(value:boolean)=>{await login();await db.query('select set_agent_workflow_pause($1,$2)',[org,value]);await service();};
    let job:Record<string,unknown>;let lease=randomUUID();
    const claim=async()=>(await db.query<{j:Record<string,unknown>}>('select claim_commandcenter_agent_dispatch($1,$2,$3,$4,$5) j',[user,org,job.id,'agtch_fixture',lease])).rows[0].j;
    await service();
    await t.test('new request captures only selected context and deduplicates different form keys',async()=>{
      job=await create(['description']);assert.ok(!JSON.stringify(job).includes('PRIVATE MUST STAY OUT'));assert.equal(job.input_version,2);
      const duplicate=await create(['description']);assert.equal(duplicate.id,job.id);assert.equal(duplicate.reused,true);
      const otherContext=await create(['schedule']);assert.notEqual(otherContext.id,job.id);
      await assert.rejects(()=>create(['description'],randomUUID(),'','',false),/agent_context_invalid/);
      await assert.rejects(()=>create(['secret']),/agent_context_invalid/);
    });
    await t.test('paused by default, then budget and chair-only approval are enforced',async()=>{
      await assert.rejects(claim,/agent_paused/);await pause(false);await assert.rejects(claim,/agent_budget_required/);
      await login(other);await assert.rejects(()=>db.query('select approve_agent_workflow_budget($1,$2,$3,2)',[org,job.id,'fixture external limit checked']),/agent_access_denied/);
      await login();await db.query('select approve_agent_workflow_budget($1,$2,$3,2)',[org,job.id,'TESTFIXTURE external limit checked']);await service();
      const claimed=await claim();assert.equal(claimed.dispatch_attempts,1);assert.equal(claimed.budget_credits,5);
    });
    await t.test('busy lease, sanitized failure, stable retry and maximum attempts',async()=>{
      await assert.rejects(claim,/agent_dispatch_busy/);
      await db.query('select finish_agent_workflow_dispatch($1,$2,$3,$4,null,null,$5)',[user,org,job.id,lease,'credential']);
      lease=randomUUID();assert.equal((await claim()).dispatch_attempts,2);
      await db.query('select finish_agent_workflow_dispatch($1,$2,$3,$4,null,null,$5)',[user,org,job.id,lease,'timeout']);
      await assert.rejects(claim,/agent_attempt_limit/);
    });
    await t.test('one result, current source and operator handoff with idempotency',async()=>{
      await db.query('select submit_commandcenter_agent_result($1,$2,$3,$4,$4,$5)',[user,org,grant,job.id,payload]);
      await login(other);await assert.rejects(()=>db.query("select review_agent_workflow_result($1,$2,'accepted')",[org,job.id]),/agent_access_denied/);
      await login();await db.query("select review_agent_workflow_result($1,$2,'accepted')",[org,job.id]);await service();
      const params=[user,org,job.id,'a'.repeat(64),'google_document','https://docs.google.com/document/d/fixture/edit',null];
      const first=await db.query<{id:string}>('select record_agent_document_handoff($1,$2,$3,$4,$5,$6,$7) id',params);
      const second=await db.query<{id:string}>('select record_agent_document_handoff($1,$2,$3,$4,$5,$6,$7) id',params);
      assert.equal(first.rows[0].id,second.rows[0].id);
      await assert.rejects(()=>db.query('select record_agent_document_handoff($1,$2,$3,$4,$5,$6,$7)',[...params.slice(0,5),'https://evil.example/',null]),/agent_handoff_invalid/);
    });
    await t.test('cost above five pauses future dispatch; unknown costs are not treated as zero',async()=>{
      const before=await db.query<{actual_credits:number|null}>('select actual_credits from agent_jobs where id=$1',[job.id]);assert.equal(before.rows[0].actual_credits,null);
      await login();await db.query('select record_agent_workflow_cost($1,$2,6)',[org,job.id]);await service();
      const paused=await db.query<{paused:boolean}>('select paused from agent_execution_controls where organization_id=$1',[org]);assert.equal(paused.rows[0].paused,true);
    });
    await t.test('cancelled jobs reject dispatch and result and expire legacy readers',async()=>{
      job=await create([],randomUUID(),'A different selected excerpt','fixture source');
      await db.query('select cancel_agent_workflow_job($1,$2,$3)',[user,org,job.id]);
      await pause(false);await assert.rejects(claim,/agent_cancelled/);
      await assert.rejects(()=>db.query('select submit_commandcenter_agent_result($1,$2,$3,$4,$4,$5)',[user,org,grant,job.id,payload]),/agent_cancelled/);
      const row=(await db.query<{closed:boolean}>('select expires_at<=now() closed from agent_jobs where id=$1',[job.id])).rows[0];assert.equal(row.closed,true);
    });
    await t.test('private tables and server operations stay inaccessible to browser roles',async()=>{
      for(const role of ['anon','authenticated']){
        await db.exec('reset role;set role '+role);
        for(const table of ['agent_jobs','agent_results','agent_audit','agent_execution_controls','agent_document_handoffs']){
          await assert.rejects(()=>db.query('select * from public.'+table),/permission denied/);
          await assert.rejects(()=>db.query('delete from public.'+table),/permission denied/);
        }
        await assert.rejects(()=>db.query('select cancel_agent_workflow_job($1,$2,$3)',[user,org,job.id]),/permission denied/);
      }
    });
  }finally{await db.close();}
});
