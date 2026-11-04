import 'server-only';
import {z} from 'zod';
import {requireActiveMembership} from '@/lib/auth-context';
import {canReadMcpCommandCenter} from '@/lib/commandcenter-mcp-store';
import {createAdminClient} from '@/lib/supabase/admin';
import {buildAgentDocument,type DocumentJob} from '@/lib/agent-document';

export async function loadAgentDocument(jobId:string){
  if(process.env.BESC_AGENT_WORKFLOWS_ENABLED!=='true'||process.env.COMMANDCENTER_AGENT_RESULTS_ENABLED!=='true'||process.env.COMMANDCENTER_MCP_DATA_STATE!=='ready')throw Error('agent_not_enabled');
  z.string().uuid().parse(jobId);
  const {user,membership}=await requireActiveMembership();
  if(!await canReadMcpCommandCenter(user.id,membership.organization_id))throw Error('agent_access_denied');
  const db=createAdminClient();
  const {data,error}=await db.from('agent_jobs').select('id,source_entity,source_id,source_version,source_snapshot,review,agent_results(payload)')
    .eq('id',jobId).eq('organization_id',membership.organization_id).eq('created_by',user.id).eq('review','accepted').maybeSingle();
  if(error||!data||!['projects','events'].includes(data.source_entity))throw Error('agent_job_denied');
  const results=data.agent_results as unknown as {payload:unknown}[]|{payload:unknown}|null;
  const result=Array.isArray(results)?results[0]:results;
  if(!result)throw Error('agent_result_missing');
  const job=data as unknown as DocumentJob;
  const artifact=buildAgentDocument(job,result.payload);
  const {data:current,error:readError}=await db.from(job.source_entity).select('updated_at').eq('id',job.source_id).eq('organization_id',membership.organization_id).eq('updated_at',job.source_version).is('deleted_at',null).maybeSingle();
  if(readError)throw Error('agent_source_unavailable');
  const stale=!current;
  return {user,membership,job,artifact,stale};
}
