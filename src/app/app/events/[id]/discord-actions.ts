"use server";
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireActiveMembership } from '@/lib/auth-context';
import { hasPermission } from '@/lib/permissions';
import { eventSyncEnabled,eventRsvpEnabled } from '@/lib/event-discord';
const uuid=z.string().uuid(),version=z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const text=(max:number)=>z.string().trim().min(1).max(max).refine(t=>!/[\u0000-\u0008\u000b-\u001f\u007f]|@everyone|@here|<@[!&]?\d+>/i.test(t));
async function operate(fd:FormData,op:string,d:Record<string,unknown>){
 if(!eventSyncEnabled())redirect('/app?fout=geen-toegang');const id=uuid.safeParse(fd.get('event_id'));if(!id.success)redirect('/app/events');
 const {supabase,membership}=await requireActiveMembership();if(!hasPermission(membership,'manageEvents'))redirect('/app?fout=geen-toegang');
 const r=await supabase.rpc('event_discord_manage',{o:membership.organization_id,eid:id.data,op,d});revalidatePath('/app/events/'+id.data);
 redirect('/app/events/'+id.data+'?tab=communicatie&'+(r.error?'fout=discord-niet-bevestigd':'succes=discord-opgeslagen'));
}
function invalid(fd:FormData):never {const id=uuid.safeParse(fd.get('event_id'));redirect(id.success?'/app/events/'+id.data+'?tab=communicatie&fout=discord-niet-bevestigd':'/app/events');}
export async function configureEventDiscord(fd:FormData){const d=z.object({expected_version:version,guild_id:z.string().regex(/^[1-9]\d{16,19}$/)}).safeParse(Object.fromEntries(fd));if(!d.success)invalid(fd);return operate(fd,'configure',{...d.data,enabled:fd.get('enabled')==='on',rsvp_enabled:eventRsvpEnabled()&&fd.get('rsvp_enabled')==='on'});}
export async function saveEventDiscord(fd:FormData){const d=z.object({expected_revision:version,public_title:text(100),public_description:text(700),public_location:text(100)}).safeParse(Object.fromEntries(fd));if(!d.success)invalid(fd);return operate(fd,'save',{...d.data,enabled:fd.get('enabled')==='on',rsvp_enabled:eventRsvpEnabled()&&fd.get('rsvp_enabled')==='on'});}
export async function withdrawEventDiscord(fd:FormData){const v=version.safeParse(fd.get('expected_revision'));if(!v.success)invalid(fd);return operate(fd,'withdraw',{expected_revision:v.data});}
export async function updateEventPresence(fd:FormData){const d=z.object({user_id:uuid,expected_version:version,audience:z.enum(['crew','participant','volunteer','visitor'])}).safeParse(Object.fromEntries(fd));if(!d.success)invalid(fd);return operate(fd,'presence',{...d.data,attended:fd.get('attended')==='on'});}
