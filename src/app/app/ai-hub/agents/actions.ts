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
import { technicalChannelConfig,triggerTechnicalAgent } from "@/lib/commandcenter-agent-trigger";
import { createAgentJobForm } from "@/lib/commandcenter-agent-job-form";

export async function createAgentJob(form:FormData) {
  const parsed=createAgentJobForm.safeParse(Object.fromEntries(form));
  if(!parsed.success)redirect("/app/ai-hub/agents?fout=velden");
  const {user,membership}=await requireActiveMembership();
  let failed=false;
  try {
    await assertAgentAccess({userId:user.id,organizationId:membership.organization_id,grantId:parsed.data.grant_id});
    const {error}=await createAdminClient().rpc("create_commandcenter_agent_job",{
      p_actor:user.id,p_org:membership.organization_id,p_grant:parsed.data.grant_id,p_agent:TECHNICAL_AGENT_ID,
      p_key:parsed.data.idempotency_key,p_request:parsed.data.request,p_entity:parsed.data.source_entity,
      p_source:parsed.data.source_id,p_version:parsed.data.source_version,
    });
    failed=Boolean(error);
  }catch{failed=true;}
  if(failed)redirect("/app/ai-hub/agents?fout=opslaan");
  revalidatePath("/app/ai-hub/agents");redirect("/app/ai-hub/agents?succes=opdracht");
}
export async function reviewAgentResult(form:FormData) {
  const input=z.object({job_id:z.string().uuid(),review:z.enum(["accepted","rejected"])}).safeParse(Object.fromEntries(form));
  if(!input.success)redirect("/app/ai-hub/agents?fout=velden");
  const {user,membership}=await requireActiveMembership();
  if(process.env.COMMANDCENTER_AGENT_RESULTS_ENABLED!=="true" || !await canReadMcpCommandCenter(user.id,membership.organization_id))redirect("/app/ai-hub/agents?fout=rechten");
  const {error}=await createAdminClient().rpc("review_commandcenter_agent_result",{p_actor:user.id,p_org:membership.organization_id,p_job:input.data.job_id,p_review:input.data.review});
  if(error)redirect("/app/ai-hub/agents?fout=review");
  revalidatePath("/app/ai-hub/agents");redirect("/app/ai-hub/agents?succes=review");
}
export async function dispatchAgentJob(form:FormData) {
  const id=z.string().uuid().safeParse(form.get("job_id"));
  const channel=technicalChannelConfig(process.env);
  if(!id.success || !channel)redirect("/app/ai-hub/agents?fout=kanaal");
  const {user,membership}=await requireActiveMembership();
  if(process.env.COMMANDCENTER_AGENT_RESULTS_ENABLED!=="true" || process.env.COMMANDCENTER_MCP_DATA_STATE!=="ready"
    || !await canReadMcpCommandCenter(user.id,membership.organization_id))redirect("/app/ai-hub/agents?fout=rechten");
  const admin=createAdminClient(),lease=randomUUID();
  const args={p_actor:user.id,p_org:membership.organization_id,p_job:id.data};
  const claimed=await admin.rpc("claim_commandcenter_agent_dispatch",{...args,p_channel:channel.channelId,p_lease:lease});
  if(claimed.error || !claimed.data)redirect("/app/ai-hub/agents?fout=opdracht");
  if(claimed.data.dispatch_state==="accepted")redirect("/app/ai-hub/agents?succes=verzonden");
  let receipt:{conversationUrl:string;providerRunId:string|null}|null=null;
  try{receipt=await triggerTechnicalAgent(channel,id.data);}catch{/* Unknown external outcome: stable key permits a safe retry. */}
  const finished=await admin.rpc("finish_commandcenter_agent_dispatch",{...args,p_lease:lease,p_url:receipt?.conversationUrl??null,p_run:receipt?.providerRunId??null});
  revalidatePath("/app/ai-hub/agents");
  if(finished.error || !receipt)redirect("/app/ai-hub/agents?fout=ontvangst-onbekend");
  redirect("/app/ai-hub/agents?succes=verzonden");
}
