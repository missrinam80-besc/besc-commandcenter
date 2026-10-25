import {randomUUID} from 'node:crypto';
import {createAdminClient} from '@/lib/supabase/admin';
import {withBotUpstream} from '@/lib/bot-api-upstream';
import {handlePublicWebsiteRequest} from '@/lib/f6-public-api';
import {f2Headers} from '@/lib/f2-api';
export const runtime='nodejs';export const dynamic='force-dynamic';
let windowAt=0,count=0;
export async function GET(request:Request,{params}:{params:Promise<{path:string[]}>}){
 if(process.env.BESC_PUBLIC_WEBSITE_READ_ENABLED!=='true')return Response.json({code:'not_available'},{status:404,headers:f2Headers});
 try{return await withBotUpstream(async fetcher=>{
  const db=createAdminClient(fetcher);
  return handlePublicWebsiteRequest(request,(await params).path,{
   config:{enabled:true,channelId:process.env.BESC_PUBLIC_WEBSITE_CHANNEL_ID??'',keyHash:process.env.BESC_PUBLIC_WEBSITE_KEY_SHA256??''},
   rateLimit(){const now=Date.now();if(now-windowAt>=60000){windowAt=now;count=0;}return ++count<=300;},
   async rpc(name,args){const r=await db.rpc(name,args);if(r.error){if(r.error.code==='42501')throw Error('not_available');throw Error('public_read_unavailable');}return r.data;},
   async bytes(path){const r=await db.storage.from('website-staging-media').download(path);if(r.error||!r.data||r.data.size>2097152)throw Error('media_unavailable');return new Uint8Array(await r.data.arrayBuffer());}
  });
 },{signal:request.signal});}catch{return Response.json({code:'not_available',request_id:randomUUID()},{status:503,headers:f2Headers});}
}
