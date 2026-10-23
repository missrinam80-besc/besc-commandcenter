'use server';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {requireActiveMembership} from '@/lib/auth-context';
import {parsePartnerOperation} from '@/lib/f4-partner-contract';
import {creatorFeedback} from '@/lib/f4-contract';
import {localDateTimeToIso} from '@/lib/format';
export async function runPartnerAdmin(form:FormData){
 const route='/app/administratie/partners-publicatie';if(process.env.BESC_PARTNER_PLATFORM_ENABLED!=='true')redirect(route);
 const {supabase,membership}=await requireActiveMembership(),site=String(form.get('site_id')??''),request=String(form.get('request_id')??''),op=String(form.get('operation')??'');
 if(!/^[a-f0-9-]{36}$/i.test(site)||!/^[a-f0-9-]{36}$/i.test(request))redirect(route);
 const {data:allowed}=await supabase.from('publication_sites').select('id').eq('id',site).eq('organization_id',membership.organization_id).maybeSingle();if(!allowed)redirect(route);
 const data:Record<string,unknown>={};for(const [k,v]of form.entries()){if(!k.startsWith('data_')||typeof v!=='string'||k==='data_role_id')continue;const key=k.slice(5);data[key]=['published_at','valid_until'].includes(key)?localDateTimeToIso(v):['expected_revision','expected_epoch'].includes(key)?Number(v):['enabled','rights_confirmed'].includes(key)?v==='on':v.trim();}
 if(op==='site.configure'&&!('enabled'in data))data.enabled=false;if(op==='partner.review'&&!('rights_confirmed'in data))data.rights_confirmed=false;
 if(op==='partner.draft'){
  const ids=form.getAll('data_role_id').map(String);if(!ids.length||ids.length>6||ids.some(id=>!/^[a-f0-9-]{36}$/i.test(id)))redirect(route+'?site='+site);
  const p=await supabase.from('partners').select('id,name,website').eq('id',String(data.partner_id)).eq('organization_id',membership.organization_id).maybeSingle();
  const roles=await supabase.from('partner_roles').select('id,role').eq('organization_id',membership.organization_id).eq('partner_id',String(data.partner_id)).in('id',ids);
  if(!p.data||roles.error||roles.data?.length!==ids.length)redirect(route+'?site='+site);
  const logo=String(form.get('logo_id')??'').trim();data.payload={slug:String(form.get('slug')??'').trim(),locale:String(form.get('locale')??'nl-BE'),name:p.data.name,description:String(form.get('description')??'').trim(),roles:roles.data.map(r=>r.role).sort(),website_url:p.data.website?.trim()||null,logo:logo?{public_media_id:logo,alt:String(form.get('logo_alt')??'').trim(),credit:String(form.get('logo_credit')??'').trim()}:null};data.role_ids=ids;
 }
 const parsed=parsePartnerOperation(op,data);if(!parsed.success)redirect(route+'?site='+site+'&melding='+encodeURIComponent('Controleer de velden, geselecteerde rollen en bevestiging.'));
 const result=await supabase.rpc('f4_partner_workflow',{p_site_id:site,p_operation:op,p_data:parsed.data,p_request_id:request});revalidatePath(route);redirect(route+'?site='+site+(result.error?'&melding='+encodeURIComponent(/source|proof/.test(result.error.message)?'Controleer de actuele brongegevens, rollen en het bewijs. Bereid daarna een nieuwe versie voor.':creatorFeedback(result.error.message)):'&succes=opgeslagen'));
}
