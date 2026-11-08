'use server';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {z} from 'zod';
import {requireActiveMembership} from '@/lib/auth-context';
import {verifyInstagramImage} from '@/lib/instagram-publication-image';

export async function manageInstagramPublication(form:FormData){
 const parsed=z.object({post:z.string().uuid(),action:z.enum(['image','queue','cancel']),account:z.string().uuid().optional(),image_url:z.string().url().optional(),job:z.string().uuid().optional(),confirm:z.string().optional()}).safeParse(Object.fromEntries(form));
 if(!parsed.success)redirect('/app/social?fout=instagram-velden');
 const data=parsed.data,href='/app/social/'+data.post;
 if(process.env.BESC_INSTAGRAM_PUBLICATION_ENABLED!=='true')redirect(href+'?fout=instagram-uitgeschakeld');
 const {supabase,membership}=await requireActiveMembership();
 if(!['admin','board'].includes(membership.role))redirect(href+'?fout=instagram-rechten');
 let failed=false;
 try{
  if(data.action==='image'){
   if(!data.account||!data.image_url)throw Error('Missing image');
   const sha=new URL(data.image_url).pathname.match(/\/([a-f0-9]{64})\.jpg$/)?.[1];if(!sha)throw Error('Managed image required');
   const {data:account,error:accountError}=await supabase.from('social_accounts').select('id,account_name,external_account_id').eq('organization_id',membership.organization_id).eq('id',data.account).eq('platform','instagram').eq('status','connected').is('deleted_at',null).maybeSingle();
   if(accountError||!account)throw Error('Account unavailable');
   await verifyInstagramImage({image_url:data.image_url,image_sha256:sha,organization_id:membership.organization_id},process.env.BESC_INSTAGRAM_PUBLICATION_MEDIA_ORIGIN??'',fetch);
   const {data:record,error}=await supabase.from('social_posts').update({instagram_account_id:data.account,instagram_target:{name:account.account_name,external_id:account.external_account_id},instagram_image_url:data.image_url,instagram_image_sha256:sha}).eq('organization_id',membership.organization_id).eq('id',data.post).is('deleted_at',null).select('id').maybeSingle();
   if(error||!record)throw Error('Image could not be saved');
  }else{
   if(data.action==='queue'&&data.confirm!=='yes'||data.action==='cancel'&&!data.job)throw Error('Confirmation required');
   const {error}=await supabase.rpc('instagram_publication_owner',{p_org:membership.organization_id,p_post:data.post,p_action:data.action,p_job:data.job??null});if(error)throw Error('Publication not confirmed');
  }
 }catch{failed=true;}
 if(failed)redirect(href+'?fout=instagram-controle');
 revalidatePath(href);redirect(href+'?succes=instagram');
}
