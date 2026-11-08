import {z} from 'zod';
import {MetaInboxReadError,metaInboxSelection,type MetaInboxSelection} from './meta-inbox-protocol.ts';
import {inboxCheckpoint,type InboxCheckpoint,type InboxPage} from './resumable-inbox-page.ts';
import {socialInboxMessage} from './social-inbox.ts';
type Ports={server:(job:string,action:'claim'|'commit'|'receipt'|'fail',data?:Record<string,unknown>)=>Promise<unknown>;credentials:(account:string)=>Promise<string>;reader:{page:(target:MetaInboxSelection,token:string,checkpoint:InboxCheckpoint,signal?:AbortSignal)=>Promise<InboxPage>}};
const claimed=z.object({state:z.literal('processing'),id:z.uuid(),target:metaInboxSelection,checkpoint:inboxCheckpoint,revision:z.number().int().nonnegative(),nonce:z.uuid()});
const receipt=z.object({id:z.uuid(),state:z.enum(['pending','completed']),revision:z.number().int().positive(),inserted:z.number().int().min(0).max(25),nonce:z.uuid()});
export type InboxStepResult={state:'disabled'|'skipped'|'blocked'|'pending'|'completed'|'retry_wait'|'attention'|'unconfirmed';inserted:number|null;recovered?:boolean};
export async function runInboxStep(job:string,ports:Ports,enabled=false,signal?:AbortSignal):Promise<InboxStepResult>{
 if(!enabled)return{state:'disabled',inserted:null};if(signal?.aborted)return{state:'skipped',inserted:null};
 let claim:z.infer<typeof claimed>;
 try{
  const answer=await ports.server(z.uuid().parse(job),'claim');const skip=z.object({state:z.enum(['skipped','blocked'])}).safeParse(answer);if(skip.success)return{state:skip.data.state,inserted:null};
  claim=claimed.parse(answer);if(claim.id!==job)throw Error('Job mismatch');
 }catch{return{state:'unconfirmed',inserted:null};}
 async function failure(reason:string,retry:number|null=null):Promise<InboxStepResult>{
  try{const r=z.object({state:z.enum(['retry_wait','attention','blocked'])}).parse(await ports.server(job,'fail',{nonce:claim.nonce,revision:claim.revision,reason,retry_after:retry??60}));return{state:r.state,inserted:null};}catch{return{state:'unconfirmed',inserted:null};}
 }
 let token:string;try{token=await ports.credentials(claim.target.account_id);}catch{return failure('credentials_unavailable');}
 let page:InboxPage;
 try{
  page=z.object({messages:z.array(socialInboxMessage).max(25),next:inboxCheckpoint,done:z.boolean(),skippedOutgoing:z.number().int().min(0).max(25)}).strict().parse(await ports.reader.page(claim.target,token,claim.checkpoint,signal));
  if(page.done!==(page.next.queue.length===0))throw Error('Invalid continuation');
 }catch(e){return failure(e instanceof MetaInboxReadError?e.code==='disabled'||e.code==='invalid_configuration'?'invalid_response':e.code:'invalid_response',e instanceof MetaInboxReadError?e.retryAfterSeconds:null);}
 if(signal?.aborted)return failure('cancelled');
 try{
  const raw=await ports.server(job,'commit',{nonce:claim.nonce,revision:claim.revision,messages:page.messages,next:page.next,done:page.done,skipped:page.skippedOutgoing});
  const stop=z.object({state:z.enum(['blocked','attention'])}).safeParse(raw);if(stop.success)return{state:stop.data.state,inserted:null};
  const r=receipt.parse(raw);if(r.id!==job||r.nonce!==claim.nonce||r.revision!==claim.revision+1)throw Error('Receipt mismatch');return{state:r.state,inserted:r.inserted};
 }catch{
  // An unknown commit outcome must not trigger a second read or write. A
  // durable receipt remains readable even after a later worker has progressed.
  try{const r=receipt.parse(await ports.server(job,'receipt',{nonce:claim.nonce}));if(r.id!==job||r.nonce!==claim.nonce||r.revision!==claim.revision+1)throw Error('Receipt mismatch');return{state:r.state,inserted:r.inserted,recovered:true};}catch{return{state:'unconfirmed',inserted:null};}
 }
}
