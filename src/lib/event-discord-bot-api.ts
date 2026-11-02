import { z } from 'zod';
import { authenticateBotClient, BotRateLimiter, type BotClient } from './bot-api.ts';
import { readCampaignJson } from './campaign-ingress.ts';
const uuid=z.string().uuid(),snow=z.string().regex(/^[1-9]\d{16,19}$/),worker=z.string().regex(/^[A-Za-z0-9_-]{8,40}$/);
const base={guild_id:snow,worker_id:worker},lease={...base,id:uuid,lease_token:uuid};
const schemas={claim:z.object(base).strict(),inspect:z.object(lease).strict(),dispatch:z.object(lease).strict(),complete:z.object({...lease,discord_event_id:snow.nullable()}).strict(),fail:z.object({...lease,error_code:z.enum(['invalid_job','not_dispatched','remote_missing','remote_terminal','outcome_unknown'])}).strict(),interest_targets:z.object({guild_id:snow}).strict(),interest_snapshot:z.object({guild_id:snow,publication_id:uuid,discord_event_id:snow,user_ids:z.array(snow).max(5000),observed_at:z.string().datetime({offset:true})}).strict()};
export const eventDiscordPayloadSchema=z.object({name:z.string().min(1).max(100),description:z.string().min(1).max(1000),scheduled_start_time:z.string().datetime({offset:true}),scheduled_end_time:z.string().datetime({offset:true}),privacy_level:z.literal(2),entity_type:z.literal(3),channel_id:z.null(),entity_metadata:z.object({location:z.string().min(1).max(100)}).strict()}).strict();
export const eventDiscordJobSchema=z.object({id:uuid,publication_id:uuid,event_id:uuid,guild_id:snow,revision:z.number().int().positive(),lease_token:uuid,lease_until:z.string().datetime({offset:true}),operation:z.enum(['upsert','withdraw','complete']),discord_event_id:snow.nullable(),payload:eventDiscordPayloadSchema.nullable()}).strict().refine(v=>v.operation==='upsert'?v.payload!==null:v.payload===null);
const limiter=new BotRateLimiter(240),headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
export type EventSyncStore={operation:(op:string,data:Record<string,unknown>)=>Promise<Record<string,unknown>>};
export async function handleEventSyncRequest(request:Request,deps:{enabled:boolean;clients:()=>BotClient[];store:()=>EventSyncStore;siteOrigin:string;now?:number}){
 const reply=(status:number,body:object)=>Response.json(body,{status,headers});
 if(!deps.enabled)return reply(404,{error:{code:'not_found'}});
 try{
  const url=new URL(request.url),match=/^\/api\/v1\/bot\/event-sync\/([a-z_]+)\/?$/.exec(url.pathname);
  if(request.method!=='POST')return reply(405,{error:{code:'method_not_allowed'}});
  if(!match||!Object.hasOwn(schemas,match[1])||url.search)return reply(400,{error:{code:'invalid_query'}});
  const op=match[1] as keyof typeof schemas,client=authenticateBotClient(request,deps.clients(),deps.now);
  if(!client)return reply(401,{error:{code:'invalid_client'}});
  if(!client.scopes.includes(op.startsWith('interest_')?'events:interest':'events:sync'))return reply(403,{error:{code:'insufficient_scope'}});
  if(!limiter.allow(client.id,deps.now??Date.now()))return reply(429,{error:{code:'rate_limited'}});
  const parsed=schemas[op].safeParse(await readCampaignJson(request,op==='interest_snapshot'?131072:8192));
  if(!parsed.success)return reply(400,{error:{code:'invalid_fields'}});
  if(parsed.data.guild_id!==client.guildId)return reply(403,{error:{code:'guild_not_allowed'}});
  const origin=new URL(deps.siteOrigin);if(origin.protocol!=='https:'||origin.username||origin.password||origin.search||origin.hash||origin.pathname!=='/'||origin.origin.length>200)throw Error('invalid_origin');
  const data={...parsed.data,organization_id:client.organizationId,client_id:client.id,worker:'worker_id'in parsed.data?client.id+':'+parsed.data.worker_id:client.id,site_origin:origin.origin};
  const result=await deps.store().operation(op,data);
  if(op==='claim'||op==='inspect'){
   if(result.job===null)return reply(200,{job:null});
   const job=eventDiscordJobSchema.parse(result.job);if(job.guild_id!==client.guildId)throw Error('invalid_response');return reply(200,{job});
  }
  if(op==='dispatch'){if(typeof result.authorized!=='boolean')throw Error('invalid_response');return reply(200,{authorized:result.authorized});}
  if(op==='interest_targets'){const targets=z.array(z.object({publication_id:uuid,discord_event_id:snow}).strict()).max(100).parse(result.targets);return reply(200,{targets});}
  if(result.ok!==true)throw Error('invalid_response');return reply(200,{ok:true});
 }catch(e){
  const code=e instanceof Error?e.message:'';const known=['json_required','invalid_body','body_too_large','body_timeout'];
  return reply(known.includes(code)?400:503,{error:{code:known.includes(code)?code:'event_sync_unavailable'}});
 }
}
