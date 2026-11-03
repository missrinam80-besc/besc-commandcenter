"use server";
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {requireActiveMembership} from '@/lib/auth-context';
import {hasPermission} from '@/lib/permissions';
import {earningActionSchema} from '@/lib/rewards-transfer';
export async function saveEarning(form:FormData){
 const {supabase,membership}=await requireActiveMembership();const back='/app/bucks/verdienen';
 if(!hasPermission(membership,'manageRewards')||process.env.BESC_REWARDS_EARNING_ADMIN_ENABLED!=='true')redirect(back+'?fout=geen-toegang');
 const d:Record<string,unknown>={};for(const name of ['op','guild_id','broadcaster_id','kind','reason'])if(form.has(name))d[name]=String(form.get(name));
 for(const name of ['version','xp','bucks','daily_xp','daily_bucks','cooldown_seconds','minimum_bits'])if(form.has(name))d[name]=String(form.get(name)).trim()?Number(form.get(name)):NaN;
 if(d.op!=='twitch_save')d.enabled=form.get('enabled')==='true';
 const parsed=earningActionSchema.safeParse(d);if(!parsed.success)redirect(back+'?fout=velden');
 const {op,...data}=parsed.data;
 const result=await supabase.rpc('re02_admin',{o:membership.organization_id,op,d:data});
 revalidatePath(back);redirect(back+(result.error||result.data?.ok!==true?'?fout=niet-bevestigd':'?opgeslagen=1'));
}
