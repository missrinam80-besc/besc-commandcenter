'use server';
import {randomUUID,createHash} from 'node:crypto';
import sharp from 'sharp';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {f2Operations,f2Feedback,f2BodySchema,safeRegistrationUrl} from '@/lib/f2-contract';
import {localDateTimeToIso,formatDateTimeLocal} from '@/lib/format';
const page='/app/administratie/website';
function message(value:string):never{return redirect(page+'?melding='+encodeURIComponent(value));}
export async function runF2(form:FormData){
 if(process.env.BESC_PUBLICATION_STAGING_ENABLED!=='true')message('Websitebediening staat in deze omgeving nog uit.');
 const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)redirect('/login');
 const op=String(form.get('operation')??'');if(!Object.hasOwn(f2Operations,op))message('Deze handeling is niet beschikbaar.');
 const data:Record<string,unknown>={};
 for(const [k,v] of form.entries())if(k.startsWith('data_')&&typeof v==='string'){
  const key=k.slice(5);if(key==='expected_epoch')data[key]=Number(v);else if(key==='active')data[key]=v==='true';
  else if(['published_at','valid_until'].includes(key)){
   if(!v){data[key]=null;continue;}const stamp=localDateTimeToIso(v);if(!stamp||formatDateTimeLocal(stamp)!==v)message('Deze tijd bestaat niet in de Belgische tijdzone.');data[key]=stamp;
  }else data[key]=v.trim();
 }
 if(op==='site.create'||op==='site.key')data.key_sha256=process.env.BESC_PUBLICATION_KEY_SHA256??'';
 const parsed=f2Operations[op as keyof typeof f2Operations].safeParse(data);
 const org=String(form.get('organization_id')??''),request=String(form.get('request_id')??'');
 if(!parsed.success||!org.match(/^[a-f0-9-]{36}$/i)||!request.match(/^[a-f0-9-]{36}$/i))message('Controleer de ingevulde velden.');
 if(op==='release'){
  const {data:revision,error}=await db.from('publication_revisions').select('payload').eq('organization_id',org).eq('id',String(data.revision_id)).single();
  const p=revision?.payload;
  if(error||!p||!f2BodySchema.safeParse(p.body).success||(p.registration_url&&!safeRegistrationUrl(p.registration_url)))message('Maak eerst een nieuwe veilige publicatierevisie. Controleer de tekst en de inschrijflink.');
 }
 const result=await db.rpc('f2_workflow',{p_organization_id:org,p_operation:op,p_data:parsed.data,p_request_id:request});
 if(result.error)message(f2Feedback(result.error));revalidatePath(page);redirect(page+'?succes=opgeslagen');
}
export async function uploadF2Media(form:FormData){
 if(process.env.BESC_PUBLICATION_STAGING_ENABLED!=='true')message('Websitebediening staat in deze omgeving nog uit.');
 const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)redirect('/login');
 const org=String(form.get('organization_id')??''),site=String(form.get('site_id')??''),document=String(form.get('document_id')??'');
 if(![org,site,document].every(v=>/^[a-f0-9-]{36}$/i.test(v))||form.get('rights_confirmed')!=='on')message('Controleer de mediarechten en het gekozen document.');
 const {data:caps,error}=await db.rpc('f1_capabilities',{p_organization_id:org});
 if(error||!caps||!(caps.publication_editor||caps.publication_reviewer))message('Je hebt voor deze handeling geen actuele bevoegdheid.');
 const file=form.get('media');if(!(file instanceof File)||file.size<1||file.size>2097152)message('Kies een PNG- of WebP-afbeelding van maximaal 2 MB.');
 let bytes:Buffer;let width:number,height:number;
 try{const raw=Buffer.from(await file.arrayBuffer());const image=sharp(raw,{limitInputPixels:16777216,animated:false});const meta=await image.metadata();if(!['png','webp'].includes(meta.format??''))throw Error('invalid_image');const result=await image.rotate().resize({width:4096,height:4096,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer({resolveWithObject:true});bytes=result.data;width=result.info.width;height=result.info.height;if(bytes.length>2097152)throw Error('too_large');}catch{message('De afbeelding kon niet veilig worden verwerkt.');}
 const id=randomUUID(),path=org+'/'+id+'.webp';const admin=createAdminClient();
 const upload=await admin.storage.from('website-staging-media').upload(path,bytes!,{contentType:'image/webp',upsert:false,cacheControl:'0'});
 if(upload.error)message('De afbeelding kon niet worden opgeslagen.');
 const result=await db.rpc('f2_workflow',{p_organization_id:org,p_operation:'media.register',p_request_id:id,p_data:{site_id:site,public_media_id:id,document_id:document,storage_path:path,sha256:createHash('sha256').update(bytes!).digest('hex'),mime:'image/webp',bytes:bytes!.length,width:width!,height:height!}});
 if(result.error){await admin.storage.from('website-staging-media').remove([path]);message(f2Feedback(result.error));}
 revalidatePath(page);redirect(page+'?succes=media');
}
