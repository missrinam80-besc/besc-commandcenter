import { z } from "zod";

export function technicalChannelConfig(env:Record<string,string|undefined>) {
  const channelId=env.BESC_TECHNICAL_AGENT_CHANNEL_ID??"";
  const token=env.BESC_WORKSPACE_AGENT_ACCESS_TOKEN??"";
  if(!/^agtch_[A-Za-z0-9_-]+$/.test(channelId) || !token || token.length>8192 || /[\r\n]/.test(token)) return null;
  return {channelId,token};
}
export async function triggerTechnicalAgent(config:{channelId:string;token:string},jobId:string,fetcher:typeof fetch=fetch) {
  z.string().uuid().parse(jobId);
  if(!technicalChannelConfig({BESC_TECHNICAL_AGENT_CHANNEL_ID:config.channelId,BESC_WORKSPACE_AGENT_ACCESS_TOKEN:config.token}))throw Error("agent_channel_invalid");
  const response=await fetcher(`https://api.chatgpt.com/v1/workspace_agents/${config.channelId}/trigger`,{
    method:"POST",redirect:"error",signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${config.token}`,
      "Content-Type":"application/json","Idempotency-Key":jobId,"OpenAI-Beta":"workspace_agent_runs=v1"},
    body:JSON.stringify({conversation_key:`besc-cc-${jobId}`,input:
      `BESC Command Center-opdracht ${jobId}. Lees deze opdracht via get_commandcenter_agent_job met jobId ${jobId}. Gebruik uitsluitend de begrensde context, meld ontbrekende inhoud als onzeker en voer geen dossierwijzigingen of publicaties uit. Schrijf één evaluation, proposal of draft terug met submit_commandcenter_agent_result. Gebruik jobId ${jobId}, idempotencyKey ${jobId} en de sourceVersion uit source_snapshot.recordVersion. Dezelfde retry moet exact hetzelfde resultaat gebruiken. Als de koppeling of toestemming ontbreekt, meld dat in deze chat; maak geen eigen verbindingsgegevens of bronnen.`,}),
  });
  if(response.status!==202)throw Error("agent_trigger_unconfirmed");
  const receipt=await response.json() as {conversation_url?:unknown;agent_trigger_run_id?:unknown};
  const conversationUrl=z.string().regex(/^https:\/\/chatgpt\.com\/c\/[A-Za-z0-9_-]+$/).parse(receipt.conversation_url);
  const providerRunId=receipt.agent_trigger_run_id===undefined?null:z.string().regex(/^apirun_[A-Za-z0-9_-]+$/).parse(receipt.agent_trigger_run_id);
  return {conversationUrl,providerRunId};
}
