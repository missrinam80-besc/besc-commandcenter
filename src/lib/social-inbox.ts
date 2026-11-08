import {z} from 'zod';

export const inboxStatuses={open:'Open',in_progress:'In behandeling',waiting:'Wachten',resolved:'Intern afgehandeld'} as const;
export const inboxOperations={received:'Bericht ontvangen',reopened:'Heropend na nieuw bericht',assigned:'Toewijzing gewijzigd',status:'Status gewijzigd',note:'Interne notitie'} as const;
export const socialInboxMessage=z.object({thread_id:z.string().min(1).max(256),message_id:z.string().min(1).max(256),kind:z.enum(['direct','comment']),sender:z.string().trim().min(1).max(200),body:z.string().min(1).max(8000).refine(s=>s.trim().length>0),occurred_at:z.iso.datetime({offset:true})}).strict();
export type SocialInboxMessage=z.infer<typeof socialInboxMessage>;
const externalId=z.string().regex(/^[A-Za-z0-9_.:-]{1,256}$/);
const target=z.object({organization_id:z.uuid(),account_id:z.uuid(),platform:z.enum(['facebook','instagram']),external_account_id:externalId}).strict();
export type SocialInboxTarget=z.infer<typeof target>;

// These are candidate requirements for the existing Facebook Login path, not a
// proof of live App Review, Page tasks, scoped grants or provider acceptance.
export function socialInboxMetaRequirements(platform:'facebook'|'instagram',kind:'direct'|'comment'){
 if(kind==='direct')return platform==='instagram'?['instagram_basic','instagram_manage_messages','pages_manage_metadata']:['pages_messaging','pages_manage_metadata','pages_read_engagement'];
 return platform==='instagram'?['instagram_basic','instagram_manage_comments','pages_read_engagement']:['pages_read_engagement','pages_read_user_content'];
}
export function socialInboxCapability(platform:'facebook'|'instagram',kind:'direct'|'comment',scopes:readonly string[]){
 const missing=socialInboxMetaRequirements(platform,kind).filter(s=>!scopes.includes(s));return{missing,liveVerified:false};
}

// Offline response adapter: no fetch, token reader, OAuth, webhook or send port.
// A future live adapter must establish account ownership and permission independently.
export function normalizeMetaInboxFixture(expected:SocialInboxTarget,input:unknown):SocialInboxMessage[]{
 const bound=target.parse(expected);
 const envelope=z.object({mode:z.literal('fixture'),label:z.literal('TESTFIXTURE - NIET PUBLICEREN'),account:target,kind:z.enum(['direct','comment']),thread_id:externalId,response:z.object({data:z.array(z.unknown()).max(50)}).strict()}).strict().parse(input);
 if(JSON.stringify(envelope.account)!==JSON.stringify(bound)){
  for(const key of ['organization_id','account_id','platform','external_account_id'] as const)if(envelope.account[key]!==bound[key])throw Error('social_inbox_target_mismatch');
 }
 const rows:SocialInboxMessage[]=[];const seen=new Map<string,string>();
 for(const raw of envelope.response.data){
  const common={id:externalId,created_time:z.iso.datetime({offset:true}),from:z.object({id:externalId,name:z.string().min(1).max(200)}).strict()};
  let sender:string,body:string,id:string,created:string;
  if(envelope.kind==='direct'){
   const row=z.object({...common,message:z.string().min(1).max(8000),to:z.object({data:z.array(z.object({id:externalId}).strict()).length(1)}).strict()}).strict().parse(raw);
   if(row.to.data[0].id!==bound.external_account_id||row.from.id===bound.external_account_id)throw Error('social_inbox_incoming_required');
   ({id,message:body,created_time:created}=row);sender=row.from.name;
  }else{
   const row=z.object({...common,text:z.string().min(1).max(8000)}).strict().parse(raw);
   if(row.from.id===bound.external_account_id)throw Error('social_inbox_incoming_required');
   ({id,text:body,created_time:created}=row);sender=row.from.name;
  }
  const message=socialInboxMessage.parse({thread_id:envelope.thread_id,message_id:id,kind:envelope.kind,sender,body,occurred_at:created});
  const serialized=JSON.stringify(message),old=seen.get(id);if(old&&old!==serialized)throw Error('social_inbox_duplicate_conflict');
  if(!old)rows.push(message);seen.set(id,serialized);
 }
 return rows;
}

export async function importMetaInboxFixture(expected:SocialInboxTarget,input:unknown,store:(target:SocialInboxTarget,messages:SocialInboxMessage[])=>Promise<unknown>){
 // Validate the entire response before touching storage. No partial import on error.
 const messages=normalizeMetaInboxFixture(expected,input);if(messages.length===0)return{inserted:0};
 return store(target.parse(expected),messages);
}

export const inboxRow=z.object({id:z.uuid(),created_at:z.string(),platform:z.enum(['facebook','instagram']),kind:z.enum(['direct','comment']),status:z.enum(['open','in_progress','waiting','resolved']),revision:z.number().int().nonnegative(),assignee_id:z.uuid().nullable(),last_message_at:z.string(),account_name:z.string(),preview:z.string().nullable()});
export const inboxDetail=inboxRow.omit({preview:true}).extend({account_id:z.uuid(),messages:z.array(z.object({id:z.uuid(),sender:z.string(),body:z.string(),occurred_at:z.string()})).max(51),events:z.array(z.object({id:z.number().int().positive(),operation:z.enum(['received','reopened','assigned','status','note']),actor_id:z.uuid().nullable(),detail:z.record(z.string(),z.unknown()),created_at:z.string()})).max(51)});
