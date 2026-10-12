import {createHash,randomUUID} from "node:crypto";
import {z} from "zod";
import {authenticateBotClient,BotRateLimiter,type BotClient,type BotScope,type BotStore} from "./bot-api.ts";
import {snowflakeSchema as snow} from "./discord-ticket-config.ts";
import type {TicketStore} from "./ticket-api.ts";
const uid=z.string().uuid(),worker=z.string().regex(/^[a-zA-Z0-9_-]{8,64}$/);
const features=z.array(z.enum(["typed_intake","ticket_panels","label_modals"])).max(3).refine(v=>new Set(v).size===v.length);
const common={guild_id:snow};
const intent=z.discriminatedUnion("source",[
 z.object({...common,discord_user_id:snow,type_revision_id:uid,source:z.literal("slash")}).strict(),
 z.object({...common,discord_user_id:snow,type_revision_id:uid,source:z.literal("panel"),panel_id:uid,panel_revision_id:uid,message_id:snow,channel_id:snow}).strict()]);
const missing=z.array(z.enum(["view_channel","send_messages","create_private_threads","send_messages_in_threads","read_message_history","manage_threads","embed_links"])).max(7);
const schemas:Record<string,z.ZodType>={intent,intake:z.object({...common,discord_user_id:snow,type_revision_id:uid,intake_intent_id:uid,answers:z.record(z.string().max(40),z.union([z.string().max(4000),z.array(z.string().max(40)).max(25)]))}).strict(),
 report:z.object({...common,application_id:snow,installed:z.literal(true),runtime_version:z.string().regex(/^[a-zA-Z0-9._-]{1,40}$/),features,channels:z.array(z.object({id:snow,name:z.string().min(1).max(100),type:z.literal(0)}).strict()).max(50)}).strict(),
 claim:z.object({...common,worker_id:worker}).strict(),
 fail:z.object({...common,worker_id:worker,lease_token:uid,error_code:z.enum(["discord_unavailable","permission_denied","message_missing","duplicate_marker","outcome_unknown","server_admin_denied"]),uncertain:z.boolean()}).strict(),
 complete:z.discriminatedUnion("kind",[
 z.object({...common,worker_id:worker,lease_token:uid,application_id:snow,payload_hash:z.string().regex(/^[a-f0-9]{64}$/),kind:z.literal("verify_server_admin"),discord_user_id:snow,is_admin:z.boolean()}).strict(),
 z.object({...common,worker_id:worker,lease_token:uid,application_id:snow,payload_hash:z.string().regex(/^[a-f0-9]{64}$/),kind:z.literal("check_channel"),channel_id:snow,channel_type:z.literal(0),permissions_ok:z.boolean(),missing_permissions:missing}).strict().refine(v=>!v.permissions_ok||v.missing_permissions.length===0),
 z.object({...common,worker_id:worker,lease_token:uid,application_id:snow,payload_hash:z.string().regex(/^[a-f0-9]{64}$/),kind:z.literal("publish_panel"),channel_id:snow,message_id:snow.optional(),message_absent:z.literal(true).optional(),skipped:z.literal(true).optional(),bot_author_id:snow,revision_id:uid}).strict().refine(v=>v.skipped===true?v.message_absent!==true:(v.message_absent===true)!==Boolean(v.message_id)),
 z.object({...common,worker_id:worker,lease_token:uid,application_id:snow,payload_hash:z.string().regex(/^[a-f0-9]{64}$/),kind:z.literal("disable_panel"),channel_id:snow,message_id:snow,bot_author_id:snow,disabled:z.literal(true)}).strict()])};
const errors:Record<string,number>={invalid_answers:400,server_unavailable:404,revision_unavailable:410,intent_unavailable:404,intent_expired:410,intent_consumed:409,idempotency_conflict:409,intake_unavailable:409,linked_account_required:403,source_not_allowed:403,lease_conflict:409,delivery_unavailable:404,invalid_delivery_result:400,invalid_config:400,rate_limited:429,interaction_expired:410,ticket_expired:410};
class Failure extends Error{status:number;code:string;constructor(status:number,code:string){super(code);this.status=status;this.code=code;}}
const limiter=new BotRateLimiter(120);
async function readBody(request:Request){
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type")??""))throw new Failure(415,"json_required");
 if(Number(request.headers.get("content-length"))>131072)throw new Failure(413,"body_too_large");
 const reader=request.body?.getReader();if(!reader)throw new Failure(400,"invalid_body");let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([(async()=>{let size=0;const chunks:Uint8Array[]=[];while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>131072)throw new Failure(413,"body_too_large");chunks.push(chunk.value);}try{return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown}catch{throw new Failure(400,"invalid_body")}})(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Failure(408,"body_timeout")),3000)})]);}finally{clearTimeout(timer);void reader.cancel().catch(()=>{})}
}
export async function handleDiscordConfigRequest(request:Request,deps:{clients:BotClient[];store:TicketStore;identity:Pick<BotStore,"findAccount"|"findMembership">;now?:number;limiter?:BotRateLimiter}){
 const requestId=randomUUID();const reply=(status:number,data:object)=>Response.json(data,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","X-Request-Id":requestId}});
 try{
 const client=authenticateBotClient(request,deps.clients,deps.now);if(!client)throw new Failure(401,"invalid_client");if(!(deps.limiter??limiter).allow(client.id,deps.now??Date.now()))throw new Failure(429,"rate_limited");
 const url=new URL(request.url),path=url.pathname.replace(/^\/api\/v1\/bot\//,"").replace(/\/$/,"");let op:string,scope:BotScope,id:string|undefined;
 if(path==="ticket-config"){op="config";scope="bot-config:read";}else if(/^ticket-config\/revisions\/[^/]+$/.test(path)){op="revision";scope="bot-config:read";id=path.split("/")[2];}else if(path==="bot-runtime/report"){op="report";scope="bot-config:report";}else if(path==="bot-config-deliveries/claim"){op="claim";scope="bot-config:deliver";}else if(/^bot-config-deliveries\/[^/]+$/.test(path)){op="inspect";scope="bot-config:deliver";id=path.split("/")[1];}else if(/^bot-config-deliveries\/[^/]+\/(complete|fail)$/.test(path)){op=path.split("/")[2];scope="bot-config:deliver";id=path.split("/")[1];}else if(path==="ticket-intents"){op="intent";scope="tickets:create";}else if(path==="tickets/intake"){op="intake";scope="tickets:create";}else throw new Failure(404,"not_found");
 if(!client.scopes.includes(scope))throw new Failure(403,"insufficient_scope");if(request.method!==(["config","revision","inspect"].includes(op)?"GET":"POST"))throw new Failure(405,"method_not_allowed");if(id&&!uid.safeParse(id).success)throw new Failure(400,"invalid_id");
 let data:Record<string,unknown>;
 if(op==="inspect"){const parsed=z.object({guild_id:snow,worker_id:worker,lease_token:uid}).strict().safeParse(Object.fromEntries(url.searchParams));if(!parsed.success||[...url.searchParams.keys()].some(k=>url.searchParams.getAll(k).length!==1))throw new Failure(400,"invalid_query");data=parsed.data;}else if(["config","revision"].includes(op)){if(url.searchParams.size!==1||url.searchParams.getAll("guild_id").length!==1)throw new Failure(400,"invalid_query");data={guild_id:url.searchParams.get("guild_id")};}else{if(url.searchParams.size)throw new Failure(400,"invalid_query");const parsed=schemas[op].safeParse(await readBody(request));if(!parsed.success)throw new Failure(400,"invalid_fields");data=parsed.data as Record<string,unknown>;}
 if(data.guild_id!==client.guildId)throw new Failure(403,"guild_not_allowed");
 if(["intent","intake"].includes(op)){
 const key=request.headers.get("idempotency-key")??"";if(!snow.safeParse(key).success)throw new Failure(400,"invalid_idempotency_key");
 data.request_hash=createHash("sha256").update(canonical(data)).digest("hex");data.idempotency_key=key;
 const account=await deps.identity.findAccount(String(data.discord_user_id));
 if(account&&account.verifiedDiscordId===data.discord_user_id&&!account.banned){const member=await deps.identity.findMembership(account.userId,client.organizationId);if(member?.status==="active"&&member.organization_id===client.organizationId)data.verified_user_id=account.userId;}
 }
 if(id)data[op==="revision"?"revision_id":"delivery_id"]=id;
 const result=await deps.store.operation(client.organizationId,client.id,client.guildId,op,data);
 if(typeof result.error==="string")throw new Failure(errors[result.error]??503,Object.hasOwn(errors,result.error)?result.error:"upstream_unavailable");
 if(Buffer.byteLength(JSON.stringify(result))>2*1024*1024)throw new Failure(503,"configuration_too_large");return reply(["intent","intake"].includes(op)?201:200,result);
 }catch(e){const f=e instanceof Failure?e:new Failure(503,"upstream_unavailable");return reply(f.status,{error:{code:f.code,requestId}})}
}
export function canonical(value:unknown):string{if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';return JSON.stringify(value);}
