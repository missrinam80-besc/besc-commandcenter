import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
const identifier=z.string().regex(/^[1-9]\d{0,19}$/);
const sourceSchema=z.object({organizationId:z.uuid(),broadcasterId:identifier,moderatorId:identifier,
 callback:z.url().refine(s=>{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash;}),
 secret:z.string().regex(/^[\x21-\x7e]{32,100}$/),
 subscriptions:z.object({follow:z.string().min(1).max(256).nullable(),cheer:z.string().min(1).max(256).nullable()}).strict()}).strict();
export type TwitchRewardSource=z.infer<typeof sourceSchema>;
export function twitchRewardSources(raw:string|undefined):Record<string,TwitchRewardSource>{
 if(!raw)return {};const parsed=z.record(z.string().regex(/^[a-z0-9-]{1,64}$/),sourceSchema).parse(JSON.parse(raw));
 if(Object.keys(parsed).length>20)throw Error('invalid_sources');
 const seen=new Set<string>();for(const [id,s] of Object.entries(parsed)){
  if(new URL(s.callback).pathname!==`/api/v1/integrations/rewards/twitch/${id}`||(s.subscriptions.follow!==null&&s.subscriptions.follow===s.subscriptions.cheer))throw Error('invalid_sources');
  const key=s.organizationId+':'+s.broadcasterId;if(seen.has(key))throw Error('duplicate_source');seen.add(key);
 }return parsed;
}
class Invalid extends Error{readonly status:number;constructor(status:number){super('eventsub_rejected');this.status=status;}}
async function rawBody(request:Request){
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??''))throw new Invalid(415);
 if(Number(request.headers.get('content-length'))>65536)throw new Invalid(413);
 const reader=request.body?.getReader();if(!reader)throw new Invalid(400);
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([(async()=>{const chunks:Uint8Array[]=[];let size=0;
  while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>65536)throw new Invalid(413);chunks.push(part.value);}return Buffer.concat(chunks);
 })(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Invalid(408)),2500);})]);}
 finally{clearTimeout(timer);void reader.cancel().catch(()=>{});}
}
const subscription=z.object({id:z.string(),status:z.string(),type:z.enum(['channel.follow','channel.cheer']),version:z.string(),
 condition:z.object({broadcaster_user_id:identifier,moderator_user_id:identifier.optional()}),
 transport:z.object({method:z.literal('webhook'),callback:z.string()})});
export type TwitchRewardFacts={message_id:string;subscription_id:string;kind:'follow'|'cheer'|'revocation';occurred_at:string;twitch_user_id?:string;bits?:number;anonymous?:boolean};
export async function handleTwitchRewards(request:Request,source:TwitchRewardSource|undefined,deps:{enabled:boolean;now?:number;store:(s:TwitchRewardSource,f:TwitchRewardFacts)=>Promise<unknown>}){
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 try{
  if(request.method!=='POST')throw new Invalid(405);
  if(!deps.enabled||!source)throw new Invalid(404);
  if(request.url!==source.callback)throw new Invalid(400);
  const get=(name:string)=>request.headers.get('Twitch-Eventsub-'+name)??'';
  const id=get('Message-Id'),stamp=get('Message-Timestamp'),signature=get('Message-Signature'),type=get('Message-Type');
  const now=deps.now??Date.now();
  if(!id||id.length>256||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(stamp)||!Number.isFinite(Date.parse(stamp))||Date.parse(stamp)<now-600000||Date.parse(stamp)>now+5000||!/^sha256=[a-f0-9]{64}$/.test(signature))throw new Invalid(403);
  const raw=await rawBody(request),expected=createHmac('sha256',source.secret).update(id+stamp).update(raw).digest();
  if(!timingSafeEqual(expected,Buffer.from(signature.slice(7),'hex')))throw new Invalid(403);
  const body=z.object({subscription,event:z.unknown().optional(),challenge:z.string().min(1).max(1024).optional()}).parse(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw)));
  const sub=body.subscription,kind=sub.type==='channel.follow'?'follow':'cheer';
  if((type!=='webhook_callback_verification'&&sub.id!==source.subscriptions[kind])||sub.condition.broadcaster_user_id!==source.broadcasterId||sub.transport.callback!==source.callback||get('Subscription-Type')!==sub.type||get('Subscription-Version')!==sub.version||sub.version!==(kind==='follow'?'2':'1')||(kind==='follow'&&sub.condition.moderator_user_id!==source.moderatorId))throw new Invalid(403);
  if(type==='webhook_callback_verification'){
   if(sub.status!=='webhook_callback_verification_pending'||!body.challenge)throw new Invalid(400);
   return new Response(body.challenge,{status:200,headers:{...headers,'Content-Type':'text/plain; charset=utf-8'}});
  }
  let facts:TwitchRewardFacts={message_id:id,subscription_id:sub.id,kind:'revocation',occurred_at:stamp};
  if(type==='notification'){
   if(sub.status!=='enabled')throw new Invalid(403);
   const event=z.object({broadcaster_user_id:identifier,user_id:identifier.nullable(),followed_at:z.string().optional(),bits:z.number().int().positive().max(2147483647).optional(),is_anonymous:z.boolean().optional()}).parse(body.event);
   if(event.broadcaster_user_id!==source.broadcasterId)throw new Invalid(403);
   if(kind==='follow'){
    if(!event.user_id||!event.followed_at||!Number.isFinite(Date.parse(event.followed_at))||Date.parse(event.followed_at)>now+5000||Date.parse(event.followed_at)<now-600000)throw new Invalid(400);
    facts={...facts,kind,twitch_user_id:event.user_id,occurred_at:event.followed_at};
   }else{
    if(typeof event.is_anonymous!=='boolean'||!event.bits||(!event.is_anonymous&&!event.user_id))throw new Invalid(400);
    facts={...facts,kind,...(event.user_id?{twitch_user_id:event.user_id}:{}),bits:event.bits,anonymous:event.is_anonymous};
   }
  }else if(type!=='revocation'||sub.status==='enabled'||sub.status==='webhook_callback_verification_pending')throw new Invalid(400);
  const result=await deps.store(source,facts);
  if(!result||typeof result!=='object'||!('ok'in result)||result.ok!==true)throw new Invalid(503);
  return new Response(null,{status:204,headers});
 }catch(error){return Response.json({error:'eventsub_not_confirmed'},{status:error instanceof Invalid?error.status:error instanceof z.ZodError||error instanceof SyntaxError||error instanceof TypeError?400:503,headers});}
}
