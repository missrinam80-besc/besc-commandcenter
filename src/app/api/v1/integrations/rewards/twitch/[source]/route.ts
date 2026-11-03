import {handleTwitchRewards,twitchRewardSources} from '@/lib/rewards-twitch-eventsub';
import {createAdminClient} from '@/lib/supabase/admin';
import {withBotUpstream} from '@/lib/bot-api-upstream';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request,context:{params:Promise<{source:string}>}){
 const {source}=await context.params;
 let sources;try{sources=twitchRewardSources(process.env.BESC_REWARDS_TWITCH_EVENTSUB_SOURCES_JSON);}catch{return Response.json({error:'unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});}
 return withBotUpstream(fetcher=>handleTwitchRewards(request,sources[source],{
  enabled:process.env.BESC_REWARDS_ACTIVITY_ENABLED==='true'&&process.env.BESC_REWARDS_TWITCH_VERIFIED_ENABLED==='true',
  async store(s,f){const result=await createAdminClient(fetcher).rpc('re02_twitch',{o:s.organizationId,b:s.broadcasterId,d:f});if(result.error)throw Error('upstream');return result.data;}
 }),{signal:request.signal});
}
