import {z} from 'zod';
import {socialInboxMessage,socialInboxMetaRequirements,type SocialInboxMessage} from './social-inbox.ts';

const objectId=z.string().regex(/^[A-Za-z0-9_.:-]{1,256}$/).refine(v=>v!=='.'&&v!=='..');
const accountId=z.string().regex(/^[0-9]{1,64}$/);
export const metaInboxSelection=z.object({
 organization_id:z.uuid(),account_id:z.uuid(),platform:z.enum(['facebook','instagram']),
 external_account_id:accountId,page_id:accountId,kind:z.enum(['direct','comment']),
 // Comments are restricted to these explicitly selected, verified owned objects.
 resources:z.array(objectId).max(5).default([]),
}).strict().superRefine((t,ctx)=>{
 if(t.platform==='facebook'&&t.external_account_id!==t.page_id)ctx.addIssue({code:'custom',message:'Page binding required'});
 if(t.kind==='direct'&&t.resources.length||t.kind==='comment'&&!t.resources.length||new Set(t.resources).size!==t.resources.length)ctx.addIssue({code:'custom',message:'Explicit resource selection required'});
});
export type MetaInboxSelection=z.infer<typeof metaInboxSelection>;
export type MetaInboxProblem='disabled'|'invalid_configuration'|'permissions_required'|'token_invalid'|'account_mismatch'|'resource_mismatch'|'invalid_response'|'unsupported_message'|'pagination_invalid'|'limit_reached'|'rate_limited'|'provider_unavailable'|'timeout'|'cancelled'|'response_too_large'|'duplicate_conflict';
export class MetaInboxReadError extends Error{
 readonly code:MetaInboxProblem;readonly retryAfterSeconds:number|null;
 constructor(code:MetaInboxProblem,retryAfterSeconds:number|null=null){super('meta_inbox_'+code);this.name='MetaInboxReadError';this.code=code;this.retryAfterSeconds=retryAfterSeconds;}
}
function fail(code:MetaInboxProblem):never{throw new MetaInboxReadError(code);}
const identity=z.object({id:objectId,name:z.string().max(200).optional(),username:z.string().max(200).optional()});
const timestamp=z.string().min(1).max(40).transform(v=>v.replace(/([+-]\d{2})(\d{2})$/,'$1:$2')).pipe(z.iso.datetime({offset:true})).transform(v=>new Date(v).toISOString());
const page=z.object({data:z.array(z.unknown()).max(25),paging:z.object({next:z.string().max(8192).optional(),cursors:z.object({after:z.string().min(1).max(2048).optional()}).optional()}).optional()});
export type MetaInboxReadResult={messages:SocialInboxMessage[];requests:number;pages:number;skippedOutgoing:number;complete:true};
type Config={apiVersion:string;appId:string;appSecret:string;timeoutMs?:number;maxRequests?:number;maxPages?:number;maxMessages?:number};

function abortable<T>(promise:Promise<T>,signal:AbortSignal):Promise<T>{
 return new Promise((resolve,reject)=>{
  const abort=()=>reject(new Error('aborted'));if(signal.aborted){abort();return;}
  signal.addEventListener('abort',abort,{once:true});
  promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
 });
}
function quotaHigh(headers:Headers){
 for(const key of ['x-app-usage','x-page-usage','x-business-use-case-usage']){
  const raw=headers.get(key);if(!raw)continue;if(raw.length>4096)return true;
  try{
   const visit=(v:unknown,depth=0):boolean=>depth>8||Boolean(v&&typeof v==='object'&&Object.entries(v).some(([k,x])=>['call_count','total_cputime','total_time'].includes(k)?typeof x==='number'&&x>=95:visit(x,depth+1)));
   if(visit(JSON.parse(raw)))return true;
  }catch{return true;}
 }
 return false;
}
function hasAttachment(value:unknown){
 if(value===undefined||value===null)return false;
 const empty=z.object({data:z.array(z.unknown()).length(0)}).strict().safeParse(value);return !empty.success;
}

// Facebook Login only. No ambient fetch, token storage, OAuth, cron or send port.
// Construction and every use require explicit local opt-in. This is not wired to a route.
export function createMetaInboxReader(config:Config,transport:typeof fetch,enabled=false){
 if(!enabled)fail('disabled');
 const parsed=z.object({apiVersion:z.string().regex(/^v\d+\.\d+$/),appId:accountId,appSecret:z.string().min(1),timeoutMs:z.number().int().min(1).max(30000).default(10000),maxRequests:z.number().int().min(3).max(100).default(40),maxPages:z.number().int().min(1).max(50).default(20),maxMessages:z.number().int().min(1).max(50).default(50)}).safeParse(config);
 if(!parsed.success||typeof transport!=='function')fail('invalid_configuration');
 const cfg=parsed.data,origin='https://graph.facebook.com';
 return{
  async read(selection:MetaInboxSelection,accessToken:string,signal?:AbortSignal):Promise<MetaInboxReadResult>{
   let requests=0,pages=0,skippedOutgoing=0;const messages=new Map<string,SocialInboxMessage>();
   try{
    const target=metaInboxSelection.parse(selection);if(!accessToken||/[\r\n]/.test(accessToken))fail('token_invalid');
    const root=new AbortController();if(signal?.aborted)fail('cancelled');
    const required=socialInboxMetaRequirements(target.platform,target.kind);
    async function graph(path:string,parameters:Record<string,string>={},appToken=false){
     if(signal?.aborted)fail('cancelled');if(++requests>cfg.maxRequests)fail('limit_reached');
     const url=new URL('/'+cfg.apiVersion+'/'+path,origin);for(const [key,value]of Object.entries(parameters))url.searchParams.set(key,value);
     const timer=new AbortController(),combined=AbortSignal.any([timer.signal,root.signal,...(signal?[signal]:[])]),timeout=setTimeout(()=>timer.abort(),cfg.timeoutMs);
     let reader:ReadableStreamDefaultReader<Uint8Array>|undefined,response:Response|undefined;
     try{
      const pending=transport(url.href,{method:'GET',headers:{Authorization:'Bearer '+(appToken?cfg.appId+'|'+cfg.appSecret:accessToken)},redirect:'error',cache:'no-store',signal:combined}).then(r=>{if(combined.aborted&&r.body)void r.body.cancel().catch(()=>{});return r;});
      response=await abortable(pending,combined);
      if(response.status>=300&&response.status<400)fail('invalid_response');
      // A redirect-following custom transport must not change authority or path.
      if(response.redirected||response.url&&response.url!==url.href)fail('invalid_response');
      if(response.status===429||quotaHigh(response.headers)){
       const after=Number(response.headers.get('retry-after'));throw new MetaInboxReadError('rate_limited',Number.isFinite(after)&&after>0?Math.min(3600,Math.ceil(after)):60);
      }
      if(response.status===401)fail('token_invalid');if(response.status===403)fail('permissions_required');
      if(response.status>=500)throw new MetaInboxReadError('provider_unavailable',60);
      reader=response.body?.getReader();if(!reader)fail('invalid_response');
      const chunks:Uint8Array[]=[];let size=0;
      for(;;){const part=await abortable(reader.read(),combined);if(part.done)break;size+=part.value.length;if(size>262144)fail('response_too_large');chunks.push(part.value);}
      const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      let body:unknown;try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{fail('invalid_response');}
      const error=z.object({error:z.object({code:z.number().optional()})}).safeParse(body);
      const code=error.success?error.data.error.code:undefined;
      if(response.status===429||[4,17,32,613].includes(code??-1)||quotaHigh(response.headers)){
       const after=Number(response.headers.get('retry-after'));throw new MetaInboxReadError('rate_limited',Number.isFinite(after)&&after>0?Math.min(3600,Math.ceil(after)):60);
      }
      if(response.status===401||code===190)fail('token_invalid');
      if(response.status===403||code===10||code===200)fail('permissions_required');
      if(response.status>=500)throw new MetaInboxReadError('provider_unavailable',60);
      if(!response.ok||error.success)fail('invalid_response');return body;
     }catch(e){
      if(signal?.aborted)fail('cancelled');if(timer.signal.aborted)fail('timeout');
      if(e instanceof MetaInboxReadError)throw e;fail('provider_unavailable');
     }finally{clearTimeout(timeout);timer.abort();if(reader)void reader.cancel().catch(()=>{});else if(response?.body)void response.body.cancel().catch(()=>{});}
    }
    // Build each next request ourselves. Provider next URLs are untrusted and never fetched.
    async function* edge(path:string,parameters:Record<string,string>){
     let after:string|undefined;const cursors=new Set<string>();
     for(;;){
      if(++pages>cfg.maxPages)fail('limit_reached');
      const raw=await graph(path,{...parameters,limit:'25',...(after?{after}:{})});const result=page.parse(raw);
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
    const token=z.object({data:z.object({is_valid:z.literal(true),app_id:accountId,type:z.literal('PAGE'),profile_id:accountId,scopes:z.array(z.string()).max(200),expires_at:z.number().int().nonnegative(),data_access_expires_at:z.number().int().nonnegative().optional()})}).safeParse(await graph('debug_token',{input_token:accessToken},true));
    if(!token.success)fail('token_invalid');const proof=token.data.data;
    if(proof.app_id!==cfg.appId||proof.profile_id!==target.page_id)fail('account_mismatch');
    const expires=(n:number)=>n!==0&&n<Date.now()/1000+120;if(expires(proof.expires_at)||proof.data_access_expires_at!==undefined&&expires(proof.data_access_expires_at))fail('token_invalid');
    if(required.some(s=>!proof.scopes.includes(s)))fail('permissions_required');
    const account=z.object({id:accountId,instagram_business_account:z.object({id:accountId}).optional()}).parse(await graph(target.page_id,{fields:target.platform==='instagram'?'id,instagram_business_account{id}':'id'}));
    if(account.id!==target.page_id||target.platform==='instagram'&&account.instagram_business_account?.id!==target.external_account_id)fail('account_mismatch');
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
    return{messages:[...messages.values()],requests,pages,skippedOutgoing,complete:true};
   }catch(e){if(e instanceof MetaInboxReadError)throw e;throw new MetaInboxReadError('invalid_response');}
  },
 };
}
