import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {z} from 'zod';
import type {CreatorYouTubePorts} from './creator-youtube-kernel';

const id=z.string().uuid();
const summary=z.object({id,status:z.enum(['pending','active','revoked']),provider_revocation:z.enum(['none','pending','failed','complete']),channel_id:z.string(),valid_until:z.string(),retain_until:z.string()});
const consent=z.object({purpose:z.string(),channel_id:z.string(),video_ids:z.array(z.string()),start_date:z.string(),end_date:z.string(),valid_until:z.string(),retain_until:z.string()});
const sample=z.object({video_id:z.string(),metric:z.enum(['views','estimatedMinutesWatched','averageViewDuration']),unit:z.enum(['count','minutes','seconds']),value:z.number().nullable(),quality:z.enum(['known','missing']),start_date:z.string(),end_date:z.string(),measured_at:z.string()});
export type CreatorYouTubeAccountPage={links:z.infer<typeof summary>[];next_after:string|null};
export type CreatorYouTubeOwnLink={id:string;status:'pending'|'active'|'revoked';provider_revocation:'none'|'pending'|'failed'|'complete';channel_id:string;consent:z.infer<typeof consent>;samples:z.infer<typeof sample>[]};
type Principal={organizationId:string;userId:string;sessionId:string};
type AuthClient=Pick<SupabaseClient,'auth'>;

// Request-scoped. Owner calls always use a frozen bearer, never an admin client.
// The service port stays inside the assembled kernel; no HTTP operation accepts a job ID.
export class CreatorYouTubeSession {
 private anchor?:Principal;
 private ownerClient?:SupabaseClient;
 constructor(private readonly browser:AuthClient,private readonly ownerFactory:(bearer:string)=>SupabaseClient,private readonly serviceFactory:()=>SupabaseClient,private readonly organizationId:string,private readonly enabled=false){}
 async principal():Promise<Principal>{
  if(!this.enabled)throw Error('creator_session_unavailable');
  try{
   id.parse(this.organizationId);
   const session=await this.browser.auth.getSession();const token=session.data.session?.access_token;
   if(session.error||!token||token.length>16384)throw Error('Missing bearer');
   // getSession supplies the bearer only. getUser validates THAT token with Auth.
   const verified=await this.browser.auth.getUser(token),user=verified.data.user;
   if(verified.error||!user||!user.email_confirmed_at||user.is_anonymous)throw Error('Unverified user');
   const pieces=token.split('.');if(pieces.length!==3||!pieces[1].match(/^[A-Za-z0-9_-]+$/))throw Error('Invalid bearer');
   const claims=z.object({sub:id,session_id:id,role:z.literal('authenticated'),exp:z.number().int().positive()}).parse(JSON.parse(Buffer.from(pieces[1],'base64url').toString('utf8')));
   if(claims.sub!==user.id||claims.exp*1000<=Date.now())throw Error('Wrong bearer');
   const current={organizationId:this.organizationId,userId:user.id,sessionId:claims.session_id};
   if(this.anchor&&JSON.stringify(this.anchor)!==JSON.stringify(current))throw Error('Session changed');
   if(!this.anchor){this.anchor=current;this.ownerClient=this.ownerFactory(token);}
   return current;
  }catch{throw Error('creator_session_not_confirmed');}
 }
 async authenticate(){await this.principal();}
 private async ownerRpc(name:string,args:Record<string,unknown>){
  await this.principal();
  const {data,error}=await this.ownerClient!.rpc(name,args,{get:false});
  if(error||data===null)throw Error('creator_owner_not_confirmed');return data;
 }
 readonly owner:CreatorYouTubePorts['owner']=async(operation,link,data)=>{
  const result=await this.ownerRpc('creator_youtube_owner',{p_org:this.organizationId,p_operation:operation,p_link:link,p_data:data});
  return z.object({id,job_id:id.nullable().optional(),provider_revocation:z.enum(['none','pending','failed','complete']).optional()}).parse(result);
 };
 readonly server:CreatorYouTubePorts['server']=async(job,operation,data)=>{
  await this.principal();id.parse(job);
  // Even 'read' claims dispatch, so every RPC is a committed POST, never GET.
  const result=await this.serviceFactory().rpc('creator_youtube_server',{p_job:job,p_operation:operation,p_data:data},{get:false});
  if(result.error||result.data===null)throw Error('creator_server_not_confirmed');return result.data;
 };
 async account(after:string|null=null):Promise<CreatorYouTubeAccountPage>{
  if(after!==null)id.parse(after);
  return z.object({links:z.array(summary).max(20),next_after:id.nullable()}).parse(await this.ownerRpc('creator_youtube_account',{p_org:this.organizationId,p_after:after,p_limit:20}));
 }
 async read(link:string):Promise<CreatorYouTubeOwnLink>{
  id.parse(link);
  const result=z.object({id,status:summary.shape.status,provider_revocation:summary.shape.provider_revocation,channel_id:z.string(),consent,samples:z.array(sample)}).parse(await this.ownerRpc('creator_youtube_owner',{p_org:this.organizationId,p_operation:'read',p_link:link,p_data:{}}));
  if(result.id!==link)throw Error('creator_read_not_confirmed');return result;
 }
}
