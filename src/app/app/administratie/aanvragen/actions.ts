'use server';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {requireActiveMembership} from '@/lib/auth-context';
import {parseIntakeOperation} from '@/lib/f4-intake-contract';
import {creatorFeedback,parseCreatorOperation} from '@/lib/f4-contract';
import {localDateTimeToIso} from '@/lib/format';
export async function runIntakeAdmin(form:FormData){
 const route='/app/administratie/aanvragen';if(process.env.BESC_PLATFORM_INTAKE_ENABLED!=='true')redirect(route);
 const {supabase,membership}=await requireActiveMembership(),site=String(form.get('site_id')??''),request=String(form.get('request_id')??''),op=String(form.get('operation')??'');
 if(!/^[a-f0-9-]{36}$/i.test(site)||!/^[a-f0-9-]{36}$/i.test(request))redirect(route);
 const {data:allowed}=await supabase.from('publication_sites').select('id').eq('id',site).eq('organization_id',membership.organization_id).maybeSingle();if(!allowed)redirect(route);
 const data:Record<string,unknown>={};for(const [k,v]of form.entries()){if(!k.startsWith('data_')||typeof v!=='string')continue;const key=k.slice(5);data[key]=['opens_at','closes_at','valid_until'].includes(key)?localDateTimeToIso(v):['version','expected_version'].includes(key)?Number(v):['policy_confirmed','may_view','enabled'].includes(key)?v==='on':v.trim();}
 if(op==='form.open'&&!('policy_confirmed'in data))data.policy_confirmed=false;
 if(op==='contact.configure'){if(process.env.BESC_GENERAL_CONTACT_ENABLED!=='true')redirect(route);data.enabled=form.get('data_enabled')==='on';data.form_id=data.form_id||null;}
 const accessOp=op==='access.assign'||op==='access.revoke';if(op==='access.assign'&&!('may_view'in data))data.may_view=false;
 const parsed=accessOp?parseCreatorOperation(op,data):parseIntakeOperation(op,data);if(!parsed.success)redirect(route+'?site='+site+'&melding='+encodeURIComponent('Controleer de velden, de versie en je bevestiging.'));
 const result=op==='contact.configure'?await supabase.rpc('f4_contact_configure',{p_site_id:site,p_data:parsed.data,p_request_id:request}):await supabase.rpc(accessOp?'f4_workflow':'f4_intake_workflow',{p_site_id:site,p_operation:op,p_data:parsed.data,p_request_id:request});
 revalidatePath(route);redirect(route+'?site='+site+(result.error?'&melding='+encodeURIComponent(creatorFeedback(result.error.message)):'&succes=opgeslagen'));
}
