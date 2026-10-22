import {createHash,createHmac,randomUUID,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {f2PublicationSchema} from './f2-contract.ts';
export const f2Headers={'Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Vary':'Authorization, X-BESC-Publication-Key'};
type Config={enabled:boolean;siteId:string;keyHash:string};
type Media={path:string;sha256:string;mime:'image/png'|'image/webp';bytes:number};
type Deps={config:Config;verify:(token:string)=>Promise<boolean>;read:(token:string,args:Record<string,unknown>)=>Promise<unknown>;media:(token:string,id:string,key:string)=>Promise<Media|null>;bytes:(path:string)=>Promise<Uint8Array>;rateLimit:()=>boolean};
const uuid=z.string().uuid(),cursorSchema=z.object({site:uuid,type:z.enum(['news','event']),locale:z.enum(['nl-BE','fr-BE','en']),time:z.string().datetime({offset:true}),id:uuid}).strict();
export class Failure extends Error{status:number;code:string;constructor(status:number,code:string){super(code);this.status=status;this.code=code;}}
const fail=(s:number,c:string):never=>{throw new Failure(s,c);};
const equal=(a:Buffer,b:Buffer)=>a.length===b.length&&timingSafeEqual(a,b);
function cursorEncode(value:z.infer<typeof cursorSchema>,key:string){const p=Buffer.from(JSON.stringify(value)).toString('base64url');return p+'.'+createHmac('sha256',key).update(p).digest('base64url');}
function cursorDecode(value:string,key:string,scope:{site:string;type:string;locale:string}){
 if(value.length>2048||!/^[A-Za-z0-9_-]+[.][A-Za-z0-9_-]+$/.test(value))return fail(400,'bad_request');const [p,mac]=value.split('.');
 if(!equal(Buffer.from(mac,'base64url'),createHmac('sha256',key).update(p).digest()))return fail(400,'bad_request');
 let data:unknown;try{data=JSON.parse(Buffer.from(p,'base64url').toString());}catch{return fail(400,'bad_request');}
 const r=cursorSchema.safeParse(data);if(!r.success||r.data.site!==scope.site||r.data.type!==scope.type||r.data.locale!==scope.locale)return fail(400,'bad_request');return r.data;
}
export async function handleF2Request(request:Request,path:string[],deps:Deps){
 const requestId=randomUUID();
 try{
  if(!deps.config.enabled)return fail(404,'not_found');
  if(!uuid.safeParse(deps.config.siteId).success||!/^[a-f0-9]{64}$/.test(deps.config.keyHash))return fail(503,'unavailable');
  if(request.method!=='GET')return fail(400,'bad_request');
  const key=request.headers.get('X-BESC-Publication-Key')??'';
  if(key.length<32||key.length>256||!equal(Buffer.from(deps.config.keyHash,'hex'),createHash('sha256').update(key).digest()))return fail(401,'unauthenticated');
  if(!deps.rateLimit())return fail(429,'rate_limited');
  const match=/^Bearer ([A-Za-z0-9_.-]+)$/.exec(request.headers.get('Authorization')??'');if(!match||match[1].length>16000)return fail(401,'unauthenticated');
  const token=match[1];if(!await deps.verify(token))return fail(401,'unauthenticated');
  const url=new URL(request.url);
  if(path[0]==='media'){
   if(path.length!==2||!uuid.safeParse(path[1]).success||url.search)return fail(400,'bad_request');
   const a=await deps.media(token,path[1],key);if(!a)return fail(404,'not_found');
   const bytes=await deps.bytes(a.path);if(bytes.length!==a.bytes||bytes.length>2097152||createHash('sha256').update(bytes).digest('hex')!==a.sha256)return fail(503,'unavailable');
   // Download before response, then recheck rights; no unbounded streaming lease.
   if(!await deps.media(token,path[1],key))return fail(404,'not_found');
   return new Response(new Uint8Array(bytes),{headers:{...f2Headers,'Content-Type':a.mime,'Content-Length':String(bytes.length),'Content-Security-Policy':"default-src 'none'; sandbox"}});
  }
  if(!['news','events'].includes(path[0])||path.length>2||path.length===0)return fail(404,'not_found');
  const type=path[0]==='events'?'event':'news',slug=path[1]??null;
  if(slug&&!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)||slug&&slug.length>160)return fail(400,'bad_request');
  const allowed=new Set(slug?['locale']:['locale','limit','cursor']);for(const k of url.searchParams.keys())if(!allowed.has(k)||url.searchParams.getAll(k).length!==1)return fail(400,'bad_request');
  const locale=url.searchParams.get('locale')??'nl-BE';if(!['nl-BE','fr-BE','en'].includes(locale))return fail(400,'bad_request');
  const raw=url.searchParams.get('limit')??'20';if(!/^[1-9]\d?$/.test(raw)||Number(raw)>50)return fail(400,'bad_request');const limit=slug?1:Number(raw);
  const cur=url.searchParams.has('cursor')?cursorDecode(url.searchParams.get('cursor')!,key,{site:deps.config.siteId,type,locale}):null;
  const result=await deps.read(token,{p_site_id:deps.config.siteId,p_type:type,p_slug:slug,p_locale:locale,p_limit:limit,p_before_time:cur?.time??null,p_before_id:cur?.id??null});
  const parsed=z.array(f2PublicationSchema).max(limit).safeParse(result);if(!parsed.success||parsed.data.some(x=>x.type!==type||x.locale!==locale||slug&&x.slug!==slug))return fail(503,'unavailable');
  if(slug){if(!parsed.data.length)return fail(404,'not_found');return Response.json(parsed.data[0],{headers:f2Headers});}
  const items=parsed.data,last=items.at(-1),next=items.length===limit&&last?cursorEncode({site:deps.config.siteId,type,locale:locale as 'nl-BE'|'fr-BE'|'en',time:last.published_at,id:last.public_id},key):null;
  return Response.json({schema_version:'besc-website-publication-v1',items,next_cursor:next},{headers:f2Headers});
 }catch(error){const e=error instanceof Failure?error:new Failure(503,'unavailable');return Response.json({code:e.code,request_id:requestId},{status:e.status,headers:f2Headers});}
}
