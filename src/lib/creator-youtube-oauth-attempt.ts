import 'server-only';
import {createCipheriv,createDecipheriv,createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import type {CreatorYouTubeKernel} from './creator-youtube-kernel';

// No HTTP routes or production provider adapter. Storage must implement atomic CAS across workers.
export type CreatorAttemptStore={
 read:(id:string)=>Promise<{revision:number;sealed:string}|null>;
 compareAndSwap:(id:string,expectedRevision:number|null,next:{revision:number;sealed:string})=>Promise<boolean>;
};
export type CreatorAttemptCipher={
 ready:()=>Promise<void>;
 seal:(id:string,revision:number,plaintext:string)=>Promise<string>;
 open:(id:string,revision:number,sealed:string)=>Promise<string>;
};
type Principal={organizationId:string;userId:string;sessionId:string};
type Kernel=Pick<CreatorYouTubeKernel,'beginAuthorization'|'authorize'|'withdraw'>;
const uuid=z.string().uuid();
const attemptSchema=z.object({link:uuid,binding:z.string().length(64),browser:z.string().length(64),state:z.string().length(64),verifier:z.string().regex(/^[A-Za-z0-9_-]{43}$/).optional(),expires:z.number().int(),status:z.enum(['pending','running','completed','cancelled','expired','failed','cleanup_pending','recovered']),cleanupReason:z.enum(['cancelled','expired','failed']).optional(),cleanupStatus:z.enum(['pending','failed','complete','blocked_isolation','uncertain']).optional()}).strict();
type Attempt=z.infer<typeof attemptSchema>;
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const same=(a:string,b:string)=>a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));

export class CreatorYouTubeOAuthAttempt {
 private readonly key:Buffer|null;
 private readonly cipher:CreatorAttemptCipher|null;
 constructor(private readonly ports:{store:CreatorAttemptStore;kernel:Kernel;principal:()=>Promise<Principal>;now:()=>number},key:Uint8Array|CreatorAttemptCipher,private readonly redirectUri:string,private readonly enabled=false){
  if(!key||typeof key!=='object')throw Error('creator_attempt_configuration');
  if('seal'in key){
   if(typeof key.seal!=='function'||typeof key.open!=='function'||typeof key.ready!=='function')throw Error('creator_attempt_configuration');
   this.cipher=key;this.key=null;
  }else{
   if(key.length!==32)throw Error('creator_attempt_configuration');
   this.key=Buffer.from(key);this.cipher=null;
  }
  const url=new URL(redirectUri);
  if(url.protocol!=='https:'||url.username||url.password||url.hash||url.search||url.href!==redirectUri)throw Error('creator_attempt_configuration');
 }
 private async run<T>(fn:()=>Promise<T>){if(!this.enabled)throw Error('creator_attempt_disabled');try{return await fn();}catch{throw Error('creator_attempt_not_confirmed');}}
 private async binding(){const p=await this.ports.principal();return hash(JSON.stringify([uuid.parse(p.organizationId),uuid.parse(p.userId),uuid.parse(p.sessionId)]));}
 private async seal(id:string,revision:number,value:Attempt){
  if(this.cipher)return this.cipher.seal(id,revision,JSON.stringify(value));
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.key!,iv);
  cipher.setAAD(Buffer.from(`creator-youtube-attempt:${id}:${revision}`));
  const encrypted=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64url');
 }
 private async open(id:string,record:{revision:number;sealed:string}){
  if(!Number.isSafeInteger(record.revision)||record.revision<1||record.sealed.length>16000)throw Error('Invalid storage');
  if(this.cipher)return attemptSchema.parse(JSON.parse(await this.cipher.open(id,record.revision,record.sealed)));
  const bytes=Buffer.from(record.sealed,'base64url'),decipher=createDecipheriv('aes-256-gcm',this.key!,bytes.subarray(0,12));
  decipher.setAAD(Buffer.from(`creator-youtube-attempt:${id}:${record.revision}`));decipher.setAuthTag(bytes.subarray(12,28));
  return attemptSchema.parse(JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8')));
 }
 private async write(id:string,revision:number|null,value:Attempt){const next=(revision??0)+1;return this.ports.store.compareAndSwap(id,revision,{revision:next,sealed:await this.seal(id,next,value)});}
 private async read(id:string,browserNonce:string,state?:string){
  uuid.parse(id);if(!/^[A-Za-z0-9_-]{43}$/.test(browserNonce))throw Error('Invalid browser binding');
  const record=await this.ports.store.read(id);if(!record)throw Error('Unknown request');const value=await this.open(id,record);
  if(!same(value.binding,await this.binding())||!same(value.browser,hash(browserNonce))||(state!==undefined&&(!/^[a-f0-9]{64}$/.test(state)||!same(value.state,hash(state)))))throw Error('Invalid callback binding');
  return{record,value};
 }
 private async cleanup(id:string,known:Attempt,reason:'cancelled'|'expired'|'failed'){
  for(let retry=0;retry<4;retry++){
   const record=await this.ports.store.read(id);if(!record)throw Error('Missing cleanup request');const value=await this.open(id,record);
   if(!same(value.binding,known.binding)||!same(value.browser,known.browser)||value.link!==known.link)throw Error('Changed cleanup owner');
   const queued:Attempt={...value,verifier:undefined,status:'cleanup_pending',cleanupReason:value.cleanupReason??reason,cleanupStatus:'pending'};
   // Persist intent before crossing the withdrawal/provider boundary. A restart may safely retry it.
   if(!await this.write(id,record.revision,queued))continue;
   let provider:NonNullable<Attempt['cleanupStatus']>='uncertain';
   try{const result=await this.ports.kernel.withdraw(value.link);if(result.local===true)provider=result.provider;}catch{/* Keep durable uncertain work; never report provider completion. */}
   const status=provider==='complete'?'recovered' as const:'cleanup_pending' as const;
   if(await this.write(id,record.revision+1,{...queued,status,cleanupStatus:provider}))return{status,provider};
  }
  throw Error('Cleanup outcome not confirmed');
 }
 async begin(link:string){return this.run(async()=>{
  await this.cipher?.ready();
  uuid.parse(link);const binding=await this.binding(),browserNonce=randomBytes(32).toString('base64url'),verifier=randomBytes(32).toString('base64url');
  const job=await this.ports.kernel.beginAuthorization(link);uuid.parse(job.jobId);if(!/^[a-f0-9]{64}$/.test(job.state))throw Error('Invalid request');
  const value:Attempt={link,binding,browser:hash(browserNonce),state:hash(job.state),verifier,expires:this.ports.now()+300000,status:'pending'};
  if(!await this.write(job.jobId,null,value))throw Error('Request collision');
  return{jobId:job.jobId,state:job.state,browserNonce,codeChallenge:createHash('sha256').update(verifier).digest('base64url'),codeChallengeMethod:'S256' as const,redirectUri:this.redirectUri};
 });}
 async callback(input:{jobId:string;browserNonce:string;state:string;code?:string;error?:string}){return this.run(async()=>{
  const {record,value}=await this.read(input.jobId,input.browserNonce,input.state);
  if(value.status!=='pending')throw Error('Request consumed');
  if(this.ports.now()>=value.expires){await this.cleanup(input.jobId,value,'expired');throw Error('Request expired');}
  if((input.code===undefined)===(input.error===undefined)||input.code!==undefined&&(!input.code||input.code.length>8192)||input.error!==undefined&&(!input.error||input.error.length>256))throw Error('Invalid callback');
  if(input.error!==undefined){const result=await this.cleanup(input.jobId,value,'cancelled');return{status:'cancelled' as const,provider:result.provider};}
  if(!value.verifier||!await this.write(input.jobId,record.revision,{...value,status:'running'}))throw Error('Request conflict');
  try{
   await this.ports.kernel.authorize(input.jobId,input.state,input.code!,{codeVerifier:value.verifier,redirectUri:this.redirectUri},async()=>{
    try{
     const current=await this.read(input.jobId,input.browserNonce,input.state);
     if(current.record.revision!==record.revision+1||current.value.status!=='running'||this.ports.now()>=value.expires)throw Error('Request no longer valid');
    }catch{await this.ports.kernel.withdraw(value.link);throw Error('Request no longer valid');}
   });
   if(!same(value.binding,await this.binding()))throw Error('Session changed');
   if(this.ports.now()>=value.expires)throw Error('Request expired');
   if(!await this.write(input.jobId,record.revision+1,{...value,verifier:undefined,status:'completed'})){await this.ports.kernel.withdraw(value.link);throw Error('Request superseded');}
   return{status:'completed' as const};
  }catch{
   // A durable running claim already exists if even queueing cleanup fails. No code is replayed.
   await this.cleanup(input.jobId,value,'failed').catch(async()=>{await this.ports.kernel.withdraw(value.link).catch(()=>undefined);});
   throw Error('Authorization not confirmed');
  }
 });}
 async cancel(jobId:string,browserNonce:string){return this.run(async()=>{
  const {value}=await this.read(jobId,browserNonce);const result=await this.cleanup(jobId,value,'cancelled');
  return{status:'cancelled' as const,provider:result.provider};
 });}
 async recover(jobId:string,browserNonce:string){return this.run(async()=>{
  const {value}=await this.read(jobId,browserNonce);
  if(value.status==='completed')return{status:'completed' as const,provider:'none' as const};
  if((value.status==='pending'||value.status==='running')&&this.ports.now()<value.expires)throw Error('Request still in progress');
  return this.cleanup(jobId,value,value.cleanupReason??(this.ports.now()>=value.expires?'expired':'failed'));
 });}
}
