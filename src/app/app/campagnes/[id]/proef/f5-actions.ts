'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireActiveMembership } from '@/lib/auth-context';
import { createAdminClient } from '@/lib/supabase/admin';
import { discoverCampaignTwitch } from '@/lib/campaign-discovery';
import { CampaignSourceError } from '@/lib/campaign-twitch';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export async function discoverF5Campaign(form:FormData){
 const {supabase,membership}=await requireActiveMembership(),campaign=String(form.get('campaign')??''),source=String(form.get('source')??''),request=String(form.get('request')??'');
 if(![campaign,source,request].every(v=>uuid.test(v)))redirect('/app/campagnes?fout=velden');
 const route=`/app/campagnes/${campaign}/proef`;
 if(process.env.BESC_CAMPAIGN_DISCOVERY_ENABLED!=='true'||process.env.BESC_CAMPAIGNS_ENABLED!=='true')redirect(route+'?melding=Zoeken%20staat%20uit.');
 const ticket=await supabase.rpc('f5_discovery_begin',{p_org:membership.organization_id,p_campaign:campaign,p_source:source,p_request:request,p_start:String(form.get('start')??''),p_end:String(form.get('end')??'')});
 if(ticket.error||!ticket.data?.id)redirect(route+'?melding=De%20bron%20is%20niet%20beschikbaar%20of%20de%20limiet%20is%20bereikt.');
 if(ticket.data.status!=='new')redirect(route+'?melding=Deze%20zoekopdracht%20was%20al%20geregistreerd.');
 const admin=createAdminClient();let message='De zoekopdracht is afgerond. Suggesties moeten nog worden ingediend en beoordeeld.';
 try{
  const stored=await admin.rpc('read_social_account_credentials',{p_account_id:ticket.data.account_id});const credentials=Array.isArray(stored.data)?stored.data[0]:stored.data;
  if(stored.error||!credentials?.access_token)throw new CampaignSourceError('token_invalid');
  const items=await discoverCampaignTwitch({accessToken:credentials.access_token,clientId:process.env.TWITCH_CLIENT_ID??'',broadcasterId:ticket.data.broadcaster_id,start:String(form.get('start')),end:String(form.get('end'))});
  const committed=await admin.rpc('f5_discovery_finish',{p_run:ticket.data.id,p_items:items,p_error:null});
  if(committed.error||committed.data?.status!=='ready')message='De toegang of bron is gewijzigd. Er zijn geen suggesties vrijgegeven.';
 }catch(error){await admin.rpc('f5_discovery_finish',{p_run:ticket.data.id,p_items:null,p_error:error instanceof CampaignSourceError?error.code:'network'});message='De Twitch-zoekopdracht kon niet worden bevestigd. Controleer de bron en probeer later opnieuw.';}
 revalidatePath(route);redirect(route+'?melding='+encodeURIComponent(message));
}
export async function submitF5Discovery(form:FormData){
 const {supabase,membership}=await requireActiveMembership(),campaign=String(form.get('campaign')??''),run=String(form.get('run')??''),request=String(form.get('request')??'');
 if(![campaign,run,request].every(v=>uuid.test(v)))redirect('/app/campagnes?fout=velden');const route=`/app/campagnes/${campaign}/proef`;
 if(process.env.BESC_CAMPAIGN_DISCOVERY_ENABLED!=='true'||process.env.BESC_CAMPAIGNS_ENABLED!=='true')redirect(route+'?fout=uitgeschakeld');
 const result=await supabase.rpc('f5_discovery_submit',{p_org:membership.organization_id,p_run:run,p_index:Number(form.get('index')),p_request:request});
 revalidatePath(route);redirect(route+(result.error?'?melding=De%20bijdrage%20kon%20niet%20worden%20bevestigd.%20Controleer%20de%20actuele%20gegevens.':'?succes=opgeslagen'));
}
