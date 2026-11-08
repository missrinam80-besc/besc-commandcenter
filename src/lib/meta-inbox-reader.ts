import {socialInboxMessage,type SocialInboxMessage} from './social-inbox.ts';
import {z} from 'zod';
import {createMetaInboxSessionFactory,MetaInboxReadError,objectId,identity,timestamp,metaInboxPage,accountId,hasAttachment,fail,type MetaInboxSelection,type MetaInboxConfig,type MetaInboxReadResult} from './meta-inbox-protocol.ts';
export {MetaInboxReadError,metaInboxSelection} from './meta-inbox-protocol.ts';
export type {MetaInboxSelection,MetaInboxProblem,MetaInboxReadResult} from './meta-inbox-protocol.ts';

export function createMetaInboxReader(config:MetaInboxConfig,transport:typeof fetch,enabled=false){
 const factory=createMetaInboxSessionFactory(config,transport,enabled),cfg=factory.limits,origin='https://graph.facebook.com';
 return{
  async read(selection:MetaInboxSelection,accessToken:string,signal?:AbortSignal):Promise<MetaInboxReadResult>{
   let pages=0,skippedOutgoing=0;const messages=new Map<string,SocialInboxMessage>();
   try{
    const connection=await factory.open(selection,accessToken,signal),{target,graph}=connection;
    // Build each next request ourselves. Provider next URLs are untrusted and never fetched.
    async function* edge(path:string,parameters:Record<string,string>){
     let after:string|undefined;const cursors=new Set<string>();
     for(;;){
      if(++pages>cfg.maxPages)fail('limit_reached');
      const raw=await graph(path,{...parameters,limit:'25',...(after?{after}:{})});const result=metaInboxPage.parse(raw);
      yield result.data;
      const next=result.paging?.next;if(!next)return;
      after=result.paging?.cursors?.after;if(!after||cursors.has(after))fail('pagination_invalid');
      let link:URL;try{link=new URL(next);}catch{fail('pagination_invalid');}
      if(link.origin!==origin||link.username||link.password||link.hash||link.pathname!=='/'+cfg.apiVersion+'/'+path||link.searchParams.get('after')!==after)fail('pagination_invalid');
      cursors.add(after);
     }
    }
    function receive(thread:string,id:string,sender:string,body:string,occurred:string){
     const m=socialInboxMessage.parse({thread_id:thread,message_id:id,kind:target.kind,sender,body,occurred_at:occurred});const old=messages.get(id);
     if(old&&JSON.stringify(old)!==JSON.stringify(m))fail('duplicate_conflict');
     messages.set(id,m);if(messages.size>cfg.maxMessages)fail('limit_reached');
    }
    if(target.kind==='direct'){
     const conversations=new Set<string>();
     for await(const rows of edge(target.page_id+'/conversations',{platform:target.platform==='instagram'?'instagram':'messenger',fields:'id,participants'}))for(const raw of rows){
      const conversation=z.object({id:objectId,participants:z.object({data:z.array(identity).min(2).max(2)})}).parse(raw);
      const participants=conversation.participants.data.map(p=>p.id);if(new Set(participants).size!==2||!participants.includes(target.external_account_id))fail('account_mismatch');
      if(conversations.has(conversation.id))continue;conversations.add(conversation.id);
      for await(const records of edge(conversation.id+'/messages',{fields:'id,created_time,from,to,message,attachments'}))for(const record of records){
       const m=z.object({id:objectId,created_time:timestamp,from:identity,to:z.object({data:z.array(identity).length(1)}),message:z.string().max(8000).optional(),attachments:z.unknown().optional(),shares:z.unknown().optional(),is_deleted:z.boolean().optional(),is_unsupported:z.boolean().optional()}).parse(record);
       if(!participants.includes(m.from.id)||!participants.includes(m.to.data[0].id)||m.to.data[0].id===m.from.id)fail('account_mismatch');
       if(m.from.id===target.external_account_id){skippedOutgoing++;continue;}
       if(m.to.data[0].id!==target.external_account_id)fail('account_mismatch');
       if(m.is_deleted||m.is_unsupported||hasAttachment(m.attachments)||hasAttachment(m.shares)||!m.message?.trim())fail('unsupported_message');
       receive(conversation.id,m.id,m.from.name?.trim()||m.from.username?.trim()||'Onbekende afzender',m.message,m.created_time);
      }
     }
    }else for(const resource of target.resources){
     const owner=z.object({id:objectId,from:z.object({id:accountId}).optional(),owner:z.object({id:accountId}).optional()}).parse(await graph(resource,{fields:target.platform==='instagram'?'id,owner{id}':'id,from{id}'}));
     if(owner.id!==resource||(target.platform==='instagram'?owner.owner?.id:owner.from?.id)!==target.external_account_id)fail('resource_mismatch');
     const visited=new Set<string>(),queue=[resource];
     while(queue.length){
      const parent=queue.shift()!,path=parent===resource||target.platform==='facebook'?parent+'/comments':parent+'/replies';
      for await(const rows of edge(path,{fields:target.platform==='instagram'?'id,text,timestamp,from{id,username}':'id,message,created_time,from{id,name}'}))for(const raw of rows){
       const c=z.object({id:objectId,from:identity,text:z.string().max(8000).optional(),message:z.string().max(8000).optional(),timestamp:timestamp.optional(),created_time:timestamp.optional(),attachment:z.unknown().optional(),is_hidden:z.boolean().optional()}).parse(raw);
       if(c.attachment!==undefined&&c.attachment!==null||c.is_hidden)fail('unsupported_message');
       if(c.id===parent||c.id===resource)fail('invalid_response');
       const body=target.platform==='instagram'?c.text:c.message,when=target.platform==='instagram'?c.timestamp:c.created_time;if(!body?.trim()||!when)fail('unsupported_message');
       if(c.from.id===target.external_account_id)skippedOutgoing++;else receive(resource,c.id,c.from.name?.trim()||c.from.username?.trim()||'Onbekende afzender',body,when);
       if(!visited.has(c.id)){visited.add(c.id);if(parent===resource||target.platform==='facebook')queue.push(c.id);}
      }
     }
    }
    if(signal?.aborted)fail('cancelled');
    return{messages:[...messages.values()],requests:connection.requests,pages,skippedOutgoing,complete:true};
   }catch(e){if(e instanceof MetaInboxReadError)throw e;throw new MetaInboxReadError('invalid_response');}
  },
 };
}
