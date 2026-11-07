import 'server-only';
import {createCipheriv,createDecipheriv,randomBytes,randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {CreatorAttemptCipher,CreatorAttemptStore} from './creator-youtube-oauth-attempt';

const uuid=z.string().uuid();
const keySchema=z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const ringSchema=z.object({format:z.literal(1),active:uuid,legacy:uuid.nullable(),keys:z.array(z.object({id:uuid,requestId:uuid,material:keySchema}).strict()).min(1).max(32)}).strict();
type Ring=z.infer<typeof ringSchema>;
const envelopeSchema=z.object({version:z.literal(2),keyId:uuid,iv:z.string().length(16),tag:z.string().length(22),ciphertext:z.string().max(12000)}).strict();
const magic=Buffer.from('BESCYT02');

function decode(value:string){if(!/^[A-Za-z0-9_-]*$/.test(value))throw Error('Invalid encoding');const b=Buffer.from(value,'base64url');if(b.toString('base64url')!==value)throw Error('Invalid encoding');return b;}
function encrypt(key:Buffer,aad:string,plaintext:string){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(aad));
 return{iv,tag:()=>cipher.getAuthTag(),ciphertext:Buffer.concat([cipher.update(plaintext,'utf8'),cipher.final()])};
}
function decrypt(key:Buffer,aad:string,iv:Buffer,tag:Buffer,ciphertext:Buffer){
 if(iv.length!==12||tag.length!==16)throw Error('Invalid encryption envelope');
 const decipher=createDecipheriv('aes-256-gcm',key,iv);decipher.setAAD(Buffer.from(aad));decipher.setAuthTag(tag);
 return Buffer.concat([decipher.update(ciphertext),decipher.final()]).toString('utf8');
}

// Explicit local wrapped data-key ring. The wrapping key comes from a separate trusted source.
// Never automatically initialized, selected, exported or pruned; no OS/Cloud key service is accessed.
export class CreatorYouTubeKeyring implements CreatorAttemptCipher {
 readonly #wrappingKey:Buffer;
 private constructor(private readonly store:CreatorAttemptStore,wrappingKey:Uint8Array,private readonly ringId:string){
  uuid.parse(ringId);if(!wrappingKey||wrappingKey.length!==32)throw Error('Invalid wrapping key');this.#wrappingKey=Buffer.from(wrappingKey);
 }
 private async run<T>(fn:()=>Promise<T>):Promise<T>{try{return await fn();}catch{throw Error('creator_keyring_unavailable');}}
 static async initialize(store:CreatorAttemptStore,wrappingKey:Uint8Array,ringId:string,legacyKey?:Uint8Array){
  try{
   const ring=new CreatorYouTubeKeyring(store,wrappingKey,ringId),id=randomUUID();
   if(legacyKey&&legacyKey.length!==32)throw Error('Invalid legacy key');
   const state:Ring={format:1,active:id,legacy:legacyKey?id:null,keys:[{id,requestId:ringId,material:Buffer.from(legacyKey??randomBytes(32)).toString('base64url')}]};
   if(!await ring.#write(null,state))throw Error('Already initialized');return ring;
  }catch{throw Error('creator_keyring_unavailable');}
 }
 static async open(store:CreatorAttemptStore,wrappingKey:Uint8Array,ringId:string){
  try{const ring=new CreatorYouTubeKeyring(store,wrappingKey,ringId);await ring.ready();return ring;}catch{throw Error('creator_keyring_unavailable');}
 }
 async #read(){
  const record=await this.store.read(this.ringId);
  if(!record||!Number.isSafeInteger(record.revision)||record.revision<1||record.sealed.length>16000)throw Error('Missing ring');
  const bytes=decode(record.sealed);
  const state=ringSchema.parse(JSON.parse(decrypt(this.#wrappingKey,`creator-youtube-keyring:${this.ringId}:${record.revision}`,bytes.subarray(0,12),bytes.subarray(12,28),bytes.subarray(28))));
  const ids=state.keys.map(k=>k.id),requests=state.keys.map(k=>k.requestId);
  if(new Set(ids).size!==ids.length||new Set(requests).size!==requests.length||!ids.includes(state.active)||state.legacy!==null&&!ids.includes(state.legacy)||state.keys.some(k=>decode(k.material).length!==32))throw Error('Invalid ring');
  return{revision:record.revision,state};
 }
 async #write(expected:number|null,state:Ring){
  const revision=(expected??0)+1;ringSchema.parse(state);
  const encrypted=encrypt(this.#wrappingKey,`creator-youtube-keyring:${this.ringId}:${revision}`,JSON.stringify(state));
  const sealed=Buffer.concat([encrypted.iv,encrypted.tag(),encrypted.ciphertext]).toString('base64url');
  if(sealed.length>16000)throw Error('Ring size exceeded');
  return this.store.compareAndSwap(this.ringId,expected,{revision,sealed});
 }
 async ready(){return this.run(async()=>{await this.#read();});}
 async describe(){return this.run(async()=>{const {revision,state}=await this.#read();return{revision,activeKeyId:state.active,readableKeyIds:state.keys.map(k=>k.id),legacyReadable:state.legacy!==null};});}
 async rotate(requestId:string){return this.run(async()=>{
  uuid.parse(requestId);
  for(let retry=0;retry<8;retry++){
   const {revision,state}=await this.#read(),previous=state.keys.find(k=>k.requestId===requestId);
   if(previous)return{revision,keyId:previous.id,activeKeyId:state.active,replay:true};
   if(state.keys.length>=32)throw Error('Retention decision required before further rotation');
   const id=randomUUID(),next:Ring={...state,active:id,keys:[...state.keys,{id,requestId,material:randomBytes(32).toString('base64url')}]};
   if(await this.#write(revision,next))return{revision:revision+1,keyId:id,activeKeyId:id,replay:false};
  }
  throw Error('Rotation conflict');
 });}
 private validateBinding(id:string,revision:number){uuid.parse(id);if(!Number.isSafeInteger(revision)||revision<1)throw Error('Invalid request binding');}
 async seal(id:string,revision:number,plaintext:string){return this.run(async()=>{
  this.validateBinding(id,revision);if(Buffer.byteLength(plaintext,'utf8')>8000)throw Error('Payload too large');
  const {state}=await this.#read(),key=state.keys.find(k=>k.id===state.active)!;
  const encrypted=encrypt(decode(key.material),`creator-youtube-attempt:v2:${this.ringId}:${id}:${revision}:${key.id}`,plaintext);
  const envelope={version:2,keyId:key.id,iv:encrypted.iv.toString('base64url'),tag:encrypted.tag().toString('base64url'),ciphertext:encrypted.ciphertext.toString('base64url')};
  const sealed=Buffer.concat([magic,Buffer.from(JSON.stringify(envelope))]).toString('base64url');
  if(sealed.length>16000)throw Error('Payload too large');return sealed;
 });}
 async open(id:string,revision:number,sealed:string){return this.run(async()=>{
  this.validateBinding(id,revision);if(sealed.length>16000)throw Error('Payload too large');
  const {state}=await this.#read(),bytes=decode(sealed);
  if(!bytes.subarray(0,magic.length).equals(magic)){
   const key=state.keys.find(k=>k.id===state.legacy);if(!key)throw Error('Legacy key not configured');
   return decrypt(decode(key.material),`creator-youtube-attempt:${id}:${revision}`,bytes.subarray(0,12),bytes.subarray(12,28),bytes.subarray(28));
  }
  const envelope=envelopeSchema.parse(JSON.parse(bytes.subarray(magic.length).toString('utf8'))),key=state.keys.find(k=>k.id===envelope.keyId);
  if(!key)throw Error('Unknown key');
  return decrypt(decode(key.material),`creator-youtube-attempt:v2:${this.ringId}:${id}:${revision}:${key.id}`,decode(envelope.iv),decode(envelope.tag),decode(envelope.ciphertext));
 });}
}
