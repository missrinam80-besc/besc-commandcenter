import {createHash,createHmac,randomUUID,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {creatorPublicationSchema,creatorOwnSchema,parseCreatorOperation} from './f4-contract.ts';
export const f4Headers={'Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Vary':'Authorization, X-BESC-Publication-Key'};
type Media={path:string;sha256:string;mime:string;bytes:number};
type Deps={config:{enabled:boolean;siteId:string;keyHash:string};verify:(token:string)=>Promise<boolean>;rpc:(token:string,name:string,args:Record<string,unknown>)=>Promise<unknown>;bytes:(path:string)=>Promise<Uint8Array>};
const uuid=z.string().uuid(),cursor=z.object({site:uuid,locale:z.enum(['nl-BE','fr-BE','en']),at:z.string().datetime({offset:true}),id:uuid,filters:z.string().max(500)}).strict();
class Denied extends Error{status:number;constructor(status:number){super('not_available');this.status=status;}}
function deny(status:number):never{throw new Denied(status);}
const equals=(a:Buffer,b:Buffer)=>a.length===b.length&&timingSafeEqual(a,b);
const ownOperations=new Set(['profile.save','profile.submit','consent.give','consent.withdraw','profile.withdraw']);
export async function handleCreatorRequest(request:Request,path:string[],deps:Deps){
 const id=randomUUID();
 try{
  const cfg=deps.config;if(!cfg.enabled)deny(404);if(!uuid.safeParse(cfg.siteId).success||!/^[a-f0-9]{64}$/.test(cfg.keyHash))deny(503);
  const key=request.headers.get('X-BESC-Publication-Key')??'';
  if(key.length<32||key.length>256||!equals(Buffer.from(cfg.keyHash,'hex'),createHash('sha256').update(key).digest()))deny(401);
  const match=/^Bearer ([A-Za-z0-9_.-]{1,16000})$/.exec(request.headers.get('Authorization')??'');if(!match||!await deps.verify(match[1]))deny(401);const token=match[1];
  const url=new URL(request.url);
  if(path[0]==='publications')path=path.slice(1);else if(['creators','media'].includes(path[0]??''))deny(404);
  if(path.length===1&&path[0]==='me'){
   if(request.method!=='GET'||url.search)deny(400);const parsed=creatorOwnSchema.safeParse(await deps.rpc(token,'f4_me',{p_site_id:cfg.siteId}));if(!parsed.success)deny(503);return Response.json(parsed.data,{headers:f4Headers});
  }
  if(path.length===1&&path[0]==='workflow'){
   if(request.method!=='POST'||url.search)deny(400);
   // The website validates same-origin requests before forwarding. Other user
   // clients still need their own session, site key and database authorization.
   if(request.headers.get('content-type')?.split(';')[0]!=='application/json')deny(400);
   const reader=request.body?.getReader();if(!reader)deny(400);let size=0;const chunks:Uint8Array[]=[];
   while(true){const x=await reader.read();if(x.done)break;size+=x.value.length;if(size>20000){await reader.cancel();deny(413);}chunks.push(x.value);}
   const raw:unknown=JSON.parse(Buffer.concat(chunks).toString('utf8'));const envelope=z.object({operation:z.string().max(50),data:z.unknown(),request_id:uuid}).strict().safeParse(raw);
   if(!envelope.success||!ownOperations.has(envelope.data.operation))deny(400);const e=envelope.data,parsed=parseCreatorOperation(e.operation,e.data);if(!parsed.success)deny(400);
   return Response.json(await deps.rpc(token,'f4_workflow',{p_site_id:cfg.siteId,p_operation:e.operation,p_data:parsed.data,p_request_id:e.request_id}),{headers:f4Headers});
  }
  if(request.method!=='GET')deny(400);
  if(path[0]==='media'){
   if(path.length!==2||url.search||!uuid.safeParse(path[1]).success)deny(400);
   const args={p_site_id:cfg.siteId,p_media_id:path[1],p_server_key:key};const m=await deps.rpc(token,'f4_media_locator',args) as Media|null;if(!m)deny(404);
   const bytes=await deps.bytes(m.path);if(bytes.length>2097152||bytes.length!==m.bytes||!['image/png','image/webp'].includes(m.mime)||createHash('sha256').update(bytes).digest('hex')!==m.sha256)deny(503);
   if(!await deps.rpc(token,'f4_media_locator',args))deny(404);
   return new Response(new Uint8Array(bytes),{headers:{...f4Headers,'Content-Type':m.mime,'Content-Length':String(bytes.length),'Content-Security-Policy':"default-src 'none'; sandbox"}});
  }
  if(path[0]!=='creators'||path.length>2)deny(404);const slug=path[1]??null;
  if(slug&&(slug.length>160||!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)))deny(400);
  const allowed=slug?['locale']:['locale','limit','cursor','platform','language','discipline','search'];for(const k of url.searchParams.keys())if(!allowed.includes(k)||url.searchParams.getAll(k).length!==1)deny(400);
  const locale=url.searchParams.get('locale')??'nl-BE';if(!['nl-BE','fr-BE','en'].includes(locale))deny(400);
  const rawLimit=url.searchParams.get('limit')??'20';if(!/^[1-9]\d?$/.test(rawLimit)||Number(rawLimit)>50)deny(400);const limit=slug?1:Number(rawLimit);
  const filters={platform:url.searchParams.get('platform')||null,language:url.searchParams.get('language')||null,discipline:url.searchParams.get('discipline')||null,search:url.searchParams.get('search')||null};
  if(filters.platform&&!['twitch','youtube','kick','tiktok'].includes(filters.platform)||(filters.language?.length??0)>30||(filters.discipline?.length??0)>60||(filters.search?.length??0)>80)deny(400);
  const filterKey=JSON.stringify(filters);let before:z.infer<typeof cursor>|null=null;
  const encoded=url.searchParams.get('cursor');if(encoded){if(encoded.length>2048||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(encoded))deny(400);const [body,mac]=encoded.split('.');if(!equals(Buffer.from(mac,'base64url'),createHmac('sha256',key).update(body).digest()))deny(400);const parsed=cursor.safeParse(JSON.parse(Buffer.from(body,'base64url').toString()));if(!parsed.success||parsed.data.site!==cfg.siteId||parsed.data.locale!==locale||parsed.data.filters!==filterKey)deny(400);before=parsed.data;}
  const result=await deps.rpc(token,'f4_creators',{p_site_id:cfg.siteId,p_slug:slug,p_locale:locale,p_limit:limit,p_before_time:before?.at??null,p_before_id:before?.id??null,p_platform:filters.platform,p_language:filters.language,p_discipline:filters.discipline,p_search:filters.search});
  const parsed=z.array(creatorPublicationSchema).max(limit).safeParse(result);if(!parsed.success||parsed.data.some(x=>x.locale!==locale||slug&&x.slug!==slug))deny(503);
  if(slug){if(!parsed.data.length)deny(404);return Response.json(parsed.data[0],{headers:f4Headers});}
  const last=parsed.data.at(-1);let next:string|null=null;if(last&&parsed.data.length===limit){const body=Buffer.from(JSON.stringify({site:cfg.siteId,locale,at:last.published_at,id:last.public_id,filters:filterKey})).toString('base64url');next=body+'.'+createHmac('sha256',key).update(body).digest('base64url');}
  return Response.json({schema_version:'besc-platform-publication-v1',items:parsed.data,next_cursor:next},{headers:f4Headers});
 }catch(e){const status=e instanceof Denied?e.status:e instanceof SyntaxError?400:typeof e==='object'&&e&&'status' in e&&[403,409,429].includes(Number(e.status))?Number(e.status):503;return Response.json({code:status===503?'unavailable':status===409?'conflict':status===429?'rate_limited':'not_available',request_id:id},{status,headers:f4Headers});}
}
