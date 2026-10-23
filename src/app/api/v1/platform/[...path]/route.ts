import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';
import {createAdminClient} from '@/lib/supabase/admin';
import {getSupabaseServerUrl} from '@/lib/supabase/url';
import {handleCreatorRequest,f4Headers} from '@/lib/f4-api';
import {withBotUpstream} from '@/lib/bot-api-upstream';
export const runtime='nodejs';export const dynamic='force-dynamic';
async function handle(request:Request,{params}:{params:Promise<{path:string[]}>}){
 try{return await withBotUpstream(async fetcher=>{
  const clients=new Map<string,SupabaseClient>();
  const client=(token:string)=>{let c=clients.get(token);if(!c){c=createClient(getSupabaseServerUrl(),process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{global:{fetch:fetcher,headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false}});clients.set(token,c);}return c;};
  return await handleCreatorRequest(request,(await params).path,{config:{enabled:process.env.BESC_CREATOR_PLATFORM_ENABLED==='true',siteId:process.env.BESC_PUBLICATION_SITE_ID??'',keyHash:process.env.BESC_PUBLICATION_KEY_SHA256??''},
   async verify(token){const r=await client(token).auth.getUser(token);return Boolean(!r.error&&r.data.user&&!r.data.user.is_anonymous);},
   async rpc(token,name,args){const r=await client(token).rpc(name,args);if(r.error){if(r.error.code==='42501')throw Object.assign(new Error('not_available'),{status:403});if(/rate_limited/.test(r.error.message))throw Object.assign(new Error('rate_limited'),{status:429});if(r.error.code==='40001'||r.error.code==='23505')throw Object.assign(new Error('conflict'),{status:409});throw new Error('platform_unavailable');}return r.data;},
   async bytes(path){const r=await createAdminClient(fetcher).storage.from('website-staging-media').download(path);if(r.error||!r.data||r.data.size>2097152)throw Error('media_unavailable');return new Uint8Array(await r.data.arrayBuffer());}
  });
 },{signal:request.signal});}catch{return Response.json({code:'unavailable',request_id:randomUUID()},{status:503,headers:f4Headers});}
}
export const GET=handle;export const POST=handle;
