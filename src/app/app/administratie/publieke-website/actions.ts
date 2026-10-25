'use server';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {requireActiveMembership} from '@/lib/auth-context';
import {publicWebsiteOperations} from '@/lib/f6-public-contract';
const route='/app/administratie/publieke-website';
function message(text:string):never{return redirect(route+'?melding='+encodeURIComponent(text));}
export async function runPublicWebsite(form:FormData){
 if(process.env.BESC_PUBLIC_WEBSITE_ADMIN_ENABLED!=='true')message('Bediening voor de publieke website staat uit.');
 const {supabase,membership}=await requireActiveMembership();
 const op=String(form.get('operation')??''),request=String(form.get('request_id')??'');
 if(!Object.hasOwn(publicWebsiteOperations,op)||!/^[a-f0-9-]{36}$/i.test(request))message('Controleer de handeling.');
 const data:Record<string,unknown>={};
 for(const [key,value]of form.entries())if(key.startsWith('data_')&&typeof value==='string'){
  const name=key.slice(5);data[name]=['expected_version','entry_epoch'].includes(name)?Number(value):name==='enabled'?value==='true':value.trim();
 }
 if(op==='channel.create'||op==='channel.key')data.key_sha256=process.env.BESC_PUBLIC_WEBSITE_KEY_SHA256??'';
 if(op==='grant.add'){
  const raw=String(form.get('candidate')??'');if(raw.length>1000)message('Controleer de gekozen versie.');
  try{const c=JSON.parse(raw);for(const name of ['kind','entry_id','revision_id','entry_epoch'])data[name]=c[name];}catch{message('Controleer de gekozen versie.');}
 }
 const parsed=publicWebsiteOperations[op as keyof typeof publicWebsiteOperations].safeParse(data);
 if(!parsed.success)message('Controleer alle velden en de afzonderlijke serversleutel.');
 const result=await supabase.rpc('f6_public_workflow',{p_organization_id:membership.organization_id,p_operation:op,p_data:parsed.data,p_request_id:request});
 if(result.error)message(result.error.code==='40001'?'De versie is gewijzigd. Vernieuw en beoordeel opnieuw.':result.error.code==='42501'?'Je hebt geen actuele bevoegdheid of de gekozen bron is niet beschikbaar.':'De handeling kon niet worden bevestigd. Controleer de actuele gegevens.');
 revalidatePath(route);redirect(route+'?succes=opgeslagen');
}
