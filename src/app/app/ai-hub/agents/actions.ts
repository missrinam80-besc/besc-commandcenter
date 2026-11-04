"use server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireActiveMembership } from "@/lib/auth-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAgentAccess } from "@/lib/commandcenter-agent-store";
import { TECHNICAL_AGENT_ID } from "@/lib/commandcenter-agent-contract";
import { canReadMcpCommandCenter } from "@/lib/commandcenter-mcp-store";
import { technicalChannelConfig,triggerTechnicalAgent,readAgentRun } from "@/lib/commandcenter-agent-trigger";
import {configuredAgent, agentKeySchema, workflowInput, AgentDispatchError, dispatchFeedback, sqlWorkflowFeedback} from '@/lib/agent-workflows';
import { createAgentJobForm } from "@/lib/commandcenter-agent-job-form";

export async function createAgentJob(form:FormData) {
  const parsed=createAgentJobForm.safeParse(Object.fromEntries(form));
  if(!parsed.success)redirect("/app/ai-hub/agents?fout=velden");
  const {user,membership}=await requireActiveMembership();
  let failed=false;
  let createdId:string|undefined;
  let reused=false;
  try {
    await assertAgentAccess({userId:user.id,organizationId:membership.organization_id,grantId:parsed.data.grant_id});
    const expanded=process.env.BESC_AGENT_WORKFLOWS_ENABLED==='true';
    const extras=expanded?workflowInput.parse({agent_key:form.get('agent_key'),context_sections:form.getAll('context_sections'),context_excerpt:form.get('context_excerpt')??'',context_reference:form.get('context_reference')??'',context_confirmed:form.get('context_confirmed')==='on'}):null;
    const chosen=extras?configuredAgent(extras.agent_key,process.env):null;
    if(expanded&&!chosen)throw Error('agent_channel_invalid');
    const {data,error}=await createAdminClient().rpc(expanded?'create_agent_workflow_job':"create_commandcenter_agent_job",{
      p_actor:user.id,p_org:membership.organization_id,p_grant:parsed.data.grant_id,p_agent:chosen?.agentId??TECHNICAL_AGENT_ID,
      p_key:parsed.data.idempotency_key,p_request:parsed.data.request,p_entity:parsed.data.source_entity,
      p_source:parsed.data.source_id,p_version:parsed.data.source_version,
      ...(extras?{p_agent_key:extras.agent_key,p_sections:extras.context_sections,p_excerpt:extras.context_excerpt,p_reference:extras.context_reference,p_confirmed:extras.context_confirmed}:{}),
    });
    failed=Boolean(error);
    createdId=data?.id;reused=data?.reused===true;
  }catch{failed=true;}
  if(failed)redirect("/app/ai-hub/agents?fout=opslaan");
  revalidatePath("/app/ai-hub/agents");redirect("/app/ai-hub/agents?succes="+(reused?'hergebruikt':'opdracht')+(createdId?'&job='+createdId:''));
}
export async function reviewAgentResult(form:FormData) {
  const input=z.object({job_id:z.string().uuid(),review:z.enum(["accepted","rejected"])}).safeParse(Object.fromEntries(form));
  if(!input.success)redirect("/app/ai-hub/agents?fout=velden");
  const {supabase,user,membership}=await requireActiveMembership();
  if(process.env.BESC_AGENT_WORKFLOWS_ENABLED==='true'){
    const {data:caps,error}=await supabase.rpc('f1_capabilities',{p_organization_id:membership.organization_id});
    if(error||!caps?.chair)redirect('/app/ai-hub/agents?fout=rechten');
  }
  if(process.env.COMMANDCENTER_AGENT_RESULTS_ENABLED!=="true" || !await canReadMcpCommandCenter(user.id,membership.organization_id))redirect("/app/ai-hub/agents?fout=rechten");
  const expanded=process.env.BESC_AGENT_WORKFLOWS_ENABLED==='true';
  const {error}=expanded?await supabase.rpc('review_agent_workflow_result',{p_org:membership.organization_id,p_job:input.data.job_id,p_review:input.data.review}):await createAdminClient().rpc("review_commandcenter_agent_result",{p_actor:user.id,p_org:membership.organization_id,p_job:input.data.job_id,p_review:input.data.review});
  if(error)redirect("/app/ai-hub/agents?fout=review");
  revalidatePath("/app/ai-hub/agents");redirect("/app/ai-hub/agents?succes=review&job="+input.data.job_id);
}
export async function dispatchAgentJob(form:FormData) {
  const id=z.string().uuid().safeParse(form.get("job_id"));
  let channel=technicalChannelConfig(process.env);
  if(!id.success)redirect("/app/ai-hub/agents?fout=kanaal");
  const {user,membership}=await requireActiveMembership();
  if(process.env.COMMANDCENTER_AGENT_RESULTS_ENABLED!=="true" || process.env.COMMANDCENTER_MCP_DATA_STATE!=="ready"
    || !await canReadMcpCommandCenter(user.id,membership.organization_id))redirect("/app/ai-hub/agents?fout=rechten");
  const admin=createAdminClient(),lease=randomUUID();
  const expanded=process.env.BESC_AGENT_WORKFLOWS_ENABLED==='true';
  if(expanded){
    const {data:job,error}=await admin.from('agent_jobs').select('agent_key,agent_id').eq('id',id.data).eq('organization_id',membership.organization_id).eq('created_by',user.id).maybeSingle();
    const key=agentKeySchema.safeParse(job?.agent_key);
    const selected=key.success?configuredAgent(key.data,process.env):null;
    if(error||!job||!selected||selected.agentId!==job.agent_id)redirect('/app/ai-hub/agents?fout=kanaal');
    channel=selected;
  }
  if(!channel)redirect("/app/ai-hub/agents?fout=kanaal");
  const args={p_actor:user.id,p_org:membership.organization_id,p_job:id.data};
  const claimed=await admin.rpc("claim_commandcenter_agent_dispatch",{...args,p_channel:channel.channelId,p_lease:lease});
  if(claimed.error || !claimed.data)redirect('/app/ai-hub/agents?melding='+encodeURIComponent(sqlWorkflowFeedback(claimed.error))+'&job='+id.data);
  if(claimed.data.dispatch_state==="accepted")redirect("/app/ai-hub/agents?succes=verzonden");
  let receipt:{conversationUrl:string;providerRunId:string|null}|null=null;
  let failure:AgentDispatchError|null=null;
  try{receipt=await triggerTechnicalAgent(channel,id.data,fetch,claimed.data.input_version??1);}catch(error){failure=error instanceof AgentDispatchError?error:new AgentDispatchError('unknown');}
  const finished=await admin.rpc(expanded?"finish_agent_workflow_dispatch":"finish_commandcenter_agent_dispatch",{...args,p_lease:lease,p_url:receipt?.conversationUrl??null,p_run:receipt?.providerRunId??null,...(expanded?{p_error:failure?.code??null}:{})});
  revalidatePath("/app/ai-hub/agents");
  if(finished.error || !receipt)redirect('/app/ai-hub/agents?job='+id.data+'&melding='+encodeURIComponent(finished.error?'De ontvangststatus kon niet worden opgeslagen. Controleer het agentgesprek voordat je herhaalt.':dispatchFeedback[failure?.code??'unknown']));
  redirect("/app/ai-hub/agents?succes=verzonden&job="+id.data);
}

export async function manageAgentWorkflow(form:FormData){
  if(process.env.BESC_AGENT_WORKFLOWS_ENABLED!=='true')redirect('/app/ai-hub/agents?fout=uit');
  const {supabase,user,membership}=await requireActiveMembership();
  const org=membership.organization_id,op=String(form.get('operation')??'');
  const id=z.string().uuid().safeParse(form.get('job_id'));
  let error:{message?:string}|null=null;
  if(op==='pause'||op==='resume'){
    if(op==='resume'&&form.get('confirmed')!=='on')redirect('/app/ai-hub/agents?fout=velden');
    ({error}=await supabase.rpc('set_agent_workflow_pause',{p_org:org,p_paused:op==='pause'}));
  }else if(!id.success){redirect('/app/ai-hub/agents?fout=velden');}
  else if(op==='budget'){
    const reference=z.string().trim().min(5).max(300).safeParse(form.get('provider_limit_reference'));
    const attempts=z.coerce.number().int().min(1).max(3).safeParse(form.get('max_attempts'));
    if(!reference.success||!attempts.success||form.get('confirmed')!=='on')redirect('/app/ai-hub/agents?fout=velden');
    ({error}=await supabase.rpc('approve_agent_workflow_budget',{p_org:org,p_job:id.data,p_reference:reference.data,p_attempts:attempts.data}));
  }else if(op==='cost'){
    const credits=z.coerce.number().finite().min(0).max(99999999).multipleOf(0.01).safeParse(form.get('actual_credits'));
    if(typeof form.get('actual_credits')!=='string'||!/^\d+(?:\.\d{1,2})?$/.test(String(form.get('actual_credits')))||!credits.success)redirect('/app/ai-hub/agents?fout=velden');
    ({error}=await supabase.rpc('record_agent_workflow_cost',{p_org:org,p_job:id.data,p_credits:credits.data}));
  }else if(op==='cancel'){
    if(!await canReadMcpCommandCenter(user.id,org))redirect('/app/ai-hub/agents?fout=rechten');
    ({error}=await createAdminClient().rpc('cancel_agent_workflow_job',{p_actor:user.id,p_org:org,p_job:id.data}));
  }else if(op==='status'){
    const admin=createAdminClient();
    const {data:job,error:readError}=await admin.from('agent_jobs').select('grant_id,agent_key,agent_id,channel_id,provider_run_id').eq('id',id.data).eq('organization_id',org).eq('created_by',user.id).maybeSingle();
    if(readError||!job||!job.provider_run_id)redirect('/app/ai-hub/agents?fout=opdracht');
    let permitted=false;try{await assertAgentAccess({userId:user.id,organizationId:org,grantId:job.grant_id});permitted=true;}catch{}
    if(!permitted)redirect('/app/ai-hub/agents?fout=rechten');
    const key=agentKeySchema.safeParse(job.agent_key),channel=key.success?configuredAgent(key.data,process.env):null;
    if(!channel||channel.agentId!==job.agent_id||channel.channelId!==job.channel_id)redirect('/app/ai-hub/agents?fout=kanaal');
    let status;let failed:AgentDispatchError|null=null;
    try{status=await readAgentRun(channel,job.provider_run_id);}catch(e){failed=e instanceof AgentDispatchError?e:new AgentDispatchError('unknown');}
    if(failed)redirect('/app/ai-hub/agents?melding='+encodeURIComponent(dispatchFeedback[failed.code])+'&job='+id.data);
    ({error}=await admin.rpc('record_agent_workflow_run',{p_actor:user.id,p_org:org,p_job:id.data,p_run:job.provider_run_id,p_status:status}));
  }else redirect('/app/ai-hub/agents?fout=velden');
  revalidatePath('/app/ai-hub/agents');
  redirect('/app/ai-hub/agents?'+(error?'melding='+encodeURIComponent(sqlWorkflowFeedback(error)):'succes=beheer')+(id.success?'&job='+id.data:''));
}
