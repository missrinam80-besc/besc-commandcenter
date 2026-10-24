'use server';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {requireActiveMembership} from '@/lib/auth-context';
import {parseVacancyOperation} from '@/lib/vacancy-contract';
import {creatorFeedback} from '@/lib/f4-contract';
import {localDateTimeToIso} from '@/lib/format';
export async function runVacancyAdmin(form:FormData){
 const route='/app/administratie/vacatures';if(process.env.BESC_VACANCY_PLATFORM_ENABLED!=='true')redirect(route);
 const {supabase,membership}=await requireActiveMembership(),site=String(form.get('site_id')??''),request=String(form.get('request_id')??''),op=String(form.get('operation')??'');
 if(!/^[a-f0-9-]{36}$/i.test(site)||!/^[a-f0-9-]{36}$/i.test(request))redirect(route);
 const {data:allowed}=await supabase.from('publication_sites').select('id').eq('id',site).eq('organization_id',membership.organization_id).maybeSingle();if(!allowed)redirect(route);
 const data:Record<string,unknown>={};for(const [k,v]of form.entries()){if(!k.startsWith('data_')||typeof v!=='string')continue;const key=k.slice(5);data[key]=['published_at','valid_until'].includes(key)?localDateTimeToIso(v):['expected_revision','expected_epoch'].includes(key)?Number(v):['enabled','rights_confirmed'].includes(key)?v==='on':v.trim();}
 if(op==='site.configure'&&!('enabled'in data))data.enabled=false;if(op==='vacancy.review'&&!('rights_confirmed'in data))data.rights_confirmed=false;
 if(op==='vacancy.draft'){
  if(data.dossier_id==='')data.dossier_id=null;
  data.payload={slug:String(form.get('slug')??'').trim(),locale:String(form.get('locale')??'nl-BE'),title:String(form.get('title')??'').trim(),role_label:String(form.get('role_label')??'').trim(),summary:String(form.get('summary')??'').trim(),body:{format:'plain_text',value:String(form.get('body')??'').trim()},location_label:String(form.get('location_label')??'').trim(),availability_label:String(form.get('availability_label')??'').trim(),closes_at:localDateTimeToIso(String(form.get('closes_at')??''))};
 }
 const parsed=parseVacancyOperation(op,data);if(!parsed.success)redirect(route+'?site='+site+'&melding='+encodeURIComponent('Controleer de velden, de sluitingsdatum en je bevestiging.'));
 const result=await supabase.rpc('f4_vacancy_workflow',{p_site_id:site,p_operation:op,p_data:parsed.data,p_request_id:request});revalidatePath(route);redirect(route+'?site='+site+(result.error?'&melding='+encodeURIComponent(/source|proof|evidence/.test(result.error.message)?'Controleer de actuele vacature en de beleids- en bewijsdocumenten. Bereid zo nodig een nieuwe versie voor.':creatorFeedback(result.error.message)):'&succes=opgeslagen'));
}
