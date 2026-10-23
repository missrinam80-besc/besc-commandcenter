import {withBotUpstream} from '@/lib/bot-api-upstream';
import {createHash} from 'node:crypto';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Content-Security-Policy':"default-src 'none'; sandbox"};
export async function GET(request:Request,{params}:{params:Promise<{revision:string;media:string}>}){
 if(process.env.BESC_PARTNER_PLATFORM_ENABLED!=='true'||new URL(request.url).search)return new Response(null,{status:404,headers});
 const {revision,media}=await params;
 if(![revision,media,process.env.BESC_PUBLICATION_SITE_ID??''].every(v=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v)))return new Response(null,{status:404,headers});
 try{return await withBotUpstream(async fetcher=>{
 const db=await createClient(fetcher);const {data:{user}}=await db.auth.getUser();if(!user)return new Response(null,{status:401,headers});
 const args={p_site_id:process.env.BESC_PUBLICATION_SITE_ID,p_revision_id:revision,p_media_id:media};
 try{const r=await db.rpc('f4_partner_review_media',args);if(r.error||r.data!==true)return new Response(null,{status:403,headers});const admin=createAdminClient(fetcher);const locator=await admin.rpc('f4_partner_preview_locator',args);if(locator.error||!locator.data)return new Response(null,{status:403,headers});const m=locator.data as {path:string;mime:string;sha256:string;bytes:number};const image=await admin.storage.from('website-staging-media').download(m.path);
  if(image.error||!image.data||image.data.size>2097152)return new Response(null,{status:503,headers});const bytes=new Uint8Array(await image.data.arrayBuffer());
  if(bytes.length!==m.bytes||!['image/png','image/webp'].includes(m.mime)||createHash('sha256').update(bytes).digest('hex')!==m.sha256)return new Response(null,{status:503,headers});
  const after=await db.rpc('f4_partner_review_media',args);if(after.error||after.data!==true)return new Response(null,{status:403,headers});return new Response(bytes,{headers:{...headers,'Content-Type':m.mime}});
 }catch{return new Response(null,{status:503,headers});}
 },{signal:request.signal});}catch{return new Response(null,{status:503,headers});}
}
