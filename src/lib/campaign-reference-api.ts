import { createHash,timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { BotRateLimiter } from './bot-api.ts';
import { campaignReferenceSchema,readCampaignJson } from './campaign-ingress.ts';
const clientSchema=z.object({id:z.string().regex(/^[a-z0-9-]{3,64}$/),keyHash:z.string().regex(/^[a-f0-9]{64}$/),organizationId:z.uuid(),sourceId:z.uuid(),broadcasterId:z.string().regex(/^[1-9]\d{0,19}$/),scopes:z.array(z.literal('campaigns:reference:write')).length(1),expiresAt:z.iso.datetime({offset:true}),revoked:z.boolean()}).strict();
export type CampaignReferenceClient=z.infer<typeof clientSchema>;
export function parseReferenceClients(raw?:string){
 const value=z.array(clientSchema).max(32).parse(JSON.parse(raw??'[]'));
 if(new Set(value.map(v=>v.id)).size!==value.length||new Set(value.map(v=>v.keyHash)).size!==value.length)throw Error('invalid_registry');return value;
}
const limiter=new BotRateLimiter(60);
const ack=z.object({receiptId:z.uuid(),accepted:z.literal(true),providerVerified:z.literal(false),awarded:z.literal(false),replay:z.boolean()}).strict();
const envelope=z.object({source_id:z.uuid(),broadcaster_id:z.string().regex(/^[1-9]\d{0,19}$/),reference:campaignReferenceSchema}).strict();
export async function handleCampaignReference(request:Request,deps:{enabled:boolean;clients:()=>CampaignReferenceClient[];receive:(client:CampaignReferenceClient,data:z.infer<typeof campaignReferenceSchema>)=>Promise<unknown>}){
 const reply=(status:number,value:object)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
 if(!deps.enabled)return reply(404,{error:{code:'not_found'}});
 try{
  if(request.method!=='POST'||new URL(request.url).search)return reply(400,{error:{code:'invalid_query'}});
  const token=/^Bearer (bcr_([a-z0-9-]{3,64})\.[A-Za-z0-9_-]{43})$/.exec(request.headers.get('authorization')??'');
  const client=token&&deps.clients().find(c=>c.id===token[2]);
  if(!client||!token||client.revoked||Date.parse(client.expiresAt)<=Date.now()||!timingSafeEqual(Buffer.from(client.keyHash,'hex'),createHash('sha256').update(token[1]).digest()))return reply(401,{error:{code:'invalid_client'}});
  if(!limiter.allow(client.id,Date.now()))return reply(429,{error:{code:'rate_limited'}});
  const data=envelope.safeParse(await readCampaignJson(request,4096));
  if(!data.success)return reply(400,{error:{code:'invalid_fields'}});
  if(data.data.source_id!==client.sourceId||data.data.broadcaster_id!==client.broadcasterId)return reply(403,{error:{code:'source_unavailable'}});
  return reply(200,ack.parse(await deps.receive(client,data.data.reference)));
 }catch(error){const code=error instanceof Error?error.message:'';const bad=['invalid_fields','json_required','body_too_large','invalid_body'].includes(code)||error instanceof SyntaxError;return reply(code==='body_timeout'?408:bad?400:code==='idempotency_conflict'?409:code==='source_unavailable'?403:code==='rate_limited'?429:503,{error:{code:code==='body_timeout'?'body_timeout':bad?'invalid_fields':['idempotency_conflict','source_unavailable','rate_limited'].includes(code)?code:'upstream_unavailable'}});}
}
