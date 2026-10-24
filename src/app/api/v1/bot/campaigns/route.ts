import { campaignBotDisabled, handleCampaignBotRequest } from '@/lib/campaign-bot-api';
import { createCampaignBotStore } from '@/lib/campaign-bot-store';
import { parseBotClients } from '@/lib/bot-api';
import { createAdminClient } from '@/lib/supabase/admin';
import { withBotUpstream } from '@/lib/bot-api-upstream';
import { handleCampaignBotSubmit } from '@/lib/campaign-bot-submit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request:Request){
  if(process.env.BESC_CAMPAIGNS_BOT_ENABLED!=='true'||process.env.BESC_CAMPAIGNS_BOT_SUBMIT_ENABLED!=='true')return campaignBotDisabled();
  try{return await withBotUpstream(fetcher=>handleCampaignBotSubmit(request,{enabled:true,pilot:process.env.BESC_CAMPAIGNS_PILOT_ENABLED==='true',real:process.env.BESC_CAMPAIGNS_ENABLED==='true',clients:()=>parseBotClients(process.env.BESC_BOT_CLIENTS_JSON),store:()=>createCampaignBotStore(createAdminClient(fetcher))}),{signal:request.signal});}
  catch{return Response.json({error:{code:'upstream_unavailable'}},{status:503,headers:{'Cache-Control':'no-store'}});}
}
export async function GET(request: Request) {
  if (process.env.BESC_CAMPAIGNS_BOT_ENABLED !== 'true') return campaignBotDisabled();
  try {
    return await withBotUpstream(fetcher => handleCampaignBotRequest(request, {
      enabled: true, pilot: process.env.BESC_CAMPAIGNS_PILOT_ENABLED === 'true', real: process.env.BESC_CAMPAIGNS_ENABLED === 'true',
      clients: () => parseBotClients(process.env.BESC_BOT_CLIENTS_JSON),
      store: () => createCampaignBotStore(createAdminClient(fetcher)),
      audit: entry => console.info(JSON.stringify({ type: 'campaign_bot_read', ...entry })),
    }), { signal: request.signal });
  } catch {
    return Response.json({ error: { code: 'upstream_unavailable' } }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
