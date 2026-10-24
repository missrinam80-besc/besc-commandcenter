'use server';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {requireActiveMembership} from '@/lib/auth-context';
import {parseContentOperation} from '@/lib/site-content-contract';
import {creatorFeedback} from '@/lib/f4-contract';
import {localDateTimeToIso} from '@/lib/format';
import bundle from '@/lib/site-content-bundle.json';
export async function runContentAdmin(form:FormData){
 const route='/app/administratie/site-inhoud';if(process.env.BESC_SITE_PAGES_ENABLED!=='true'&&process.env.BESC_SITE_REDIRECTS_ENABLED!=='true')redirect(route);
 const {supabase,membership}=await requireActiveMembership(),site=String(form.get('site_id')??''),request=String(form.get('request_id')??''),op=String(form.get('operation')??'');
 if(!/^[a-f0-9-]{36}$/i.test(site)||!/^[a-f0-9-]{36}$/i.test(request))redirect(route);const {data:allowed}=await supabase.from('publication_sites').select('id').eq('id',site).eq('organization_id',membership.organization_id).maybeSingle();if(!allowed)redirect(route);
 const data:Record<string,unknown>={};for(const [k,v]of form.entries()){if(!k.startsWith('data_')||typeof v!=='string')continue;const key=k.slice(5);data[key]=['published_at','valid_until'].includes(key)?localDateTimeToIso(v):['expected_revision','expected_epoch','expected_reviews'].includes(key)?Number(v):['pages_enabled','redirects_enabled','rights_confirmed','facts_confirmed'].includes(key)?v==='on':v.trim();}
 if(op==='site.configure'){data.pages_enabled=form.get('data_pages_enabled')==='on';data.redirects_enabled=form.get('data_redirects_enabled')==='on';}
 if(op==='content.review'){data.rights_confirmed=form.get('data_rights_confirmed')==='on';data.facts_confirmed=form.get('data_facts_confirmed')==='on';}
 if(op==='migration.stage'){const source=bundle.records.find(r=>r.record_id===form.get('record_id'));if(!source)redirect(route+'?site='+site);data.record=source;}
 if(op==='content.draft'){
  data.dossier_id=data.dossier_id||null;data.migration_record_id=data.migration_record_id||null;
  if(data.kind==='page'){
   if(process.env.BESC_SITE_PAGES_ENABLED!=='true')redirect(route);const image=String(form.get('hero_id')??'').trim();
   const lines=String(form.get('links')??'').split('\n').filter(x=>x.trim());if(lines.some(line=>line.indexOf('|')<1||line.indexOf('|')!==line.lastIndexOf('|')))redirect(route+'?site='+site+'&melding='+encodeURIComponent('Gebruik per link één label en één relatief doel, gescheiden door |.'));const links=lines.map(line=>{const i=line.indexOf('|');return {label:line.slice(0,i).trim(),href:line.slice(i+1).trim()};});
   data.payload={slug:String(form.get('slug')??''),locale:String(form.get('locale')??'nl-BE'),title:String(form.get('title')??''),summary:String(form.get('summary')??''),body:{format:'plain_text',value:String(form.get('body')??'')},navigation:form.get('navigation')==='on',links,hero:image?{public_media_id:image,alt:String(form.get('hero_alt')??''),credit:String(form.get('hero_credit')??'')}:null};
  }else{
   if(process.env.BESC_SITE_REDIRECTS_ENABLED!=='true')redirect(route);const raw=String(form.get('old_url')??''),m=/^https:\/\/([^/?#]+)(\/[^?#]*)?(?:\?([^#]*))?$/.exec(raw);if(!m)redirect(route+'?site='+site+'&melding='+encodeURIComponent('Gebruik de exacte oorspronkelijke https-URL zonder fragment.'));
   data.payload={old_host:m[1],old_path:m[2]||'/',old_query:m[3]??'',mode:String(form.get('mode')??'redirect'),target_path:form.get('mode')==='gone'?null:String(form.get('target_path')??'')};
  }
 }
 const parsed=parseContentOperation(op,data);if(!parsed.success)redirect(route+'?site='+site+'&melding='+encodeURIComponent('Controleer de velden, veilige verwijzingen en bevestigingen.'));
 const result=await supabase.rpc('f4_content_workflow',{p_site_id:site,p_operation:op,p_data:parsed.data,p_request_id:request});revalidatePath(route);redirect(route+'?site='+site+(result.error?'&melding='+encodeURIComponent(/target_or_chain|route_conflict/.test(result.error.message)?'Doel ontbreekt, de route is gereserveerd of er ontstaat een omleidingsketen. Controleer de actuele vrijgaven.':creatorFeedback(result.error.message)):'&succes=opgeslagen'));
}
