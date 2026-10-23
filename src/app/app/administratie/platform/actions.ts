'use server';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {requireActiveMembership} from '@/lib/auth-context';
import {parseCreatorOperation,creatorFeedback} from '@/lib/f4-contract';
import {localDateTimeToIso} from '@/lib/format';
export async function runCreatorAdmin(form:FormData){
 const route='/app/administratie/platform';
 if(process.env.BESC_CREATOR_PLATFORM_ENABLED!=='true')redirect(route+'?melding='+encodeURIComponent('Creatorbeheer is nog niet ingeschakeld.'));
 const {supabase,membership}=await requireActiveMembership();
 const site=String(form.get('site_id')??''),request=String(form.get('request_id')??''),op=String(form.get('operation')??'');
 if(!/^[a-f0-9-]{36}$/i.test(site)||!/^[a-f0-9-]{36}$/i.test(request))redirect(route);
 const {data:allowedSite}=await supabase.from('publication_sites').select('id').eq('id',site).eq('organization_id',membership.organization_id).maybeSingle();if(!allowedSite)redirect(route);
 const data:Record<string,unknown>={};for(const [k,v]of form.entries()){if(!k.startsWith('data_')||typeof v!=='string')continue;const key=k.slice(5);data[key]=['own_enabled','read_enabled','may_view','rights_confirmed'].includes(key)?v==='on':key==='expected_epoch'?Number(v):['valid_until','published_at'].includes(key)?localDateTimeToIso(v):v.trim();}
 // HTML omits unchecked checkboxes; supply false rather than inheriting old state.
 for(const key of op==='site.configure'?['own_enabled','read_enabled']:op==='access.assign'?['may_view']:op==='profile.review'?['rights_confirmed']:[])if(!(key in data))data[key]=false;
 const parsed=parseCreatorOperation(op,data);if(!parsed.success)redirect(route+'?site='+site+'&melding='+encodeURIComponent('Controleer de velden en bevestig de gekozen handeling.'));
 const result=await supabase.rpc('f4_workflow',{p_site_id:site,p_operation:op,p_data:parsed.data,p_request_id:request});
 revalidatePath(route);redirect(route+'?site='+site+(result.error?'&melding='+encodeURIComponent(creatorFeedback(result.error.message)):'&succes=opgeslagen'));
}
