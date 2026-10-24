import {createHash,createHmac,randomUUID,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {vacancyPublicationSchema} from './vacancy-contract.ts';
import {f4Headers} from './f4-api.ts';
type Deps={config:{enabled:boolean;siteId:string;keyHash:string};verify:(token:string)=>Promise<boolean>;rpc:(token:string,name:string,args:Record<string,unknown>)=>Promise<unknown>};
class Denied extends Error{status:number;constructor(status:number){super('not_available');this.status=status;}}
const uuid=z.string().uuid(),cursor=z.object({kind:z.literal('vacancy'),site:uuid,locale:z.enum(['nl-BE','fr-BE','en']),at:z.string().datetime({offset:true}),id:uuid,filters:z.string().max(300)}).strict();
const eq=(a:Buffer,b:Buffer)=>a.length===b.length&&timingSafeEqual(a,b);
export async function handleVacancyRequest(request:Request,path:string[],deps:Deps){
 try{
  const c=deps.config;if(!c.enabled)throw new Denied(404);if(!uuid.safeParse(c.siteId).success||!/^[a-f0-9]{64}$/.test(c.keyHash))throw new Denied(503);
  const key=request.headers.get('X-BESC-Publication-Key')??'';if(key.length<32||key.length>256||!eq(Buffer.from(c.keyHash,'hex'),createHash('sha256').update(key).digest()))throw new Denied(401);
  const token=/^Bearer ([A-Za-z0-9_.-]{1,16000})$/.exec(request.headers.get('Authorization')??'')?.[1];if(!token||!await deps.verify(token))throw new Denied(401);
  if(request.method!=='GET'||path[0]!=='publications'||path[1]!=='vacancies')throw new Denied(404);const url=new URL(request.url);
  if(path.length>3)throw new Denied(404);const slug=path[2]??null;if(slug&&(slug.length>160||!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)))throw new Denied(400);
  const allowed=slug?['locale']:['locale','limit','cursor','search'];for(const k of url.searchParams.keys())if(!allowed.includes(k)||url.searchParams.getAll(k).length!==1)throw new Denied(400);
  const locale=url.searchParams.get('locale')??'nl-BE',rawLimit=url.searchParams.get('limit')??'20';if(!['nl-BE','fr-BE','en'].includes(locale)||!/^[1-9]\d?$/.test(rawLimit)||Number(rawLimit)>50)throw new Denied(400);const limit=slug?1:Number(rawLimit);
  const search=url.searchParams.get('search')||null;if((search?.length??0)>80)throw new Denied(400);
  const filterKey=JSON.stringify({search});let before:z.infer<typeof cursor>|null=null;const encoded=url.searchParams.get('cursor');
  if(encoded){if(encoded.length>2048||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(encoded))throw new Denied(400);const [body,mac]=encoded.split('.');if(!eq(Buffer.from(mac,'base64url'),createHmac('sha256',key).update(body).digest()))throw new Denied(400);const v=cursor.safeParse(JSON.parse(Buffer.from(body,'base64url').toString()));if(!v.success||v.data.site!==c.siteId||v.data.locale!==locale||v.data.filters!==filterKey)throw new Denied(400);before=v.data;}
  const result=await deps.rpc(token,'f4_vacancies',{p_site_id:c.siteId,p_slug:slug,p_locale:locale,p_limit:limit,p_before_time:before?.at??null,p_before_id:before?.id??null,p_search:search});
  const v=z.array(vacancyPublicationSchema).max(limit).safeParse(result);if(!v.success||v.data.some(x=>x.locale!==locale||slug&&x.slug!==slug))throw new Denied(503);
  if(slug){if(!v.data.length)throw new Denied(404);return Response.json(v.data[0],{headers:f4Headers});}
  const last=v.data.at(-1);let next:string|null=null;if(last&&v.data.length===limit){const body=Buffer.from(JSON.stringify({kind:'vacancy',site:c.siteId,locale,at:last.published_at,id:last.public_id,filters:filterKey})).toString('base64url');next=body+'.'+createHmac('sha256',key).update(body).digest('base64url');}
  return Response.json({schema_version:'besc-platform-publication-v1',items:v.data,next_cursor:next},{headers:f4Headers});
 }catch(e){const status=e instanceof Denied?e.status:e instanceof SyntaxError?400:typeof e==='object'&&e&&'status'in e&&[403,409,429].includes(Number(e.status))?Number(e.status):503;return Response.json({code:'not_available',request_id:randomUUID()},{status,headers:f4Headers});}
}
