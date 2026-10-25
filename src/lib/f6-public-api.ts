import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {handleF2Request,f2Headers} from './f2-api.ts';
import {handleSiteContentRequest} from './f4-content-api.ts';

const mediaSchema=z.object({path:z.string().regex(/^[a-f0-9-]{36}\/[a-f0-9-]{36}\.(png|webp)$/),sha256:z.string().regex(/^[a-f0-9]{64}$/),mime:z.enum(['image/png','image/webp']),bytes:z.number().int().min(1).max(2097152)}).strict();
type Media=z.infer<typeof mediaSchema>;
type Config={enabled:boolean;channelId:string;keyHash:string};
type Deps={config:Config;rpc:(name:'f6_public_read'|'f6_public_media',args:Record<string,unknown>)=>Promise<unknown>;bytes:(path:string)=>Promise<Uint8Array>;rateLimit:()=>boolean};
const internalToken='f6-server-public-channel';
const failure=(status:number)=>Response.json({code:'not_available',request_id:randomUUID()},{status,headers:f2Headers});

// This is a distinct read-only boundary. A server key selects an explicitly
// enabled channel; it does not impersonate a human or grant access to staging.
export async function handlePublicWebsiteRequest(request:Request,path:string[],deps:Deps){
 try{
  if(!deps.config.enabled)return failure(404);
  if(request.method!=='GET')return failure(405);
  if(!z.string().uuid().safeParse(deps.config.channelId).success||!/^[a-f0-9]{64}$/.test(deps.config.keyHash))return failure(503);
  if(!['news','events','pages','media'].includes(path[0])||path.length>2)return failure(404);
  if(new URL(request.url).searchParams.has('search'))return failure(400);
  if(!deps.rateLimit())return failure(429);
  const key=request.headers.get('X-BESC-Publication-Key')??'';
  const headers=new Headers(request.headers);headers.set('Authorization','Bearer '+internalToken);
  const internal=new Request(request.url,{method:'GET',headers});
  const config={enabled:true,siteId:deps.config.channelId,keyHash:deps.config.keyHash};
  const channel={p_channel_id:deps.config.channelId,p_server_key:key};
  const read=async(args:Record<string,unknown>,kind:string)=>deps.rpc('f6_public_read',{...channel,p_kind:kind,p_slug:args.p_slug,p_locale:args.p_locale,p_limit:args.p_limit,p_before_time:args.p_before_time,p_before_id:args.p_before_id});
  let firstMedia:Media|null=null;
  const media=async(id:string)=>{
   const raw=await deps.rpc('f6_public_media',{...channel,p_media_id:id});if(raw===null)return null;
   const parsed=mediaSchema.safeParse(raw);if(!parsed.success)throw Error('media_unavailable');
   if(firstMedia&&JSON.stringify(firstMedia)!==JSON.stringify(parsed.data))return null;
   firstMedia=parsed.data;return parsed.data;
  };
  if(path[0]==='pages')return await handleSiteContentRequest(internal,['publications','pages',...path.slice(1)],{config,verify:async(token)=>token===internalToken,rpc:async(_token,name,args)=>{
   if(name!=='f4_pages')throw Error('unsupported_public_operation');return read(args,'page');
  },bytes:deps.bytes});
  return await handleF2Request(internal,path,{config,verify:async(token)=>token===internalToken,rateLimit:()=>true,
   read:async(_token,args)=>read(args,String(args.p_type)),media:async(_token,id)=>media(id),bytes:deps.bytes});
 }catch{return failure(503);}
}
