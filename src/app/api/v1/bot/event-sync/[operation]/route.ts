import { withBotUpstream } from '@/lib/bot-api-upstream';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseBotClients } from '@/lib/bot-api';
import { handleEventSyncRequest } from '@/lib/event-discord-bot-api';
export const runtime='nodejs';
export async function POST(request:Request){
 if(process.env.BESC_DISCORD_EVENTS_ENABLED!=='true')return Response.json({error:{code:'not_found'}},{status:404,headers:{'Cache-Control':'no-store'}});
 try{return await withBotUpstream(fetcher=>handleEventSyncRequest(request,{enabled:true,clients:()=>parseBotClients(process.env.BESC_BOT_CLIENTS_JSON),siteOrigin:process.env.NEXT_PUBLIC_SITE_URL??'',store:()=>({async operation(op,d){const r=await createAdminClient(fetcher).rpc('event_discord_bot',{op,d});if(r.error)throw Error('event_sync_unavailable');return r.data??{};}})}),{signal:request.signal});}
 catch{return Response.json({error:{code:'event_sync_unavailable'}},{status:503,headers:{'Cache-Control':'no-store'}});}
}
