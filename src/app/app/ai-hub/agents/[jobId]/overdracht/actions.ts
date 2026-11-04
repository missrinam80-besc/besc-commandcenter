'use server';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {z} from 'zod';
import {loadAgentDocument} from '@/lib/agent-document-store';
import {createAdminClient} from '@/lib/supabase/admin';

export async function recordAgentHandoff(form:FormData){
  const input=z.object({job_id:z.string().uuid(),sha256:z.string().regex(/^[a-f0-9]{64}$/),kind:z.enum(['google_document','assist_manual']),reference:z.string().trim().min(5).max(500),period:z.string().trim().max(80).default(''),confirmed:z.literal('on')}).safeParse(Object.fromEntries(form));
  if(!input.success)redirect('/app/ai-hub/agents?fout=velden');
  const p=input.data;
  const target=`/app/ai-hub/agents/${p.job_id}/overdracht`;
  let failed=false;
  try{
    const {user,membership,artifact,stale}=await loadAgentDocument(p.job_id);
    if(stale||artifact.sha256!==p.sha256)throw Error('agent_source_conflict');
    if(p.kind==='google_document'&&!/^https:\/\/docs\.google\.com\/document\/d\/[A-Za-z0-9_-]+(?:\/edit)?$/.test(p.reference))throw Error('agent_handoff_invalid');
    if(p.kind==='assist_manual'&&p.period.length<3)throw Error('agent_handoff_invalid');
    const {error}=await createAdminClient().rpc('record_agent_document_handoff',{
      p_actor:user.id,p_org:membership.organization_id,p_job:p.job_id,p_sha:p.sha256,p_kind:p.kind,p_reference:p.reference,p_period:p.period||null,
    });
    failed=Boolean(error);
  }catch{failed=true;}
  revalidatePath(target);redirect(target+(failed?'?fout=overdracht':'?succes=overdracht'));
}
