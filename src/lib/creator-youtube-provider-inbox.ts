import 'server-only';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {CreatorAttemptCipher,CreatorAttemptStore,CreatorResponseBinding,CreatorResponsePort} from './creator-youtube-oauth-attempt';
import type {CreatorYouTubeCleanupOutcome} from './creator-youtube-kernel';

const uuid=z.string().uuid().regex(/^[a-f0-9-]+$/),hash=z.string().regex(/^[a-f0-9]{64}$/);
const bindingSchema=z.object({jobId:uuid,link:uuid,ownerBinding:hash,browserBinding:hash,stateHash:hash}).strict();
const answerSchema=z.object({access_token:z.string().min(1).max(8192).optional(),refresh_token:z.string().min(1).max(8192).optional(),channel_id:z.string().max(128).optional(),scopes:z.array(z.string().max(256)).max(20).optional(),expires_at:z.string().max(128).optional()}).strict().refine(v=>!!(v.access_token||v.refresh_token));
const receiptSchema=z.object({purpose:z.literal('creator_youtube_provider_answer_v1'),binding:bindingSchema,status:z.enum(['exchanging','received','uncertain','applied','cleanup_pending','complete']),answer:answerSchema.optional(),outcome:z.enum(['pending','failed','complete','blocked_isolation','uncertain']).optional()}).strict();
type Receipt=z.infer<typeof receiptSchema>;
function capture(value:unknown){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid provider response');
 const raw=value as Record<string,unknown>;
 const fields:Record<string,unknown>={};
 for(const name of ['access_token','refresh_token','channel_id','expires_at'])if(typeof raw[name]==='string')fields[name]=raw[name];
 if(Array.isArray(raw.scopes)&&raw.scopes.every(v=>typeof v==='string'))fields.scopes=raw.scopes;
 return answerSchema.parse(fields);
}

// Local-only sealed receipt boundary. It never exchanges a stored code or activates a grant.
export class CreatorYouTubeProviderInbox implements CreatorResponsePort {
 constructor(private readonly store:CreatorAttemptStore,private readonly cipher:CreatorAttemptCipher,private readonly enabled=false){}
 private async run<T>(fn:()=>Promise<T>){if(!this.enabled)throw Error('creator_response_disabled');try{return await fn();}catch{throw Error('creator_response_not_confirmed');}}
 private receiptId(binding:CreatorResponseBinding){
  bindingSchema.parse(binding);const bytes=createHash('sha256').update('creator-youtube-provider-receipt:'+binding.jobId).digest().subarray(0,16);bytes[6]=(bytes[6]&15)|80;bytes[8]=(bytes[8]&63)|128;
  const s=bytes.toString('hex');return`${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`;
 }
 private async read(binding:CreatorResponseBinding){
  const id=this.receiptId(binding),record=await this.store.read(id);if(!record)return null;
  if(!Number.isSafeInteger(record.revision)||record.revision<1||record.sealed.length>65536)throw Error('Invalid receipt');
  const value=receiptSchema.parse(JSON.parse(await this.cipher.open(id,record.revision,record.sealed)));
  if(JSON.stringify(value.binding)!==JSON.stringify(bindingSchema.parse(binding)))throw Error('Wrong receipt binding');
  return{record,value};
 }
 private async write(binding:CreatorResponseBinding,expected:number|null,value:Receipt){
  receiptSchema.parse(value);const id=this.receiptId(binding),revision=(expected??0)+1;
  return this.store.compareAndSwap(id,expected,{revision,sealed:await this.cipher.seal(id,revision,JSON.stringify(value))});
 }
 async inspect(binding:CreatorResponseBinding){return this.run(async()=>{const current=await this.read(binding);return current?{status:current.value.status,outcome:current.value.outcome??null,hasAnswer:!!current.value.answer}:null;});}
 async receive(binding:CreatorResponseBinding,exchange:()=>Promise<unknown>){return this.run(async()=>{
  bindingSchema.parse(binding);await this.cipher.ready();
  if(await this.read(binding))throw Error('Exchange already reserved');
  if(!await this.write(binding,null,{purpose:'creator_youtube_provider_answer_v1',binding,status:'exchanging'}))throw Error('Exchange already reserved');
  try{
   const raw=await exchange(),answer=capture(raw);
   for(let retry=0;retry<6;retry++){
    const current=await this.read(binding);if(!current||current.value.answer)throw Error('Receipt outcome uncertain');
    const cleanup=current.value.status==='cleanup_pending';
    if(!['exchanging','cleanup_pending','uncertain'].includes(current.value.status))throw Error('Invalid receipt state');
    if(await this.write(binding,current.record.revision,{...current.value,answer,status:cleanup?'cleanup_pending':'received'})){
     if(cleanup)throw Error('Response reserved for cleanup');return raw;
    }
   }
   throw Error('Receipt not confirmed');
  }catch{
   try{const current=await this.read(binding);if(current&&!current.value.answer&&current.value.status==='exchanging')await this.write(binding,current.record.revision,{...current.value,status:'uncertain',outcome:'uncertain'});}catch{/* A missing acknowledgment never permits a second code exchange. */}
   throw Error('Provider response not confirmed');
  }
 });}
 async applied(binding:CreatorResponseBinding){return this.run(async()=>{
  for(let retry=0;retry<6;retry++){
   const current=await this.read(binding);if(!current||!current.value.answer)throw Error('Missing provider receipt');
   if(current.value.status==='applied')return;
   if(current.value.status!=='received')throw Error('Receipt no longer applicable');
   if(await this.write(binding,current.record.revision,{...current.value,status:'applied'}))return;
  }
  throw Error('Receipt conflict');
 });}
 async recover(binding:CreatorResponseBinding,cleanup:(answer:unknown)=>Promise<CreatorYouTubeCleanupOutcome>){return this.run(async()=>{
  for(let retry=0;retry<6;retry++){
   const current=await this.read(binding);if(!current)return 'pending' as const;
   if(!await this.write(binding,current.record.revision,{...current.value,status:'cleanup_pending',outcome:'pending'}))continue;
   let outcome:CreatorYouTubeCleanupOutcome='pending';
   if(current.value.answer){try{outcome=await cleanup(current.value.answer);}catch{outcome='uncertain';}}
   if(!['pending','failed','complete','blocked_isolation','uncertain'].includes(outcome))outcome='uncertain';
   if(await this.write(binding,current.record.revision+1,{...current.value,status:outcome==='complete'?'complete':'cleanup_pending',outcome}))return outcome;
  }
  throw Error('Cleanup receipt not confirmed');
 });}
}
