import {createHash,randomUUID,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {intakeOwnSchema,intakeDetailSchema,parseIntakeOperation} from './f4-intake-contract.ts';
import {f4Headers} from './f4-api.ts';
type Deps={config:{enabled:boolean;siteId:string;keyHash:string;vacancyEnabled?:boolean};verify:(token:string)=>Promise<boolean>;rpc:(token:string,name:string,args:Record<string,unknown>)=>Promise<unknown>};
class Denied extends Error{status:number;constructor(status:number){super('not_available');this.status=status;}}
const uuid=z.string().uuid(),own=new Set(['application.submit','application.withdraw','application.reply']);
export async function handleIntakeRequest(request:Request,path:string[],deps:Deps){
 try{
  if(!deps.config.enabled)throw new Denied(404);const c=deps.config;
  if(!uuid.safeParse(c.siteId).success||!/^[a-f0-9]{64}$/.test(c.keyHash))throw new Denied(503);
  const key=request.headers.get('X-BESC-Publication-Key')??'';if(key.length<32||key.length>256||!timingSafeEqual(createHash('sha256').update(key).digest(),Buffer.from(c.keyHash,'hex')))throw new Denied(401);
  const token=/^Bearer ([A-Za-z0-9_.-]{1,16000})$/.exec(request.headers.get('Authorization')??'')?.[1];if(!token||!await deps.verify(token))throw new Denied(401);
  if(new URL(request.url).search)throw new Denied(400);
  if(request.method==='GET'){
   if(path.length===0){const data=intakeOwnSchema.safeParse(await deps.rpc(token,'f4_intake_me',{p_site_id:c.siteId}));if(!data.success)throw new Denied(503);return Response.json(data.data,{headers:f4Headers});}
   if(path.length!==2||path[0]!=='applications'||!uuid.safeParse(path[1]).success)throw new Denied(404);
   const data=intakeDetailSchema.safeParse(await deps.rpc(token,'f4_intake_application',{p_site_id:c.siteId,p_id:path[1]}));if(!data.success||data.data.id!==path[1])throw new Denied(503);return Response.json(data.data,{headers:f4Headers});
  }
  if(request.method!=='POST'||path.length!==1||path[0]!=='workflow'||request.headers.get('content-type')?.split(';')[0]!=='application/json')throw new Denied(400);
  const reader=request.body?.getReader();if(!reader)throw new Denied(400);const chunks:Uint8Array[]=[];let size=0;
  const signal=AbortSignal.any([request.signal,AbortSignal.timeout(4500)]),stop=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',stop,{once:true});
  try{if(signal.aborted)throw Error('cancelled');while(true){const r=await reader.read();if(signal.aborted)throw Error('cancelled');if(r.done)break;size+=r.value.length;if(size>12000){stop();throw new Denied(413);}chunks.push(r.value);}}finally{signal.removeEventListener('abort',stop);reader.releaseLock();}
  const envelope=z.object({operation:z.string().max(50),data:z.unknown(),request_id:uuid}).strict().safeParse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  if(!envelope.success||!own.has(envelope.data.operation))throw new Denied(400);const e=envelope.data,data=parseIntakeOperation(e.operation,e.data);if(!data.success)throw new Denied(400);if(e.operation==='application.submit'&&'payload'in data.data&&'vacancy_public_id'in data.data.payload&&!c.vacancyEnabled)throw new Denied(404);
  const result=z.object({id:uuid}).strict().safeParse(await deps.rpc(token,'f4_intake_workflow',{p_site_id:c.siteId,p_operation:e.operation,p_data:data.data,p_request_id:e.request_id}));if(!result.success||('id'in data.data&&result.data.id!==data.data.id))throw new Denied(503);return Response.json(result.data,{headers:f4Headers});
 }catch(e){const status=e instanceof Denied?e.status:e instanceof SyntaxError?400:typeof e==='object'&&e&&'status'in e&&[403,409,429].includes(Number(e.status))?Number(e.status):503;return Response.json({code:status===409?'conflict':status===429?'rate_limited':'not_available',request_id:randomUUID()},{status,headers:f4Headers});}
}
