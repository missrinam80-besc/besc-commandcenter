import 'server-only';
import {createHash,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';

export const creatorYouTubeScopes = ['https://www.googleapis.com/auth/youtube.readonly','https://www.googleapis.com/auth/yt-analytics.readonly'] as const;
const id=z.string().uuid(),at=z.string().datetime({offset:true});
const consentSchema=z.object({accepted:z.literal(true),purpose:z.string().trim().min(2).max(2000),channel_id:z.string().regex(/^UC[A-Za-z0-9_-]{22}$/),video_ids:z.array(z.string().regex(/^[A-Za-z0-9_-]{11}$/)).min(1).max(25),start_date:z.string().date(),end_date:z.string().date(),valid_until:at,retain_until:at}).strict();
export type CreatorYouTubeConsent=z.infer<typeof consentSchema>;
const tokenSchema=z.object({channel_id:z.string(),scopes:z.array(z.string()).length(2).refine(s=>creatorYouTubeScopes.every(v=>s.includes(v))),access_token:z.string().min(1).max(8192),refresh_token:z.string().min(1).max(8192).optional(),expires_at:at}).strict();
export type CreatorYouTubeToken=z.infer<typeof tokenSchema>;
export type CreatorYouTubeCleanupOutcome='pending'|'failed'|'complete'|'blocked_isolation'|'uncertain';
export type CreatorYouTubeExchangeContext={codeVerifier:string;redirectUri:string};
type Job={id:string;kind:'authorize'|'refresh'|'collect'|'revoke';channel_id:string;video_ids:string[];start_date:string;end_date:string;state_hash:string|null;credentials:{access_token:string;refresh_token:string;expires_at:string}|null};
export type CreatorYouTubeSample={video_id:string;metric:'views'|'estimatedMinutesWatched'|'averageViewDuration';value:number|null;quality:'known'|'missing'};
export type CreatorYouTubePorts={
 owner:(op:'consent'|'begin'|'withdraw'|'read',link:string|null,data:Record<string,unknown>)=>Promise<{id:string;job_id?:string|null;provider_revocation?:CreatorYouTubeCleanupOutcome|'none'}>;
 server:(job:string,op:'read'|'finish'|'revocation'|'quarantine'|'close_unstarted',data:Record<string,unknown>)=>Promise<unknown>;
 provider:{isolatedProject:boolean;requiresCapture?:boolean;exchange:(code:string,scope:Job,context?:CreatorYouTubeExchangeContext)=>Promise<unknown>;refresh:(token:string,scope:Job)=>Promise<unknown>;validate?:(answer:unknown,scope:Job)=>Promise<unknown>;collect:(token:string,scope:Job)=>Promise<CreatorYouTubeSample[]>;revoke:(token:string)=>Promise<void>};
};
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
// No production provider, HTTP route, configuration or scheduler is supplied.
// Every operation defaults off and uses injected server ports only.
export class CreatorYouTubeKernel {
 constructor(private ports:CreatorYouTubePorts,private enabled=false){}
 private async run<T>(operation:()=>Promise<T>):Promise<T>{if(!this.enabled)throw Error('creator_youtube_disabled');try{return await operation();}catch{throw Error('creator_youtube_not_confirmed');}}
 private async job(jobId:string,kind:Job['kind']):Promise<Job>{id.parse(jobId);const value=await this.ports.server(jobId,'read',{}) as Job;if(value?.id!==jobId||value.kind!==kind)throw Error('Invalid job');return value;}
 private async finish(job:Job,value:unknown){try{const result=await this.ports.server(job.id,'finish',value as Record<string,unknown>) as {id?:string};id.parse(result?.id);}catch(error){if(job.kind==='authorize'||job.kind==='refresh')await this.ports.server(job.id,'quarantine',value as Record<string,unknown>).catch(()=>{/* No retry or reactivation; revoked state remains authoritative. */});throw error;}}
 private token(value:unknown,job:Job,previous?:string){const t=tokenSchema.parse(value);if(t.channel_id!==job.channel_id||Date.parse(t.expires_at)<=Date.now())throw Error('Invalid provider binding');const refresh=t.refresh_token??previous;if(!refresh)throw Error('Missing offline credential');return{...t,refresh_token:refresh};}
 private capturedOutcome(value:CreatorYouTubeCleanupOutcome|'none'):CreatorYouTubeCleanupOutcome{return value==='none'?'uncertain':value;}
 async closeUnstartedAuthorization(jobId:string,link:string,reason:'denied'|'cancelled'|'expired'|'failed'){return this.run(async()=>{
  id.parse(jobId);id.parse(link);z.enum(['denied','cancelled','expired','failed']).parse(reason);
  // The owner port verifies the actual current user/session before the server-only closure.
  const withdrawn=await this.ports.owner('withdraw',link,{});if(withdrawn.id!==link)throw Error('Local withdrawal unconfirmed');
  const result=z.object({id,closed_job_id:id,closed:z.literal(true),reason:z.enum(['denied','cancelled','expired','failed']),provider_revocation:z.enum(['none','pending','failed','complete'])}).parse(await this.ports.server(jobId,'close_unstarted',{link_id:link,reason}));
  if(result.id!==link||result.closed_job_id!==jobId||result.reason!==reason)throw Error('Unstarted closure unconfirmed');
  return{local:true as const,provider:result.provider_revocation};
 });}
 async consent(value:CreatorYouTubeConsent){return this.run(async()=>{const data=consentSchema.parse(value);const result=await this.ports.owner('consent',null,{...data,request_id:randomUUID()});id.parse(result.id);return{id:result.id};});}
 async beginAuthorization(link:string){return this.run(async()=>{id.parse(link);const state=randomBytes(32).toString('hex');const job=await this.ports.owner('begin',link,{kind:'authorize',request_id:randomUUID(),state_hash:sha(state)});id.parse(job.id);return{jobId:job.id,state};});}
 async authorize(jobId:string,state:string,code:string,context?:CreatorYouTubeExchangeContext,beforeCommit?:()=>Promise<void>,receive?:(exchange:()=>Promise<unknown>)=>Promise<unknown>){return this.run(async()=>{if(!this.ports.provider.isolatedProject)throw Error('Unverified project isolation');const job=await this.job(jobId,'authorize');if(typeof state!=='string'||state.length!==64||!job.state_hash||!/^[a-f0-9]{64}$/.test(job.state_hash)||!timingSafeEqual(Buffer.from(sha(state),'hex'),Buffer.from(job.state_hash,'hex'))||!code||code.length>8192)throw Error('Invalid callback');if(this.ports.provider.requiresCapture&&!receive)throw Error('Durable receipt required');const exchange=()=>this.ports.provider.exchange(code,job,context);const received=await(receive?receive(exchange):exchange());if(!this.ports.provider.isolatedProject)throw Error('Project isolation changed');const validated=this.ports.provider.validate?await this.ports.provider.validate(received,job):received;if(!this.ports.provider.isolatedProject)throw Error('Project isolation changed');const token=this.token(validated,job);try{await beforeCommit?.();}catch(error){await this.ports.server(job.id,'quarantine',token).catch(()=>undefined);throw error;}await this.finish(job,token);});}
 async recoverCapturedAuthorization(jobId:string,link:string,value:unknown):Promise<CreatorYouTubeCleanupOutcome>{return this.run(async()=>{
  id.parse(jobId);id.parse(link);const local=await this.withdraw(link);if(!local.local)throw Error('Local withdrawal unconfirmed');
  if(!this.ports.provider.isolatedProject)return 'blocked_isolation';
  const captured=z.object({access_token:z.string().min(1).max(8192).optional(),refresh_token:z.string().min(1).max(8192).optional()}).parse(value);
  const credential=captured.refresh_token??captured.access_token;if(!credential)throw Error('No captured credential');
  try{const valid=tokenSchema.parse(value);const stored=await this.ports.server(jobId,'quarantine',valid) as {id?:string};if(stored?.id!==link)throw Error('Wrong captured job');return this.capturedOutcome((await this.withdraw(link)).provider);}catch{/* No activation fallback: local withdrawal remains authoritative. */}
  try{await this.ports.provider.revoke(credential);}catch{return 'failed';}
  // A provider success alone cannot clear unresolved SQL state for an invalid/expired answer.
  return this.capturedOutcome((await this.withdraw(link)).provider);
 });}
 async beginRefresh(link:string){return this.run(async()=>{id.parse(link);if(!this.ports.provider.isolatedProject)throw Error('Unverified project isolation');const ticket=await this.ports.owner('begin',link,{kind:'refresh',request_id:randomUUID()});id.parse(ticket.id);return{jobId:ticket.id};});}
 async refreshPrepared(jobId:string,beforeCommit?:()=>Promise<void>,receive?:(refresh:()=>Promise<unknown>)=>Promise<unknown>){return this.run(async()=>{
  if(!this.ports.provider.isolatedProject)throw Error('Unverified project isolation');const job=await this.job(jobId,'refresh');const previous=job.credentials?.refresh_token;if(!previous)throw Error('Missing credential');
  if(this.ports.provider.requiresCapture&&!receive)throw Error('Durable receipt required');const refresh=async()=>{const raw=await this.ports.provider.refresh(previous,job);if(raw&&typeof raw==='object'&&!Array.isArray(raw)&&(raw as Record<string,unknown>).refresh_token===undefined)return{...raw,refresh_token:previous};return raw;};
  const received=await(receive?receive(refresh):refresh());if(!this.ports.provider.isolatedProject)throw Error('Project isolation changed');const validated=this.ports.provider.validate?await this.ports.provider.validate(received,job):received;if(!this.ports.provider.isolatedProject)throw Error('Project isolation changed');const token=this.token(validated,job,previous);
  try{await beforeCommit?.();}catch(error){await this.ports.server(job.id,'quarantine',token).catch(()=>undefined);throw error;}await this.finish(job,token);
 });}
 async refresh(link:string){return this.run(async()=>{const ticket=await this.beginRefresh(link);await this.refreshPrepared(ticket.jobId);});}
 async collect(link:string){return this.run(async()=>{id.parse(link);if(!this.ports.provider.isolatedProject)throw Error('Unverified project isolation');const ticket=await this.ports.owner('begin',link,{kind:'collect',request_id:randomUUID()});const job=await this.job(ticket.id,'collect');if(!job.credentials?.access_token||Date.parse(job.credentials.expires_at)<=Date.now())throw Error('Refresh required');const rows=await this.ports.provider.collect(job.credentials.access_token,job);await this.finish(job,{rows});});}
 async withdraw(link:string){return this.run(async()=>{id.parse(link);const result=await this.ports.owner('withdraw',link,{});if(result.id!==link)throw Error('Unconfirmed withdrawal');if(!result.job_id)return{local:true,provider:result.provider_revocation==='none'?'none' as const:'complete' as const};if(!this.ports.provider.isolatedProject)return{local:true,provider:'blocked_isolation' as const};const job=await this.job(result.job_id,'revoke');const credential=job.credentials?.refresh_token??job.credentials?.access_token;if(!credential)return{local:true,provider:'pending' as const};let success=false;try{await this.ports.provider.revoke(credential);success=true;}catch{/* No raw provider messages or credentials are returned or logged. */}const stored=await this.ports.server(job.id,'revocation',{success}) as {id?:string};if(stored?.id!==link)throw Error('Unconfirmed provider result');return{local:true,provider:success?'complete' as const:'failed' as const};});}
}
