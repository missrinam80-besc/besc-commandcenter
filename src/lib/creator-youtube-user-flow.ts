import 'server-only';
import {z} from 'zod';
import type {CreatorYouTubeKernel} from './creator-youtube-kernel';
import type {CreatorYouTubeOAuthAttempt} from './creator-youtube-oauth-attempt';
import type {CreatorYouTubeGoogle} from './creator-youtube-google';

const cookieName='__Host-besc-creator-youtube';
const ticket=z.object({jobId:z.string().uuid(),browserNonce:z.string().regex(/^[A-Za-z0-9_-]{43}$/)}).strict();
type Ticket=z.infer<typeof ticket>;
type Ports={
 authenticate:()=>Promise<void>;
 kernel:Pick<CreatorYouTubeKernel,'consent'|'withdraw'|'collect'>;
 attempts:Pick<CreatorYouTubeOAuthAttempt,'begin'|'callback'|'beginRefresh'|'refresh'|'cancel'|'recover'>;
 google:Pick<CreatorYouTubeGoogle,'authorizationUrl'|'ready'>;
};
const link=z.string().uuid();
const actionSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('start'),consent:z.unknown()}).strict(),
 z.object({action:z.literal('prepare-refresh'),link}).strict(),
 z.object({action:z.literal('refresh')}).strict(),
 z.object({action:z.literal('cancel')}).strict(),
 z.object({action:z.literal('recover')}).strict(),
 z.object({action:z.literal('disconnect'),link}).strict(),
 z.object({action:z.literal('collect'),link}).strict(),
]);

// A local HTTP boundary factory, deliberately unmounted. authenticate and kernel owner ports
// must use the same actual session. No admin substitution, service-role owner or ambient client.
export class CreatorYouTubeUserFlow {
 private readonly origin:string;
 constructor(private readonly ports:Ports,origin:string,private readonly enabled=false){
  const url=new URL(origin);if(url.protocol!=='https:'||url.origin!==origin)throw Error('creator_flow_configuration');this.origin=origin;
 }
 private headers(){return new Headers({'Cache-Control':'no-store, private','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff'});}
 private json(value:unknown,status=200,setCookie?:string){const headers=this.headers();headers.set('Content-Type','application/json');if(setCookie)headers.set('Set-Cookie',setCookie);return new Response(JSON.stringify(value),{status,headers});}
 private cookie(value:Ticket|null){return`${cookieName}=${value?Buffer.from(JSON.stringify(ticket.parse(value))).toString('base64url'):''}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${value?86400:0}`;}
 private readCookie(request:Request){
  const entries=(request.headers.get('Cookie')??'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(cookieName+'='));
  if(entries.length===0)return null;if(entries.length!==1)throw Error('Ambiguous cookie');
  const value=entries[0].slice(cookieName.length+1);if(!/^[A-Za-z0-9_-]{1,512}$/.test(value))throw Error('Invalid cookie');
  return ticket.parse(JSON.parse(Buffer.from(value,'base64url').toString('utf8')));
 }
 private gate(){if(!this.enabled)throw Error('creator_flow_disabled');}
 private async input(request:Request){
  if(request.method!=='POST'||new URL(request.url).origin!==this.origin||new URL(request.url).pathname!=='/api/creator-youtube'||new URL(request.url).search||request.headers.get('Origin')!==this.origin||!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('Content-Type')??'')||!['same-origin',null].includes(request.headers.get('Sec-Fetch-Site')))throw Error('Invalid mutation');
  const reader=request.body?.getReader();if(!reader)throw Error('Missing input');const parts:Uint8Array[]=[];let size=0;
  try{for(;;){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>8192)throw Error('Input limit');parts.push(chunk.value);}}
  catch(error){await reader.cancel().catch(()=>undefined);throw error;}
  return actionSchema.parse(JSON.parse(Buffer.concat(parts).toString('utf8')));
 }
 async action(request:Request):Promise<Response>{
  if(!this.enabled)return this.json({status:'unavailable'},503);
  try{
   this.gate();await this.ports.authenticate();const input=await this.input(request),current=this.readCookie(request);
   if(input.action==='start'){
    if(current)throw Error('Existing request requires recovery');
    this.ports.google.ready();
    const consent=await this.ports.kernel.consent(input.consent as Parameters<CreatorYouTubeKernel['consent']>[0]);
    const pending=await this.ports.attempts.begin(consent.id);
    if(pending.redirectUri!==this.origin+'/auth/creator-youtube/callback')throw Error('Callback configuration mismatch');
    const authorizationUrl=this.ports.google.authorizationUrl(pending);
    return this.json({status:'prepared',link:consent.id,authorizationUrl},200,this.cookie({jobId:pending.jobId,browserNonce:pending.browserNonce}));
   }
   if(input.action==='prepare-refresh'){
    if(current)throw Error('Existing request requires recovery');
    const pending=await this.ports.attempts.beginRefresh(input.link);
    // The browser must receive this cookie in a separate response BEFORE invoking refresh.
    return this.json({status:'prepared'},200,this.cookie(pending));
   }
   if(input.action==='disconnect'){
    if(current)throw Error('Resolve the pending request first');
    const result=await this.ports.kernel.withdraw(input.link);return this.json({status:'disconnected',provider:result.provider});
   }
   if(input.action==='collect'){if(current)throw Error('Resolve the pending request first');await this.ports.kernel.collect(input.link);return this.json({status:'collected'});}
   if(!current)throw Error('Missing request cookie');
   if(input.action==='refresh'){await this.ports.attempts.refresh(current.jobId,current.browserNonce);return this.json({status:'completed'},200,this.cookie(null));}
   const result=input.action==='cancel'?await this.ports.attempts.cancel(current.jobId,current.browserNonce):await this.ports.attempts.recover(current.jobId,current.browserNonce);
   const notStarted='exchangeNotStarted'in result&&result.exchangeNotStarted===true;
   const done=result.provider==='complete'||result.provider==='none'||notStarted;
   return this.json({status:result.status,provider:result.provider,...(notStarted?{exchangeNotStarted:true}:{})},200,done?this.cookie(null):undefined);
  }catch{return this.json({status:'not_confirmed'},400);}
 }
 async callback(request:Request):Promise<Response>{
  if(!this.enabled)return this.json({status:'unavailable'},503);
  let status='not_confirmed',clear=false;
  try{
   this.gate();const url=new URL(request.url);
   if(request.method!=='GET'||url.origin!==this.origin||url.pathname!=='/auth/creator-youtube/callback'||url.hash||url.search.length>12000)throw Error('Invalid callback');
   await this.ports.authenticate();const current=this.readCookie(request);if(!current)throw Error('Missing callback cookie');
   for(const key of ['state','code','error'])if(url.searchParams.getAll(key).length>1)throw Error('Duplicate callback parameter');
   const state=url.searchParams.get('state')??'',code=url.searchParams.get('code'),error=url.searchParams.get('error');
   if((code===null)===(error===null))throw Error('Invalid callback');
   const result=await this.ports.attempts.callback({...current,state,...(code!==null?{code}:{error:'denied'})});
   status=result.status;clear=result.status==='completed'||'provider'in result&&result.provider==='complete'||'exchangeNotStarted'in result&&result.exchangeNotStarted===true;
  }catch{/* Callback codes, provider errors and credentials never reach a result URL or log. */}
  const headers=this.headers();headers.set('Location',`${this.origin}/app/account?creator_youtube=${status}`);if(clear)headers.set('Set-Cookie',this.cookie(null));return new Response(null,{status:303,headers});
 }
}
