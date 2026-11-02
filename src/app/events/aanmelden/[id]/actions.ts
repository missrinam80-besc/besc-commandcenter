"use server";
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { eventAttendancePath,eventRsvpEnabled,eventSyncEnabled,eventSiteOrigin } from '@/lib/event-discord';
const uuid=z.string().uuid();
function path(fd:FormData){const id=uuid.safeParse(fd.get('publication_id'));if(!id.success)redirect('/');return{id:id.data,path:eventAttendancePath(id.data)};}
export async function saveOwnEventPresence(fd:FormData){
 const target=path(fd),op=fd.get('operation');if(op!=='coming'&&op!=='withdraw')redirect(target.path+'?fout=velden');
 if(op==='coming'&&(!eventSyncEnabled()||!eventRsvpEnabled()))redirect(target.path+'?fout=gesloten');
 const version=z.coerce.number().int().nonnegative().safe().safeParse(fd.get('expected_version')),revision=z.coerce.number().int().nonnegative().safe().safeParse(fd.get('expected_revision'));
 if(!version.success||!revision.success)redirect(target.path+'?fout=velden');
 const db=await createClient(),user=await db.auth.getUser();if(!user.data.user)redirect(target.path+'?fout=aanmelden');
 const r=await db.rpc('event_presence_own',{i:target.id,op,d:{expected_version:version.data,expected_revision:revision.data}});revalidatePath(target.path);
 redirect(target.path+(r.error?'?fout=niet-bevestigd':'?opgeslagen=1'));
}
export async function eventSignIn(fd:FormData){
 const target=path(fd);if(!eventSyncEnabled())redirect(target.path+'?fout=gesloten');
 const db=await createClient();
 if(fd.get('provider')==='discord'){
  const r=await db.auth.signInWithOAuth({provider:'discord',options:{redirectTo:eventSiteOrigin()+'/auth/callback?next='+encodeURIComponent(target.path)}});
  if(r.error||!r.data.url)redirect(target.path+'?fout=aanmelden');redirect(r.data.url);
 }
 const email=z.string().email().max(254).safeParse(fd.get('email')),password=fd.get('password');
 if(!email.success||typeof password!=='string'||!password)redirect(target.path+'?fout=aanmelden');
 const r=await db.auth.signInWithPassword({email:email.data,password});if(r.error)redirect(target.path+'?fout=aanmelden');redirect(target.path);
}
