import {z} from 'zod';
import {createMetaInboxSessionFactory,MetaInboxReadError,objectId,identity,timestamp,metaInboxPage,hasAttachment,fail,type MetaInboxConfig,type MetaInboxSelection} from './meta-inbox-protocol.ts';
import {socialInboxMessage,type SocialInboxMessage} from './social-inbox.ts';
const cursor=z.string().min(1).max(2048).refine(v=>!/[\r\n]|https?:|access_token=/i.test(v));
const task=z.object({type:z.enum(['conversations','messages','comments']),id:objectId,thread:objectId,participants:z.array(objectId).max(2),expand:z.boolean(),after:cursor.nullable(),used:z.array(cursor).max(10000)}).strict();
export const inboxCheckpoint=z.object({v:z.literal(1),api_version:z.string().regex(/^v\d+\.\d+$/),queue:z.array(task).max(1000),seen:z.array(z.string().min(1).max(800)).max(10000)}).strict();
export type InboxCheckpoint=z.infer<typeof inboxCheckpoint>;
export type InboxPage={messages:SocialInboxMessage[];next:InboxCheckpoint;done:boolean;skippedOutgoing:number};
const key=(t:z.infer<typeof task>)=>t.type+':'+t.id+':'+t.thread;
export function initialInboxCheckpoint(target:MetaInboxSelection,apiVersion:string):InboxCheckpoint{
 const queue:z.infer<typeof task>[]=target.kind==='direct'?[{type:'conversations',id:target.page_id,thread:target.page_id,participants:[],expand:false,after:null,used:[]}]:target.resources.map(id=>({type:'comments',id,thread:id,participants:[],expand:true,after:null,used:[]}));
 return inboxCheckpoint.parse({v:1,api_version:apiVersion,queue,seen:queue.map(key)});
}
export function createResumableInboxReader(config:MetaInboxConfig,transport:typeof fetch,enabled=false){
 const factory=createMetaInboxSessionFactory(config,transport,enabled);
 return{async page(selection:MetaInboxSelection,token:string,checkpoint:InboxCheckpoint,signal?:AbortSignal):Promise<InboxPage>{
  try{
   const state=inboxCheckpoint.parse(checkpoint);if(state.api_version!==config.apiVersion||!state.queue.length)fail('invalid_configuration');
   const connection=await factory.open(selection,token,signal),target=connection.target,t=state.queue[0],queue=state.queue.slice(1),seen=new Set(state.seen),messages=new Map<string,SocialInboxMessage>();let skippedOutgoing=0;
   function enqueue(next:z.infer<typeof task>){const k=key(next);if(!seen.has(k)){seen.add(k);queue.push(next);}}
   function receive(id:string,sender:string,body:string,when:string){const m=socialInboxMessage.parse({thread_id:t.thread,message_id:id,kind:target.kind,sender,body,occurred_at:when}),old=messages.get(id);if(old&&JSON.stringify(old)!==JSON.stringify(m))fail('duplicate_conflict');messages.set(id,m);}
   let path:string,fields:string;const extra:Record<string,string>={};
   if(t.type==='conversations'){
    if(target.kind!=='direct'||t.id!==target.page_id)fail('account_mismatch');
    path=t.id+'/conversations';fields='id,participants';extra.platform=target.platform==='instagram'?'instagram':'messenger';
   }else if(t.type==='messages'){
    if(target.kind!=='direct'||t.id!==t.thread||t.participants.length!==2||!t.participants.includes(target.external_account_id))fail('account_mismatch');
    const owner=z.object({id:objectId,participants:z.object({data:z.array(identity).length(2)})}).parse(await connection.graph(t.id,{fields:'id,participants'}));
    if(owner.id!==t.id||JSON.stringify(owner.participants.data.map(p=>p.id).sort())!==JSON.stringify([...t.participants].sort()))fail('account_mismatch');
    path=t.id+'/messages';fields='id,created_time,from,to,message,attachments';
   }else{
    if(target.kind!=='comment'||!target.resources.includes(t.thread))fail('resource_mismatch');
    const owner=z.object({id:objectId,from:z.object({id:objectId}).optional(),owner:z.object({id:objectId}).optional()}).parse(await connection.graph(t.thread,{fields:target.platform==='instagram'?'id,owner{id}':'id,from{id}'}));
    if(owner.id!==t.thread||(target.platform==='instagram'?owner.owner?.id:owner.from?.id)!==target.external_account_id)fail('resource_mismatch');
    path=t.id+(t.id===t.thread||target.platform==='facebook'?'/comments':'/replies');fields=target.platform==='instagram'?'id,text,timestamp,from{id,username}':'id,message,created_time,from{id,name}';
   }
   const result=metaInboxPage.parse(await connection.graph(path,{...extra,fields,limit:'25',...(t.after?{after:t.after}:{})}));
   let after:string|null=null;
   if(result.paging?.next){
    after=cursor.parse(result.paging.cursors?.after);const link=new URL(result.paging.next);
    if(link.origin!=='https://graph.facebook.com'||link.username||link.password||link.hash||link.pathname!=='/'+config.apiVersion+'/'+path||link.searchParams.get('after')!==after||t.used.includes(after)||after===t.after)fail('pagination_invalid');
   }
   for(const raw of result.data){
    if(t.type==='conversations'){
     const row=z.object({id:objectId,participants:z.object({data:z.array(identity).length(2)})}).parse(raw),participants=row.participants.data.map(p=>p.id);
     if(new Set(participants).size!==2||!participants.includes(target.external_account_id))fail('account_mismatch');
     enqueue({type:'messages',id:row.id,thread:row.id,participants,expand:false,after:null,used:[]});
    }else if(t.type==='messages'){
     const m=z.object({id:objectId,created_time:timestamp,from:identity,to:z.object({data:z.array(identity).length(1)}),message:z.string().max(8000).optional(),attachments:z.unknown().optional(),shares:z.unknown().optional(),is_deleted:z.boolean().optional(),is_unsupported:z.boolean().optional()}).parse(raw);
     if(!t.participants.includes(m.from.id)||!t.participants.includes(m.to.data[0].id)||m.from.id===m.to.data[0].id)fail('account_mismatch');
     if(m.from.id===target.external_account_id){skippedOutgoing++;continue;}
     if(m.to.data[0].id!==target.external_account_id)fail('account_mismatch');if(m.is_deleted||m.is_unsupported||hasAttachment(m.attachments)||hasAttachment(m.shares)||!m.message?.trim())fail('unsupported_message');
     receive(m.id,m.from.name?.trim()||m.from.username?.trim()||'Onbekende afzender',m.message,m.created_time);
    }else{
     const m=z.object({id:objectId,from:identity,text:z.string().max(8000).optional(),message:z.string().max(8000).optional(),timestamp:timestamp.optional(),created_time:timestamp.optional(),attachment:z.unknown().optional(),is_hidden:z.boolean().optional()}).parse(raw);
     if(m.id===t.id||m.id===t.thread)fail('invalid_response');if(m.attachment!==undefined&&m.attachment!==null||m.is_hidden)fail('unsupported_message');
     const body=target.platform==='instagram'?m.text:m.message,when=target.platform==='instagram'?m.timestamp:m.created_time;if(!body?.trim()||!when)fail('unsupported_message');
     if(m.from.id===target.external_account_id)skippedOutgoing++;else receive(m.id,m.from.name?.trim()||m.from.username?.trim()||'Onbekende afzender',body,when);
     if(t.expand)enqueue({type:'comments',id:m.id,thread:t.thread,participants:[],expand:target.platform==='facebook',after:null,used:[]});
    }
   }
   if(after)queue.push({...t,after,used:[...t.used,after]});
   const next=inboxCheckpoint.parse({...state,queue,seen:[...seen]});if(JSON.stringify(next).length>1000000)fail('limit_reached');if(signal?.aborted)fail('cancelled');
   return{messages:[...messages.values()],next,done:queue.length===0,skippedOutgoing};
  }catch(e){if(e instanceof MetaInboxReadError)throw e;throw new MetaInboxReadError('invalid_response');}
 }};
}
