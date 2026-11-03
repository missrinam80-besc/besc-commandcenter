"use server";
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {requireActiveMembership} from '@/lib/auth-context';
import {hasPermission} from '@/lib/permissions';
import {prepareTargetRows,transferFileHash,transferActionSchema} from '@/lib/rewards-transfer';
export async function saveTransfer(form:FormData){
 const {supabase,membership}=await requireActiveMembership();const back='/app/bucks/overgang';
 if(!hasPermission(membership,'manageRewards')||process.env.BESC_REWARDS_TRANSFER_ENABLED!=='true')redirect(back+'?fout=geen-toegang');
 const op=String(form.get('op'));let data:Record<string,unknown>;
 const text=(n:string)=>String(form.get(n)??'');
 if(op==='prepare')data={op,id:text('id'),broadcaster_id:text('broadcaster_id'),cutoff:text('cutoff'),declared_total:text('declared_total')};
 else data={op,id:text('id'),plan_sha256:text('plan_sha256'),reason:text('reason'),confirmed:form.has('confirmed'),source_stopped:form.has('source_stopped'),cutoff_confirmed:form.has('cutoff_confirmed')};
 const parsed=transferActionSchema.safeParse(data);if(!parsed.success)redirect(back+'?fout=velden');
 const {op:operation,...input}=parsed.data;data=input;
 if(operation==='prepare'){
  try{
   const file=form.get('export'),mapping=form.get('mapping'),original=form.get('original');
   if(!(original instanceof File)||original.size===0||original.size>262144||!(file instanceof File)||!(mapping instanceof File)||file.size>262144||mapping.size>262144||!form.has('conversion_verified'))throw Error();
   const bytes=new Uint8Array(await file.arrayBuffer()),mapBytes=new Uint8Array(await mapping.arrayBuffer());
   const decoder=new TextDecoder('utf-8',{fatal:true});
   data={...input,rows:prepareTargetRows(decoder.decode(bytes),decoder.decode(mapBytes),text('declared_total')),export_sha256:transferFileHash(bytes),original_sha256:transferFileHash(new Uint8Array(await original.arrayBuffer()))};
  }catch{redirect(back+'?fout=bestanden');}
 }
 const result=await supabase.rpc('re03_transfer',{o:membership.organization_id,op:operation,d:data});
 revalidatePath(back);redirect(back+(result.error||result.data?.ok!==true?'?fout=niet-bevestigd':'?batch='+encodeURIComponent(String(data.id))+'&opgeslagen=1'));
}
