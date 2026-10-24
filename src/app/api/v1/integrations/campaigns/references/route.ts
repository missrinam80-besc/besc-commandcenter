import { handleCampaignReference,parseReferenceClients } from '@/lib/campaign-reference-api';
import { createAdminClient } from '@/lib/supabase/admin';
import { withBotUpstream } from '@/lib/bot-api-upstream';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(request:Request){
 if(process.env.BESC_STREAMERBOT_REFERENCES_ENABLED!=='true'||process.env.BESC_CAMPAIGNS_ENABLED!=='true')return Response.json({error:{code:'not_found'}},{status:404,headers:{'Cache-Control':'no-store'}});
 try{return await withBotUpstream(fetcher=>handleCampaignReference(request,{enabled:true,clients:()=>parseReferenceClients(process.env.BESC_CAMPAIGN_REFERENCE_CLIENTS_JSON),receive:async(client,data)=>{
   const r=await createAdminClient(fetcher).rpc('f5_receive_reference',{p_org:client.organizationId,p_source:client.sourceId,p_broadcaster:client.broadcasterId,p_data:data});
   if(r.error)throw Error(r.error.code==='23505'?'idempotency_conflict':r.error.code==='42501'?'source_unavailable':r.error.message?.includes('f5_daily_limit')?'rate_limited':/f5_invalid_(fields|time)/.test(r.error.message??'')?'invalid_fields':'upstream_unavailable');return r.data;
 }}),{signal:request.signal});}catch{return Response.json({error:{code:'upstream_unavailable'}},{status:503,headers:{'Cache-Control':'no-store'}});}
}
