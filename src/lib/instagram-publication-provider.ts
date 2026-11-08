import {z} from 'zod';
import {inspectMetaToken} from './meta-token-diagnostics.ts';
import {instagramPublicationScopes,type InstagramJob,type InstagramProvider} from './instagram-publication.ts';

const id=z.string().regex(/^\d+$/);
type Config={apiVersion:string;appId:string;appSecret:string};
// Facebook Login only, matching the existing organization account connection.
// No default transport and no fallback to an organization/creator credential.
export function instagramGraphProvider(config:Config,transport:typeof fetch,enabled=false):InstagramProvider{
 if(!enabled)throw Error('instagram_provider_disabled');
 if(!/^v\d+\.\d+$/.test(config.apiVersion)||!config.appId||!config.appSecret)throw Error('instagram_configuration_required');
 const request:typeof fetch=(url,init)=>transport(url,{...init,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15_000)});
 async function graph(path:string,token:string,parameters?:URLSearchParams){
  try{
   const r=await request('https://graph.facebook.com/'+config.apiVersion+'/'+path,{method:parameters?'POST':'GET',headers:{Authorization:'Bearer '+token,...(parameters?{'Content-Type':'application/x-www-form-urlencoded'}:{})},body:parameters});
   if(!r.ok){await r.body?.cancel();throw Error('Provider refused');}
   const reader=r.body?.getReader();if(!reader)throw Error('No body');let text='',size=0;const decode=new TextDecoder();
   try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>262144)throw Error('Oversize');text+=decode.decode(value,{stream:true});}text+=decode.decode();}finally{await reader.cancel();}
   const body=JSON.parse(text);if(!body||typeof body!=='object'||body.error)throw Error('Provider error');return body;
  }catch{throw Error('instagram_provider_not_confirmed');}
 }
 return{
  preflight:async(account,token)=>{
   id.parse(account);const diagnostics=await inspectMetaToken(token,config,instagramPublicationScopes,request);
   if(diagnostics.missingScopes.length)throw Error('instagram_publish_permission_required');
   const accountData=z.object({id}).parse(await graph(account+'?fields=id',token));if(accountData.id!==account)throw Error('instagram_account_mismatch');
  },
  quota:async(account,token)=>{
   id.parse(account);const result=z.object({data:z.array(z.object({quota_usage:z.number().int().nonnegative(),config:z.object({quota_total:z.number().int().positive(),quota_duration:z.number().int().positive()})})).length(1)}).parse(await graph(account+'/content_publishing_limit?fields=quota_usage,config',token));
   if(result.data[0].quota_usage>=result.data[0].config.quota_total)throw Error('instagram_publishing_quota_reached');
  },
  create:async(job:InstagramJob,token)=>id.parse((await graph(id.parse(job.external_account_id)+'/media',token,new URLSearchParams({image_url:job.image_url,caption:job.caption}))).id),
  status:async(container,token)=>z.enum(['FINISHED','IN_PROGRESS','ERROR','EXPIRED','PUBLISHED']).parse((await graph(id.parse(container)+'?fields=status_code',token)).status_code),
  publish:async(account,container,token)=>id.parse((await graph(id.parse(account)+'/media_publish',token,new URLSearchParams({creation_id:id.parse(container)}))).id),
  receipt:async(account,media,token)=>{
   const body=z.object({id,permalink:z.string(),owner:z.object({id})}).parse(await graph(id.parse(media)+'?fields=id,permalink,owner',token));
   if(body.id!==media||body.owner.id!==account||!/^https:\/\/www\.instagram\.com\/p\/[A-Za-z0-9_-]+\/$/.test(body.permalink))throw Error('instagram_receipt_mismatch');
   return{media_id:body.id,permalink:body.permalink};
  },
 };
}
