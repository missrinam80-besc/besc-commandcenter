import {z} from "zod";
import {authenticateBotClient,BotRateLimiter,type BotClient,type BotStore} from "./bot-api.ts";
const uuid=z.string().uuid(),snow=z.string().regex(/^[1-9]\d{16,19}$/),worker=z.string().regex(/^[A-Za-z0-9_-]{8,40}$/);
const common={guild_id:snow,worker_id:worker};
const schemas={claim:z.object(common).strict(),dispatch:z.object({...common,id:uuid,lease_token:uuid}).strict(),sent:z.object({...common,id:uuid,lease_token:uuid,message_id:snow}).strict(),fail:z.object({...common,id:uuid,lease_token:uuid,error_code:z.enum(["dm_closed","discord_unavailable","outcome_unknown"])}).strict()};
const limiter=new BotRateLimiter(60);
class Failure extends Error{status:number;code:string;constructor(status:number,code:string){super(code);this.status=status;this.code=code;}}
async function boundedBody(request:Request){
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type")??""))throw new Failure(415,"json_required");
 if(Number(request.headers.get("content-length"))>8192)throw new Failure(413,"body_too_large");const reader=request.body?.getReader();if(!reader)throw new Failure(400,"invalid_body");let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([(async()=>{const chunks:Uint8Array[]=[];let size=0;while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>8192)throw new Failure(413,"body_too_large");chunks.push(part.value);}try{return JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{throw new Failure(400,"invalid_body");}})(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Failure(408,"body_timeout")),3000);})]);}finally{clearTimeout(timer);void reader.cancel().catch(()=>{});}
}
export type SlotBotStore={operation:(op:string,data:Record<string,unknown>)=>Promise<Record<string,unknown>>};
export async function handleSlotBotRequest(request:Request,deps:{clients:BotClient[];identity:Pick<BotStore,"findAccount">;store:SlotBotStore;now?:number}){
 const headers={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
 try{const client=authenticateBotClient(request,deps.clients,deps.now);if(!client)throw new Failure(401,"invalid_client");if(!client.scopes.includes("slots:deliver"))throw new Failure(403,"insufficient_scope");if(!limiter.allow(client.id,deps.now??Date.now()))throw new Failure(429,"rate_limited");
 const url=new URL(request.url),match=/^\/api\/v1\/bot\/slot-messages\/(claim|dispatch|sent|fail)\/?$/.exec(url.pathname);if(!match)throw new Failure(404,"not_found");const op=match[1] as keyof typeof schemas;if(request.method!=="POST")throw new Failure(405,"method_not_allowed");if(url.search)throw new Failure(400,"invalid_query");const body=schemas[op].safeParse(await boundedBody(request));if(!body.success)throw new Failure(400,"invalid_fields");if(body.data.guild_id!==client.guildId)throw new Failure(403,"guild_not_allowed");
 const data={...body.data,worker:`${client.id}:${body.data.worker_id}`,organization_id:client.organizationId,channel:"discord"};
 async function validRecipient(m:Record<string,unknown>){if(typeof m.recipient!=="string"||typeof m.account_user_id!=="string")return false;const account=await deps.identity.findAccount(m.recipient);return Boolean(account&&!account.banned&&account.userId===m.account_user_id&&account.verifiedDiscordId===m.recipient);}
 if(op==="claim"){
  const message=await deps.store.operation("claim",data);if(!message.id)return Response.json({delivery:null},{headers});
  if(!await validRecipient(message)){await deps.store.operation("fallback",{...data,id:message.id,lease_token:message.lease_token});return Response.json({delivery:null},{headers});}
  return Response.json({delivery:{id:message.id,lease_token:message.lease_token,lease_until:message.lease_until,discord_user_id:message.recipient,subject:message.subject,body:message.body,reference:`BESC-SLOT-${message.id}`}}, {headers});
 }
 if(op==="dispatch"){
  const message=await deps.store.operation("inspect",data);if(!await validRecipient(message)){await deps.store.operation("fallback",data);throw new Failure(409,"recipient_no_longer_linked");}
 }
 const operation=op==="fail"&&"error_code" in body.data&&body.data.error_code==="dm_closed"?"fallback":op;
 await deps.store.operation(operation,data);return Response.json({ok:true},{headers});
 }catch(error){const known=error instanceof Failure;return Response.json({error:{code:known?error.code:"slot_delivery_unavailable"}},{status:known?error.status:503,headers});}
}
