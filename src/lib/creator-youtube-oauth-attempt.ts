import 'server-only';
import {createCipheriv,createDecipheriv,createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import type {CreatorYouTubeKernel,CreatorYouTubeCleanupOutcome} from './creator-youtube-kernel';

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
export type CreatorResponseBinding={jobId:string;link:string;ownerBinding:string;browserBinding:string;stateHash:string;kind?:'authorize'|'refresh'};
export type CreatorResponsePort={
 receive:(binding:CreatorResponseBinding,exchange:()=>Promise<unknown>)=>Promise<unknown>;
 applied:(binding:CreatorResponseBinding)=>Promise<void>;
 recover:(binding:CreatorResponseBinding,cleanup:(answer:unknown)=>Promise<CreatorYouTubeCleanupOutcome>)=>Promise<CreatorYouTubeCleanupOutcome>;
};
type Principal={organizationId:string;userId:string;sessionId:string};
type Kernel=Pick<CreatorYouTubeKernel,'beginAuthorization'|'authorize'|'withdraw'>&Partial<Pick<CreatorYouTubeKernel,'recoverCapturedAuthorization'|'beginRefresh'|'refreshPrepared'|'closeUnstartedAuthorization'>>;
const uuid=z.string().uuid();
const attemptSchema=z.object({link:uuid,binding:z.string().length(64),browser:z.string().length(64),state:z.string().length(64),verifier:z.string().regex(/^[A-Za-z0-9_-]{43}$/).optional(),expires:z.number().int(),status:z.enum(['pending','running','completed','cancelled','expired','failed','cleanup_pending','recovered','refresh_abandoned']),cleanupReason:z.enum(['denied','cancelled','expired','failed']).optional(),cleanupStatus:z.enum(['none','pending','failed','complete','blocked_isolation','uncertain']).optional(),kind:z.enum(['authorize','refresh']).optional(),exchangeNotStarted:z.literal(true).optional()}).strict();
const refreshSlotSchema=z.object({purpose:z.literal('creator_youtube_refresh_slot_v1'),link:uuid,jobId:uuid,binding:z.string().length(64),status:z.enum(['held','free'])}).strict();
type Attempt=z.infer<typeof attemptSchema>;
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const same=(a:string,b:string)=>a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));

export class CreatorYouTubeOAuthAttempt {
 private readonly key:Buffer|null;
 private readonly cipher:CreatorAttemptCipher|null;
 constructor(private readonly ports:{store:CreatorAttemptStore;kernel:Kernel;principal:()=>Promise<Principal>;now:()=>number;responses?:CreatorResponsePort},key:Uint8Array|CreatorAttemptCipher,private readonly redirectUri:string,private readonly enabled=false){
  if(ports.responses&&typeof ports.kernel.recoverCapturedAuthorization!=='function')throw Error('creator_attempt_configuration');
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
 private responseBinding(jobId:string,value:Attempt):CreatorResponseBinding{return{jobId,link:value.link,ownerBinding:value.binding,browserBinding:value.browser,stateHash:value.state,...(value.kind==='refresh'?{kind:'refresh' as const}:{})};}
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
 private refreshSlotId(link:string){const b=createHash('sha256').update('creator-youtube-refresh-slot:'+uuid.parse(link)).digest().subarray(0,16);b[6]=(b[6]&15)|80;b[8]=(b[8]&63)|128;const s=b.toString('hex');return`${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`;}
 private async refreshSlot(link:string){
  if(!this.cipher)throw Error('Wrapped storage required');const id=this.refreshSlotId(link),record=await this.ports.store.read(id);if(!record)return null;
  if(!Number.isSafeInteger(record.revision)||record.revision<1||record.sealed.length>16000)throw Error('Invalid refresh slot');
  const value=refreshSlotSchema.parse(JSON.parse(await this.cipher.open(id,record.revision,record.sealed)));if(value.link!==link)throw Error('Wrong refresh slot');return{record,value};
 }
 private async writeRefreshSlot(expected:number|null,value:z.infer<typeof refreshSlotSchema>){
  if(!this.cipher)throw Error('Wrapped storage required');refreshSlotSchema.parse(value);const id=this.refreshSlotId(value.link),revision=(expected??0)+1;
  return this.ports.store.compareAndSwap(id,expected,{revision,sealed:await this.cipher.seal(id,revision,JSON.stringify(value))});
 }
 private async assertRefreshSlot(jobId:string,value:Attempt){const slot=await this.refreshSlot(value.link);if(!slot||slot.value.status!=='held'||slot.value.jobId!==jobId||!same(slot.value.binding,value.binding))throw Error('Refresh reservation not available');}
 private async releaseRefreshSlot(jobId:string,value:Attempt){
  if(value.kind!=='refresh')return;
  for(let retry=0;retry<4;retry++){
   const slot=await this.refreshSlot(value.link);if(!slot)throw Error('Missing refresh reservation');
   if(slot.value.status==='free'||slot.value.jobId!==jobId)return;
   if(!same(slot.value.binding,value.binding))throw Error('Wrong refresh owner');
   if(await this.writeRefreshSlot(slot.record.revision,{...slot.value,status:'free'}))return;
  }
  throw Error('Refresh release not confirmed');
 }
 private async abandonUnusedRefresh(jobId:string,known:Attempt){
  for(let retry=0;retry<4;retry++){
   const record=await this.ports.store.read(jobId);if(!record)throw Error('Missing refresh action');const value=await this.open(jobId,record);
   if(value.kind!=='refresh'||value.link!==known.link||!same(value.binding,known.binding)||!same(value.browser,known.browser))throw Error('Wrong refresh action');
   if(value.status==='refresh_abandoned'){await this.releaseRefreshSlot(jobId,value);return true;}
   if(value.status!=='pending')return false;
   if(await this.write(jobId,record.revision,{...value,status:'refresh_abandoned'})){await this.releaseRefreshSlot(jobId,value);return true;}
  }
  throw Error('Unused refresh release not confirmed');
 }
 private async read(id:string,browserNonce:string,state?:string){
  uuid.parse(id);if(!/^[A-Za-z0-9_-]{43}$/.test(browserNonce))throw Error('Invalid browser binding');
  const record=await this.ports.store.read(id);if(!record)throw Error('Unknown request');const value=await this.open(id,record);
  if(!same(value.binding,await this.binding())||!same(value.browser,hash(browserNonce))||(state!==undefined&&(!/^[a-f0-9]{64}$/.test(state)||!same(value.state,hash(state)))))throw Error('Invalid callback binding');
  return{record,value};
 }
 private async cleanup(id:string,known:Attempt,reason:'denied'|'cancelled'|'expired'|'failed'){
  for(let retry=0;retry<4;retry++){
   const record=await this.ports.store.read(id);if(!record)throw Error('Missing cleanup request');const value=await this.open(id,record);
   if(!same(value.binding,known.binding)||!same(value.browser,known.browser)||value.link!==known.link)throw Error('Changed cleanup owner');
   const queued:Attempt={...value,verifier:undefined,status:'cleanup_pending',cleanupReason:value.cleanupReason??reason,cleanupStatus:'pending',...((value.kind!=='refresh'&&value.status==='pending'||value.exchangeNotStarted)?{exchangeNotStarted:true as const}:{})};
   // Persist intent before crossing the withdrawal/provider boundary. A restart may safely retry it.
   if(!await this.write(id,record.revision,queued))continue;
   let provider:NonNullable<Attempt['cleanupStatus']>='uncertain';
   try{
    let result;
    const close=value.kind!=='refresh'&&this.ports.kernel.closeUnstartedAuthorization;
    if(close){
     try{result=await close.call(this.ports.kernel,id,value.link,queued.cleanupReason??reason);if(result.local===true)queued.exchangeNotStarted=true;}
     catch(error){if(queued.exchangeNotStarted)throw error;result=await this.ports.kernel.withdraw(value.link);}
    }else result=await this.ports.kernel.withdraw(value.link);
    if(result.local===true){
     provider=result.provider;
     // A CAS from pending proves that no worker has claimed the code exchange. Persist this
     // proof before withdrawal, so denial/cancel recovery need not invent a missing receipt.
     if(this.ports.responses&&!queued.exchangeNotStarted)provider=await this.ports.responses.recover(this.responseBinding(id,value),answer=>this.ports.kernel.recoverCapturedAuthorization!(id,value.link,answer));
    }
   }catch{/* Keep durable uncertain work; never report provider completion. */}
   const status=provider==='complete'||provider==='none'?'recovered' as const:'cleanup_pending' as const;
   if(await this.write(id,record.revision+1,{...queued,status,cleanupStatus:provider})){if(provider==='complete')await this.releaseRefreshSlot(id,value);return{status,provider,...(queued.exchangeNotStarted?{exchangeNotStarted:true as const}:{})};}
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
  if(value.status!=='pending'||value.kind==='refresh')throw Error('Request consumed');
  if(this.ports.now()>=value.expires){const result=await this.cleanup(input.jobId,value,'expired');return{status:'expired' as const,provider:result.provider,...(result.exchangeNotStarted?{exchangeNotStarted:true as const}:{})};}
  if((input.code===undefined)===(input.error===undefined)||input.code!==undefined&&(!input.code||input.code.length>8192)||input.error!==undefined&&(!input.error||input.error.length>256))throw Error('Invalid callback');
  if(input.error!==undefined){const result=await this.cleanup(input.jobId,value,'denied');return{status:'cancelled' as const,provider:result.provider,...(result.exchangeNotStarted?{exchangeNotStarted:true as const}:{})};}
  if(!value.verifier||!await this.write(input.jobId,record.revision,{...value,status:'running'}))throw Error('Request conflict');
  try{
   await this.ports.kernel.authorize(input.jobId,input.state,input.code!,{codeVerifier:value.verifier,redirectUri:this.redirectUri},async()=>{
    try{
     const current=await this.read(input.jobId,input.browserNonce,input.state);
     if(current.record.revision!==record.revision+1||current.value.status!=='running'||this.ports.now()>=value.expires)throw Error('Request no longer valid');
    }catch{await this.ports.kernel.withdraw(value.link);throw Error('Request no longer valid');}
   },this.ports.responses?exchange=>this.ports.responses!.receive(this.responseBinding(input.jobId,value),exchange):undefined);
   if(!same(value.binding,await this.binding()))throw Error('Session changed');
   if(this.ports.now()>=value.expires)throw Error('Request expired');
   await this.ports.responses?.applied(this.responseBinding(input.jobId,value));
   if(!await this.write(input.jobId,record.revision+1,{...value,verifier:undefined,status:'completed'})){await this.ports.kernel.withdraw(value.link);throw Error('Request superseded');}
   return{status:'completed' as const};
  }catch{
   // A durable running claim already exists if even queueing cleanup fails. No code is replayed.
   await this.cleanup(input.jobId,value,'failed').catch(async()=>{await this.ports.kernel.withdraw(value.link).catch(()=>undefined);});
   throw Error('Authorization not confirmed');
  }
 });}
 async beginRefresh(link:string){return this.run(async()=>{
  if(!this.cipher||!this.ports.responses||!this.ports.kernel.beginRefresh||!this.ports.kernel.refreshPrepared)throw Error('Refresh capture not configured');
  await this.cipher.ready();uuid.parse(link);const binding=await this.binding(),slot=await this.refreshSlot(link);
  if(slot?.value.status==='held')throw Error('Previous refresh unresolved');
  const job=await this.ports.kernel.beginRefresh(link);uuid.parse(job.jobId);const browserNonce=randomBytes(32).toString('base64url');
  if(!await this.writeRefreshSlot(slot?.record.revision??null,{purpose:'creator_youtube_refresh_slot_v1',link,jobId:job.jobId,binding,status:'held'}))throw Error('Refresh conflict');
  const value:Attempt={link,binding,browser:hash(browserNonce),state:hash(randomBytes(32).toString('hex')),expires:this.ports.now()+300000,status:'pending',kind:'refresh'};
  if(!await this.write(job.jobId,null,value))throw Error('Refresh preparation not confirmed');
  return{jobId:job.jobId,browserNonce};
 });}
 async refresh(jobId:string,browserNonce:string){return this.run(async()=>{
  if(!this.ports.responses||!this.ports.kernel.refreshPrepared)throw Error('Refresh capture not configured');
  const {record,value}=await this.read(jobId,browserNonce);
  if(value.kind!=='refresh'||value.status!=='pending')throw Error('Refresh consumed');
  await this.assertRefreshSlot(jobId,value);
  if(this.ports.now()>=value.expires){if(await this.abandonUnusedRefresh(jobId,value))return{status:'expired' as const,provider:'none' as const};await this.cleanup(jobId,value,'expired');throw Error('Refresh expired');}
  if(!await this.write(jobId,record.revision,{...value,status:'running'}))throw Error('Refresh conflict');
  try{
   await this.ports.kernel.refreshPrepared(jobId,async()=>{
    try{const current=await this.read(jobId,browserNonce);await this.assertRefreshSlot(jobId,value);if(current.record.revision!==record.revision+1||current.value.kind!=='refresh'||current.value.status!=='running'||this.ports.now()>=value.expires)throw Error('Refresh no longer valid');}
    catch{await this.ports.kernel.withdraw(value.link);throw Error('Refresh no longer valid');}
   },perform=>this.ports.responses!.receive(this.responseBinding(jobId,value),perform));
   if(!same(value.binding,await this.binding())||this.ports.now()>=value.expires)throw Error('Refresh no longer valid');
   await this.ports.responses.applied(this.responseBinding(jobId,value));
   if(!await this.write(jobId,record.revision+1,{...value,status:'completed'}))throw Error('Refresh result not confirmed');
  }catch{
   await this.cleanup(jobId,value,'failed').catch(async()=>{await this.ports.kernel.withdraw(value.link).catch(()=>undefined);});
   throw Error('Refresh not confirmed');
  }
  // A lost release acknowledgment does not replay or revoke an already confirmed refresh.
  await this.releaseRefreshSlot(jobId,value);return{status:'completed' as const};
 });}
 async cancel(jobId:string,browserNonce:string){return this.run(async()=>{
  const {value}=await this.read(jobId,browserNonce);
  if(value.kind==='refresh'&&await this.abandonUnusedRefresh(jobId,value))return{status:'cancelled' as const,provider:'none' as const};
  const result=await this.cleanup(jobId,value,'cancelled');
  return{status:'cancelled' as const,provider:result.provider,...(result.exchangeNotStarted?{exchangeNotStarted:true as const}:{})};
 });}
 async recover(jobId:string,browserNonce:string){return this.run(async()=>{
  const {value}=await this.read(jobId,browserNonce);
  if(value.status==='completed'){await this.releaseRefreshSlot(jobId,value);return{status:'completed' as const,provider:'none' as const};}
  if(value.kind==='refresh'&&value.status==='refresh_abandoned'){await this.releaseRefreshSlot(jobId,value);return{status:'expired' as const,provider:'none' as const};}
  if((value.status==='pending'||value.status==='running')&&this.ports.now()<value.expires)throw Error('Request still in progress');
  if(value.kind==='refresh'&&value.status==='pending'&&await this.abandonUnusedRefresh(jobId,value))return{status:'expired' as const,provider:'none' as const};
  return this.cleanup(jobId,value,value.cleanupReason??(this.ports.now()>=value.expires?'expired':'failed'));
 });}
}
