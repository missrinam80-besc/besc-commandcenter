import { randomUUID } from 'node:crypto';
import { authenticateBotClient, BotRateLimiter, type BotClient, type BotStore } from './bot-api.ts';
import { parsedCampaignSubmission, readCampaignJson } from './campaign-ingress.ts';

export interface CampaignSubmitStore extends Pick<BotStore,'findAccount'|'findMembership'>{
  submit(org:string,guild:string,discord:string,user:string,campaign:string,key:string,platform:string,external:string,pilot:boolean,real:boolean):Promise<{id:string;status:string;replay:boolean}>;
}
const limiter=new BotRateLimiter(60);
export async function handleCampaignBotSubmit(request:Request,deps:{enabled:boolean;pilot:boolean;real:boolean;clients:()=>BotClient[];store:()=>CampaignSubmitStore}){
 const requestId=randomUUID();const reply=(status:number,value:object)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Request-Id':requestId}});
 if(!deps.enabled)return reply(404,{error:{code:'not_found'}});
 try{
  if(request.method!=='POST'||new URL(request.url).search) return reply(400,{error:{code:'invalid_query'}});
  const client=authenticateBotClient(request,deps.clients());if(!client)return reply(401,{error:{code:'invalid_client'}});
  if(!client.scopes.includes('campaigns:own:write'))return reply(403,{error:{code:'insufficient_scope'}});
  if(!limiter.allow(client.id,Date.now()))return reply(429,{error:{code:'rate_limited'}});
  const raw=await readCampaignJson(request),parsed=parsedCampaignSubmission(raw);
  if(parsed.guild_id!==client.guildId)return reply(403,{error:{code:'guild_not_allowed'}});
  const store=deps.store(),actor=await store.findAccount(parsed.discord_user_id);
  if(!actor||actor.banned||actor.verifiedDiscordId!==parsed.discord_user_id)return reply(404,{error:{code:'account_unavailable'}});
  const member=await store.findMembership(actor.userId,client.organizationId);
  if(!member||member.organization_id!==client.organizationId||member.status!=='active'||!['admin','board','member','volunteer'].includes(member.role))return reply(403,{error:{code:'membership_required'}});
  const result=await store.submit(client.organizationId,client.guildId,parsed.discord_user_id,actor.userId,parsed.data.campaign_id,parsed.idempotency_key,parsed.post.platform,parsed.post.externalId,deps.pilot,deps.real);
  if(!/^[a-f0-9-]{36}$/i.test(result.id)||!['candidate','verified','rejected'].includes(result.status)||typeof result.replay!=='boolean')throw Error('invalid_response');
  return reply(200,{schemaVersion:1,contributionId:result.id,status:result.status,replay:result.replay});
 }catch(error){
  const code=error instanceof Error?error.message:'';
  const known=['invalid_fields','invalid_body','json_required','body_too_large','body_timeout'];
  return reply(known.includes(code)||error instanceof SyntaxError||code.includes('Zod')?400:code==='idempotency_conflict'?409:code==='campaign_unavailable'?403:503,{error:{code:known.includes(code)?code:code==='idempotency_conflict'?code:code==='campaign_unavailable'?code:'upstream_unavailable',requestId}});
 }
}
