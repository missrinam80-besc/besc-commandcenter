import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';
import {createAdminClient} from '@/lib/supabase/admin';
import {getSupabaseServerUrl} from '@/lib/supabase/url';
import {handleF2Request,f2Headers,Failure} from '@/lib/f2-api';
import {withBotUpstream} from '@/lib/bot-api-upstream';
export const runtime='nodejs';export const dynamic='force-dynamic';
let windowAt=0,count=0;
export async function GET(request:Request,{params}:{params:Promise<{path:string[]}>}){
 try{return await withBotUpstream(async fetcher=>{
  const config={enabled:process.env.BESC_PUBLICATION_STAGING_ENABLED==='true',siteId:process.env.BESC_PUBLICATION_SITE_ID??'',keyHash:process.env.BESC_PUBLICATION_KEY_SHA256??''};
  const clients=new Map<string,SupabaseClient>();
  const viewer=(token:string)=>{let c=clients.get(token);if(!c){c=createClient(getSupabaseServerUrl(),process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{global:{fetch:fetcher,headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false}});clients.set(token,c);}return c;};
  const rpc=async(token:string,name:string,args:Record<string,unknown>)=>{const r=await viewer(token).rpc(name,args);if(r.error){if(r.error.code==='42501')throw new Failure(403,'forbidden');throw Error('publication_unavailable');}return r.data;};
  return await handleF2Request(request,(await params).path,{
   config,rateLimit(){const now=Date.now();if(now-windowAt>=60000){windowAt=now;count=0;}return ++count<=300;},
   async verify(token){const r=await viewer(token).auth.getUser(token);return Boolean(!r.error&&r.data.user&&!r.data.user.is_anonymous);},
   async read(token,args){return await rpc(token,'f2_publications',args);},
   async media(token,id,key){return await rpc(token,'f2_media_locator',{p_site_id:config.siteId,p_media_id:id,p_server_key:key});},
   async bytes(path){const r=await createAdminClient(fetcher).storage.from('website-staging-media').download(path);if(r.error||!r.data||r.data.size>2097152)throw Error('publication_media_unavailable');return new Uint8Array(await r.data.arrayBuffer());}
  });
 },{signal:request.signal});}catch{return Response.json({code:'unavailable',request_id:randomUUID()},{status:503,headers:f2Headers});}
}
