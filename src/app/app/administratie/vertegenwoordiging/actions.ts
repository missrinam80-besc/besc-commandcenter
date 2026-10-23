'use server';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {requireActiveMembership} from '@/lib/auth-context';
import {parseDelegationOperation} from '@/lib/delegation-contract';
import {creatorFeedback} from '@/lib/f4-contract';
import {localDateTimeToIso} from '@/lib/format';
export async function runDelegationAdmin(form:FormData){
 const route='/app/administratie/vertegenwoordiging';if(process.env.BESC_PARTNER_DELEGATION_ENABLED!=='true')redirect(route);
 const {supabase,membership}=await requireActiveMembership(),site=String(form.get('site_id')??''),request=String(form.get('request_id')??''),op=String(form.get('operation')??'');
 if(!/^[a-f0-9-]{36}$/i.test(site)||!/^[a-f0-9-]{36}$/i.test(request))redirect(route);
 const {data:allowed}=await supabase.from('publication_sites').select('id').eq('id',site).eq('organization_id',membership.organization_id).maybeSingle();if(!allowed)redirect(route);
 const data:Record<string,unknown>={};for(const [k,v]of form.entries()){if(!k.startsWith('data_')||typeof v!=='string'||k==='data_role_id')continue;const key=k.slice(5);data[key]=key==='valid_until'?localDateTimeToIso(v):key==='expected_partner_revision'?Number(v):key==='enabled'?v==='on':v.trim();}
 if(op==='site.configure'&&!('enabled'in data))data.enabled=false;
 if(!['site.configure','delegation.assign','delegation.revoke','proposal.respond','proposal.prepare'].includes(op))redirect(route);
 if(op==='proposal.prepare'){if(process.env.BESC_PARTNER_PLATFORM_ENABLED!=='true')redirect(route+'?site='+site+'&melding='+encodeURIComponent('Partnerpublicatie moet afzonderlijk zijn ingeschakeld om een publicatieconcept voor te bereiden.'));data.role_ids=form.getAll('data_role_id').map(String);}
 const parsed=parseDelegationOperation(op,data);if(!parsed.success)redirect(route+'?site='+site+'&melding='+encodeURIComponent('Controleer de velden, het bewijs en de geldigheid.'));
 const result=await supabase.rpc('f4_delegation_workflow',{p_site_id:site,p_operation:op,p_data:parsed.data,p_request_id:request});revalidatePath(route);revalidatePath('/app/administratie/partners-publicatie');redirect(route+'?site='+site+(result.error?'&melding='+encodeURIComponent(/source_update_required/.test(result.error.message)?'Naam of website wijkt af van de bron. Verifieer eerst de bronwijziging apart; daarna is een nieuw actueel voorstel nodig.':creatorFeedback(result.error.message)):'&succes=opgeslagen'));
}
