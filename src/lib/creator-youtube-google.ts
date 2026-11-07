import 'server-only';
import {z} from 'zod';
import {creatorYouTubeScopes} from './creator-youtube-kernel';
import type {CreatorYouTubePorts,CreatorYouTubeExchangeContext,CreatorYouTubeSample} from './creator-youtube-kernel';

type Job=Parameters<CreatorYouTubePorts['provider']['exchange']>[1];
type Provider=CreatorYouTubePorts['provider'];
export type CreatorGoogleTransport=(url:string,init:RequestInit)=>Promise<Response>;
const secret=z.string().min(1).max(8192).regex(/^[\x21-\x7e]+$/);
const channel=z.string().regex(/^UC[A-Za-z0-9_-]{22}$/);
const video=z.string().regex(/^[A-Za-z0-9_-]{11}$/);
const metrics=['views','estimatedMinutesWatched','averageViewDuration'] as const;
const envelope=z.object({access_token:secret,refresh_token:secret.optional(),expires_at:z.string().datetime({offset:true}),scopes:z.array(z.string()).length(2).refine(s=>creatorYouTubeScopes.every(v=>s.includes(v))),channel_id:z.string()}).strict();

// No ambient fetch or environment configuration: transport and synthetic/local configuration
// must be supplied explicitly. Nothing imports this adapter into a deployed route or scheduler.
export class CreatorYouTubeGoogle implements Provider {
 readonly isolatedProject:boolean;
 readonly requiresCapture=true;
 private readonly configuration:{clientId:string;clientSecret:string;redirectUri:string};
 constructor(configuration:{clientId:string;clientSecret:string;redirectUri:string;isolatedProject:boolean},private readonly transport:CreatorGoogleTransport,private readonly now:()=>number,private readonly enabled=false,private readonly timeoutMs=10000){
  const uri=new URL(configuration.redirectUri);
  if(uri.protocol!=='https:'||uri.username||uri.password||uri.search||uri.hash||uri.href!==configuration.redirectUri||!configuration.clientId.endsWith('.apps.googleusercontent.com')||configuration.clientId.length>512||!configuration.clientId.match(/^[A-Za-z0-9._-]+$/)||!configuration.clientSecret||configuration.clientSecret.length>4096||typeof transport!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw Error('creator_google_configuration');
  this.configuration={clientId:configuration.clientId,clientSecret:configuration.clientSecret,redirectUri:configuration.redirectUri};
  this.isolatedProject=configuration.isolatedProject===true;
 }
 private gate(){if(!this.enabled||!this.isolatedProject)throw Error('creator_google_unavailable');}
 ready(){this.gate();}
 private async run<T>(fn:()=>Promise<T>){this.gate();try{return await fn();}catch{throw Error('creator_google_not_confirmed');}}
 authorizationUrl(request:{state:string;codeChallenge:string;codeChallengeMethod:'S256';redirectUri:string}){
  this.gate();
  if(!/^[a-f0-9]{64}$/.test(request.state)||!/^[A-Za-z0-9_-]{43}$/.test(request.codeChallenge)||request.codeChallengeMethod!=='S256'||request.redirectUri!==this.configuration.redirectUri)throw Error('creator_google_not_confirmed');
  const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search=new URLSearchParams({client_id:this.configuration.clientId,redirect_uri:this.configuration.redirectUri,response_type:'code',scope:creatorYouTubeScopes.join(' '),access_type:'offline',prompt:'consent',include_granted_scopes:'false',state:request.state,code_challenge:request.codeChallenge,code_challenge_method:'S256'}).toString();
  return url.href;
 }
 private async request(url:string,init:RequestInit,json=true):Promise<unknown>{
  const controller=new AbortController();
  let timer:ReturnType<typeof setTimeout>|undefined;
  let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
  // A deadline covers transport AND response streaming, even if a test double ignores abort.
  const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();void reader?.cancel().catch(()=>undefined);reject(Error('Deadline'));},this.timeoutMs);});
  const read=async()=>{
   const response=await this.transport(url,{...init,redirect:'error',cache:'no-store',credentials:'omit',signal:controller.signal});
   if(controller.signal.aborted){void response.body?.cancel().catch(()=>undefined);throw Error('Deadline');}
   if(response.redirected)throw Error('Unexpected redirect');
   if(!json){await response.body?.cancel();if(response.status!==200)throw Error('Revocation unconfirmed');return null;}
   if(!response.body)throw Error('Missing body');
   reader=response.body.getReader();const chunks:Uint8Array[]=[];let length=0;
   try{for(;;){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;if(length>65536)throw Error('Response limit');chunks.push(part.value);}}
   catch(error){await reader.cancel().catch(()=>undefined);throw error;}
   const bytes=Buffer.concat(chunks);const raw:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
   // Preserve bounded credentials in a bad token response for the receipt/cleanup path.
   if(!response.ok){if(url==='https://oauth2.googleapis.com/token'&&raw&&typeof raw==='object'&&!Array.isArray(raw)&&('access_token'in raw||'refresh_token'in raw))return{...raw,token_type:'INVALID'};throw Error('Provider response');}
   return raw;
  };
  try{return await Promise.race([read(),deadline]);}finally{if(timer)clearTimeout(timer);}
 }
 private async token(parameters:Record<string,string>,refresh:boolean){
  const value=await this.request('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...parameters,client_id:this.configuration.clientId,client_secret:this.configuration.clientSecret}).toString()});
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid token response');
  const raw=value as Record<string,unknown>;
  // Do not call channels.list or validate other fields before returning credentials to the inbox.
  const access=secret.safeParse(raw.access_token),replacement=secret.safeParse(raw.refresh_token);
  if(!access.success&&!replacement.success)throw Error('No bounded credential');
  const duration=typeof raw.expires_in==='number'&&Number.isInteger(raw.expires_in)&&raw.expires_in>0&&raw.expires_in<=86400?raw.expires_in:null;
  const valid=raw.token_type==='Bearer'&&duration!==null&&(raw.refresh_token===undefined||replacement.success);
  return{...(access.success?{access_token:access.data}:{}),...(replacement.success?{refresh_token:replacement.data}:{}),channel_id:'',expires_at:valid?new Date(this.now()+duration!*1000).toISOString():'',scopes:valid?(typeof raw.scope==='string'&&raw.scope.length<=4096?raw.scope.split(' ').filter(Boolean):refresh&&raw.scope===undefined?[...creatorYouTubeScopes]:[]):[]};
 }
 async exchange(code:string,job:Job,context?:CreatorYouTubeExchangeContext){return this.run(async()=>{
  channel.parse(job.channel_id);
  if(!context||context.redirectUri!==this.configuration.redirectUri||!/^[A-Za-z0-9_-]{43}$/.test(context.codeVerifier)||!code||code.length>8192)throw Error('Invalid exchange');
  return this.token({grant_type:'authorization_code',code,code_verifier:context.codeVerifier,redirect_uri:this.configuration.redirectUri},false);
 });}
 async refresh(token:string,job:Job){return this.run(async()=>{channel.parse(job.channel_id);return this.token({grant_type:'refresh_token',refresh_token:secret.parse(token)},true);});}
 private async ownedChannel(token:string,expected:string){
  channel.parse(expected);
  const raw=z.object({items:z.array(z.object({id:channel})).max(50),nextPageToken:z.string().optional()}).parse(await this.request('https://www.googleapis.com/youtube/v3/channels?part=id&mine=true&maxResults=50',{headers:{Authorization:`Bearer ${secret.parse(token)}`}}));
  if(raw.nextPageToken||raw.items.length!==1||raw.items[0].id!==expected)throw Error('Channel not confirmed');
  return expected;
 }
 async validate(answer:unknown,job:Job){return this.run(async()=>{
  const value=envelope.parse(answer);if(Date.parse(value.expires_at)<=this.now())throw Error('Expired token');
  return{...value,channel_id:await this.ownedChannel(value.access_token,job.channel_id)};
 });}
 async collect(token:string,job:Job){return this.run(async()=>{
  const ids=z.array(video).min(1).max(25).parse(job.video_ids);
  if(new Set(ids).size!==ids.length||!z.string().date().safeParse(job.start_date).success||!z.string().date().safeParse(job.end_date).success||job.end_date<job.start_date)throw Error('Invalid selection');
  await this.ownedChannel(token,job.channel_id);
  const url=new URL('https://youtubeanalytics.googleapis.com/v2/reports');
  url.search=new URLSearchParams({ids:`channel==${job.channel_id}`,startDate:job.start_date,endDate:job.end_date,metrics:metrics.join(','),dimensions:'video',filters:`video==${ids.join(',')}`,maxResults:'25'}).toString();
  const value=z.object({columnHeaders:z.array(z.object({name:z.string(),columnType:z.enum(['DIMENSION','METRIC']),dataType:z.enum(['STRING','INTEGER','FLOAT'])})).length(4),rows:z.array(z.array(z.union([z.string(),z.number(),z.null()])).length(4)).max(25).optional()}).parse(await this.request(url.href,{headers:{Authorization:`Bearer ${secret.parse(token)}`}}));
  const names=['video',...metrics];
  if(!value.columnHeaders.every((h,i)=>h.name===names[i]&&h.columnType===(i===0?'DIMENSION':'METRIC')&&(i===0?h.dataType==='STRING':h.dataType!=='STRING')))throw Error('Report schema mismatch');
  const seen=new Map<string,(number|null)[]>();
  for(const row of value.rows??[]){if(typeof row[0]!=='string'||!ids.includes(row[0])||seen.has(row[0]))throw Error('Wrong report video');const numbers=row.slice(1);if(!numbers.every((n,i)=>n===null||typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<1e15&&(i!==0||Number.isSafeInteger(n))))throw Error('Invalid measurement');seen.set(row[0],numbers as (number|null)[]);}
  const samples:CreatorYouTubeSample[]=[];
  for(const id of ids)for(const [i,metric] of metrics.entries()){const value=seen.get(id)?.[i]??null;samples.push({video_id:id,metric,value,quality:value===null?'missing':'known'});}
  return samples;
 });}
 async revoke(token:string){return this.run(async()=>{await this.request('https://oauth2.googleapis.com/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:secret.parse(token)}).toString()},false);});}
}
