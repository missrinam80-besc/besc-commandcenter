import {z} from 'zod';

export const instagramPublicationScopes=['instagram_basic','instagram_content_publish','pages_read_engagement'] as const;
const uuid=z.string().uuid(),externalId=z.string().regex(/^\d+$/);
export const instagramJob=z.object({id:uuid,organization_id:uuid,post_id:uuid,account_id:uuid,state:z.string(),caption:z.string().min(1).max(4400),
 image_url:z.string().url(),image_sha256:z.string().regex(/^[a-f0-9]{64}$/),external_account_id:externalId,scheduled_at:z.string()});
export type InstagramJob=z.infer<typeof instagramJob>;
export type InstagramProvider={
 preflight:(account:string,token:string)=>Promise<void>;
 quota:(account:string,token:string)=>Promise<void>;
 create:(job:InstagramJob,token:string)=>Promise<string>;
 status:(container:string,token:string)=>Promise<'FINISHED'|'IN_PROGRESS'|'ERROR'|'EXPIRED'|'PUBLISHED'>;
 publish:(account:string,container:string,token:string)=>Promise<string>;
 receipt:(account:string,media:string,token:string)=>Promise<{media_id:string;permalink:string}>;
};
export type InstagramPublicationPorts={
 server:(job:string,action:string,data?:Record<string,unknown>)=>Promise<unknown>;
 credentials:(account:string)=>Promise<string>;
 verifyImage:(job:InstagramJob)=>Promise<void>;
 provider:InstagramProvider;
 wait:(milliseconds:number)=>Promise<void>;
 now?:()=>number;
};

// Deliberately has no environment-driven factory, ambient fetch, route or timer.
// A committed claim is irreversible: a lost mutating response is never retried.
export async function runInstagramPublication(jobId:string,ports:InstagramPublicationPorts,enabled=false){
 if(!enabled)throw Error('instagram_publication_disabled');uuid.parse(jobId);
 const job=instagramJob.parse(await ports.server(jobId,'read'));
 if(job.id!==jobId)throw Error('instagram_job_mismatch');
 if(job.state!=='scheduled'||Date.parse(job.scheduled_at)>(ports.now?.()??Date.now()))return {state:'skipped'};
 const claim=z.object({state:z.string(),nonce:uuid.optional()}).parse(await ports.server(jobId,'claim'));
 if(claim.state!=='preparing')return {state:claim.state};
 const nonce=uuid.parse(claim.nonce);
 let token:string;
 try{
  if(!Number.isFinite(Date.parse(job.scheduled_at))||[...job.caption].length>2200)throw Error('Invalid publication');
  await ports.verifyImage(job);token=await ports.credentials(job.account_id);
  if(!token)throw Error('No credentials');
  await ports.provider.preflight(job.external_account_id,token);
  await ports.provider.quota(job.external_account_id,token);
 }catch{
  await ports.server(jobId,'preflight_failed',{nonce});return {state:'failed'};
 }
 try{
  const container=externalId.parse(await ports.provider.create(job,token));
  await ports.server(jobId,'created',{nonce,container_id:container});
  let ready=false;
  for(let attempt=0;attempt<5;attempt++){
   const state=await ports.provider.status(container,token);
   if(state==='FINISHED'){ready=true;break;}
   if(state!=='IN_PROGRESS')throw Error('Container not publishable');
   if(attempt<4)await ports.wait(60_000);
  }
  if(!ready)throw Error('Container not ready');
  await ports.provider.quota(job.external_account_id,token);
  await ports.server(jobId,'dispatch_publish',{nonce});
  const media=externalId.parse(await ports.provider.publish(job.external_account_id,container,token));
  const receipt=await ports.provider.receipt(job.external_account_id,media,token);
  if(receipt.media_id!==media||!/^https:\/\/www\.instagram\.com\/p\/[A-Za-z0-9_-]+\/$/.test(receipt.permalink))throw Error('Receipt not confirmed');
  await ports.server(jobId,'complete',{nonce,...receipt});return {state:'published'};
 }catch{
  // Even a non-2xx response after dispatch can be ambiguous. No second POST.
  try{await ports.server(jobId,'uncertain',{nonce});return {state:'uncertain'};}catch{
   // An acknowledgement can be lost after the receipt was committed. Read only.
   const saved=z.object({state:z.string()}).parse(await ports.server(jobId,'read'));
   if(saved.state==='published'||saved.state==='uncertain')return {state:saved.state};
   throw Error('instagram_outcome_requires_followup');
  }
 }
}
