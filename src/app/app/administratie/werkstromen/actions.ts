'use server';
import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { f1BodyFromText,f1Feedback,parseF1Operation } from '@/lib/f1-workflows';

const returns=new Set(['/app/administratie/werkstromen','/app/account/toestemming','/portal/toestemming']);
export async function runF1Workflow(form:FormData){
 const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)redirect('/login');
 const requested=String(form.get('return_to')??'');const returnTo=returns.has(requested)?requested:'/app/administratie/werkstromen';
 const org=String(form.get('organization_id')??'');const request=String(form.get('request_id')??'');
 if(!/^[0-9a-f-]{36}$/i.test(org)||!/^[0-9a-f-]{36}$/i.test(request))redirect(returnTo+'?fout=velden');
 const op=String(form.get('operation')??'');const data:Record<string,unknown>={};
 const numeric=new Set(['expected_revision','text_version']);const boolean=new Set(['accepted','policy_confirmed','conflict_declared','rights_confirmed']);
 for(const [key,value]of form.entries()){
  if(!key.startsWith('data_')||typeof value!=='string')continue;const name=key.slice(5);
  if(numeric.has(name))data[name]=Number(value);else if(boolean.has(name))data[name]=value==='true'||value==='on';
  else if(['scope','allowed_scope'].includes(name)){try{data[name]=JSON.parse(value);}catch{redirect(returnTo+'?fout=velden');}}
  else data[name]=value.trim()||null;
 }
 if(['governance.review','governance.decide'].includes(op))data.conflict_declared=form.get('data_conflict_declared')==='on';
 const ref=String(form.get('source_ref')??'').split(':');if(ref.length===3){data.source_type=ref[0];data.source_id=ref[1];data.expected_revision=Number(ref[2]);}
 const review=String(form.get('review_result')??'').split(':');if(review.length===2){data.dimension=review[0];data.outcome=review[1];}
 const relation=String(form.get('relation_ref')??'').split(':');if(relation.length===2){data.source_type=relation[0];data.source_id=relation[1];}
 const member=String(form.get('member_ref')??'').split(':');if(member.length===2){data.member_id=member[0];data.expected_revision=Number(member[1]);}
 const person=String(form.get('person_ref')??'').split(':');if(person.length===2){data.person_id=person[0];data.account_user_id=person[1];}
 if(op==='consent.purpose')data.allowed_scope={fields:String(form.get('scope_fields')??'').split(',').map(x=>x.trim()).filter(Boolean)};
 if(op==='publication.draft'){
  const payload:Record<string,unknown>={title:String(form.get('public_title')??'').trim(),summary:String(form.get('public_summary')??'').trim(),slug:String(form.get('public_slug')??'').trim(),locale:String(form.get('public_locale')??'nl-BE'),body:{format:'sanitized_html',value:f1BodyFromText(String(form.get('public_body')??''))},media:[]};
  const mediaUrl=String(form.get('public_media_url')??'').trim();if(mediaUrl)payload.media=[{url:mediaUrl,alt:String(form.get('public_media_alt')??'').trim(),credit:String(form.get('public_media_credit')??'').trim()}];
  if(data.source_type==='event'){
   const {data:event}=await supabase.from('events').select('start_at,end_at,location,eventbrite_url').eq('organization_id',org).eq('id',String(data.source_id)).is('deleted_at',null).maybeSingle();
   if(!event?.start_at||!event.end_at)redirect(returnTo+'?fout=eventtijd');
   Object.assign(payload,{starts_at:event.start_at,ends_at:event.end_at,timezone:'Europe/Brussels',location_label:String(form.get('public_location')??event.location??''),registration_url:String(form.get('public_registration_url')??event.eventbrite_url??'')});
  }
  data.payload=payload;
 }
 const parsed=parseF1Operation(op,data);
 if(!parsed.success)redirect(returnTo+'?fout=velden');
 const {error}=await supabase.rpc('f1_workflow',{p_organization_id:org,p_operation:parsed.operation,p_data:parsed.data,p_request_id:request});
 if(error)redirect(returnTo+'?melding='+encodeURIComponent(f1Feedback(error)));
 for(const page of ['/app/administratie','/app/administratie/werkstromen','/app/account/toestemming','/portal/toestemming','/app/sponsors','/app/campagnes'])revalidatePath(page,'layout');
 redirect(returnTo+'?succes=opgeslagen&organisatie='+org);
}
// New form instances receive an idempotency ID on the server, never a user actor.
export async function newF1Request(){return randomUUID();}
