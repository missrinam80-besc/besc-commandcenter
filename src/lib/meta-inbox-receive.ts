import {z} from 'zod';
import {metaInboxSelection,MetaInboxReadError,type MetaInboxSelection,type MetaInboxReadResult} from './meta-inbox-reader.ts';
import {socialInboxMetaRequirements,socialInboxMessage} from './social-inbox.ts';

const snapshot=z.object({target:metaInboxSelection,authorized:z.literal(true),connected:z.literal(true),revision:z.string().min(1).max(256),scopes:z.array(z.string()).max(200)}).strict();
export type MetaInboxAccess=z.infer<typeof snapshot>;
export type MetaInboxReceivePorts={
 // Must use the real active caller/session and current org/account when wired later.
 authorize:()=>Promise<MetaInboxAccess>;
 credentials:(accountId:string)=>Promise<string>;
 reader:{read:(target:MetaInboxSelection,token:string,signal?:AbortSignal)=>Promise<MetaInboxReadResult>};
 store:(target:MetaInboxSelection,messages:MetaInboxReadResult['messages'])=>Promise<unknown>;
};
export type MetaInboxReceipt={state:'disabled'|'received'|'blocked'|'retry_later'|'attention';reason:string|null;inserted:number|null;received:number|null;skippedOutgoing:number|null;complete:boolean;retryAfterSeconds:number|null};
const stopped=(state:MetaInboxReceipt['state'],reason:string,retryAfterSeconds:number|null=null):MetaInboxReceipt=>({state,reason,inserted:null,received:null,skippedOutgoing:null,complete:false,retryAfterSeconds});
const canonical=(access:MetaInboxAccess)=>JSON.stringify({...access,scopes:[...access.scopes].sort()});

// No runtime factory is installed. The only caller in this package is local tests.
// An empty read is successful only with validated, complete provider responses.
export async function receiveMetaInbox(ports:MetaInboxReceivePorts,enabled=false,signal?:AbortSignal):Promise<MetaInboxReceipt>{
 if(!enabled)return stopped('disabled','disabled');
 let first:MetaInboxAccess;
 try{first=snapshot.parse(await ports.authorize());}catch{return stopped('blocked','access_denied');}
 if(signal?.aborted)return stopped('blocked','cancelled');
 if(socialInboxMetaRequirements(first.target.platform,first.target.kind).some(s=>!first.scopes.includes(s)))return stopped('blocked','permissions_required');
 let read:MetaInboxReadResult;
 try{const token=await ports.credentials(first.target.account_id);read=z.object({messages:z.array(socialInboxMessage).max(50),requests:z.number().int().min(0).max(100),pages:z.number().int().min(0).max(50),skippedOutgoing:z.number().int().min(0).max(1250),complete:z.literal(true)}).strict().parse(await ports.reader.read(first.target,token,signal));}
 catch(e){
  if(e instanceof MetaInboxReadError){
   const retry=['rate_limited','provider_unavailable','timeout'].includes(e.code),blocked=['permissions_required','token_invalid','account_mismatch','resource_mismatch','cancelled','disabled'].includes(e.code);
   return stopped(retry?'retry_later':blocked?'blocked':'attention',e.code,e.retryAfterSeconds);
  }
  return stopped('attention','provider_not_confirmed');
 }
 try{if(canonical(snapshot.parse(await ports.authorize()))!==canonical(first))return stopped('blocked','access_changed');}catch{return stopped('blocked','access_changed');}
 if(signal?.aborted)return stopped('blocked','cancelled');
 try{
  if(!read.complete||read.messages.length>50)throw Error('Incomplete read');
  const stored=read.messages.length?z.object({inserted:z.number().int().min(0).max(read.messages.length)}).strict().parse(await ports.store(first.target,read.messages)):{inserted:0};
  return{state:'received',reason:null,inserted:stored.inserted,received:read.messages.length,skippedOutgoing:read.skippedOutgoing,complete:true,retryAfterSeconds:null};
 }catch{return stopped('attention','storage_not_confirmed');}
}
