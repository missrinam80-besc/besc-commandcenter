'use server';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {z} from 'zod';
import {requirePermission} from '@/lib/auth-context';

export async function manageSocialInbox(form:FormData){
 const href='/app/social/inbox';
 if(process.env.BESC_SOCIAL_INBOX_ENABLED!=='true')redirect(href+'?fout=uitgeschakeld');
 const parsed=z.object({thread:z.uuid(),action:z.enum(['assign','status','note']),revision:z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER),assignee:z.union([z.uuid(),z.literal('')]).optional(),status:z.enum(['open','in_progress','waiting','resolved']).optional(),note:z.string().trim().min(1).max(2000).optional()}).safeParse(Object.fromEntries(form));
 if(!parsed.success)redirect(href+'?fout=velden');
 const {supabase,membership}=await requirePermission('manageInbox');
 const d=parsed.data,payload:Record<string,unknown>={revision:d.revision};
 if(d.action==='assign')payload.assignee=d.assignee??'';
 if(d.action==='status')payload.status=d.status;
 if(d.action==='note')payload.note=d.note;
 const {error}=await supabase.rpc('social_inbox_owner',{p_org:membership.organization_id,p_action:d.action,p_thread:d.thread,p_data:payload});
 const detail=href+'?thread='+d.thread;
 if(error)redirect(detail+'&fout='+ (error.code==='40001'?'gewijzigd':'controle'));
 revalidatePath(href);redirect(detail+'&succes=opgeslagen');
}
