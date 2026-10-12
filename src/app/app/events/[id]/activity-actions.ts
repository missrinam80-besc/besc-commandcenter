"use server";
import {z} from "zod";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {requirePermission} from "@/lib/auth-context";
const schema=z.object({event_id:z.string().uuid(),id:z.string().uuid().optional().or(z.literal("")),title:z.string().trim().min(2).max(180),description:z.string().max(16000).optional(),position:z.coerce.number().int().min(0).max(100000)});
export async function saveEventActivity(form:FormData){const event=z.string().uuid().safeParse(form.get("event_id"));if(!event.success)redirect("/app/events?fout=activiteit-velden");const parsed=schema.safeParse(Object.fromEntries(form));if(!parsed.success)redirect(`/app/events/${event.data}?tab=activiteiten&activiteit=${z.string().uuid().safeParse(form.get("id")).success?String(form.get("id")):"nieuw"}&fout=activiteit-velden`);
 const{membership,supabase,user}=await requirePermission("manageEvents");const{id,event_id,...values}=parsed.data;
 const query=id?supabase.from("event_activities").update({...values,description:values.description??""}).eq("organization_id",membership.organization_id).eq("event_id",event_id).eq("id",id):supabase.from("event_activities").insert({...values,description:values.description??"",organization_id:membership.organization_id,event_id,created_by:user.id});
 const r=await query.select("id").maybeSingle();if(r.error||!r.data)redirect(`/app/events/${event_id}?tab=activiteiten&fout=activiteit-opslaan`);revalidatePath(`/app/events/${event_id}`);redirect(`/app/events/${event_id}?tab=activiteiten&succes=activiteit-opgeslagen`);
}
export async function deleteEventActivity(form:FormData){const p=z.object({event_id:z.string().uuid(),id:z.string().uuid()}).safeParse(Object.fromEntries(form));if(!p.success)redirect("/app/events?fout=activiteit-velden");const{membership,supabase}=await requirePermission("manageEvents");const r=await supabase.from("event_activities").delete().eq("organization_id",membership.organization_id).eq("event_id",p.data.event_id).eq("id",p.data.id).select("id").maybeSingle();if(r.error||r.data?.id!==p.data.id)redirect(`/app/events/${p.data.event_id}?tab=activiteiten&fout=activiteit-${r.error?.code==="23503"?"gekoppeld":"verwijderen"}`);revalidatePath(`/app/events/${p.data.event_id}`);redirect(`/app/events/${p.data.event_id}?tab=activiteiten&succes=activiteit-verwijderd`);}
