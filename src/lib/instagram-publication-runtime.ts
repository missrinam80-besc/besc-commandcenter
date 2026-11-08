import 'server-only';
import {z} from 'zod';
import {createAdminClient} from './supabase/admin';
import {usableMetaCredentials} from './meta-integration';
import {instagramGraphProvider} from './instagram-publication-provider';
import {verifyInstagramImage} from './instagram-publication-image';
import {instagramJob,runInstagramPublication} from './instagram-publication';

export async function dispatchInstagramPublications(){
 if(process.env.BESC_INSTAGRAM_PUBLICATION_ENABLED!=='true')throw Error('instagram_publication_disabled');
 const organization=z.string().uuid().parse(process.env.BESC_INSTAGRAM_PUBLICATION_ORGANIZATION_ID);
 const mediaOrigin=z.string().url().parse(process.env.BESC_INSTAGRAM_PUBLICATION_MEDIA_ORIGIN);
 const config=z.object({apiVersion:z.string().regex(/^v\d+\.\d+$/),appId:z.string().min(1),appSecret:z.string().min(1)}).parse({apiVersion:process.env.META_GRAPH_API_VERSION,appId:process.env.META_APP_ID,appSecret:process.env.META_APP_SECRET});
 const provider=instagramGraphProvider(config,fetch,true),admin=createAdminClient();
 const {data,error}=await admin.rpc('instagram_publication_server',{p_job:null,p_action:'due',p_data:{organization_id:organization}});
 if(error)throw Error('instagram_queue_unavailable');
 const jobs=z.array(z.object({id:z.string().uuid()})).max(1).parse(data);
 let published=0,attention=0,skipped=0;
 for(const job of jobs){
  const result=await runInstagramPublication(job.id,{
   server:async(id,action,input={})=>{
    const {data:answer,error:failure}=await admin.rpc('instagram_publication_server',{p_job:id,p_action:action,p_data:input});
    if(failure)throw Error('instagram_state_not_confirmed');
    if(action==='read'&&instagramJob.parse(answer).organization_id!==organization)throw Error('instagram_organization_mismatch');
    return answer;
   },
   credentials:async(account)=>(await usableMetaCredentials(account)).access_token,
   verifyImage:job=>verifyInstagramImage(job,mediaOrigin,fetch),provider,
   wait:ms=>new Promise(resolve=>setTimeout(resolve,ms)),
  },true);
  if(result.state==='published')published++;else if(['skipped','blocked'].includes(result.state))skipped++;else attention++;
 }
 return{processed:jobs.length,published,attention,skipped};
}
