"use server";
import {revalidatePath} from "next/cache";import {redirect} from "next/navigation";import {z} from "zod";import {requireActiveMembership} from "@/lib/auth-context";
export async function markNotificationRead(formData:FormData){const id=String(formData.get("id")||"");const{supabase,user}=await requireActiveMembership();await supabase.from("notifications").update({read_at:new Date().toISOString()}).eq("id",id).eq("user_id",user.id);revalidatePath("/app/meldingen");revalidatePath("/app");}
export async function markAllRead(){const{supabase,user}=await requireActiveMembership();await supabase.from("notifications").update({read_at:new Date().toISOString()}).eq("user_id",user.id).is("read_at",null);revalidatePath("/app/meldingen");revalidatePath("/app");}
export async function saveNotificationPreferences(formData:FormData){
  const parsed=z.object({reminder_days:z.array(z.enum(["1","2","3","5","7","14","30"])).default([])}).safeParse({reminder_days:formData.getAll("reminder_days")});
  if(!parsed.success)redirect("/app/meldingen?instellingen=1&fout=voorkeuren");
  const{supabase,user,membership}=await requireActiveMembership();
  const values={organization_id:membership.organization_id,user_id:user.id,deadline_notifications:formData.get("deadline_notifications")==="on",assignment_notifications:formData.get("assignment_notifications")==="on",daily_digest:formData.get("daily_digest")==="on",weekly_digest:formData.get("weekly_digest")==="on",reminder_days:parsed.data.reminder_days.map(Number),updated_at:new Date().toISOString()};
  const{error}=await supabase.from("notification_preferences").upsert(values,{onConflict:"organization_id,user_id"});
  if(error)redirect("/app/meldingen?instellingen=1&fout=opslaan");
  revalidatePath("/app/meldingen");redirect("/app/meldingen?succes=voorkeuren");
}
