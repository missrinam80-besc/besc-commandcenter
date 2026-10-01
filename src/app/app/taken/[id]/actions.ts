"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActiveMembership } from "@/lib/auth-context";
import { localDateTimeToIso } from "@/lib/format";

const returnTo=(id:string)=>`/app/taken/${id}`;
export async function updateTaskDetails(formData:FormData){
  const parsed=z.object({id:z.string().uuid(),title:z.string().trim().max(180).optional(),description:z.string().trim().max(5000).optional(),status:z.enum(["todo","doing","waiting","review","done","cancelled"]),priority:z.enum(["low","normal","high","urgent"]),due_at:z.string().optional(),project_id:z.string().uuid().or(z.literal("")),return_to:z.string().optional()}).safeParse(Object.fromEntries(formData));
  if(!parsed.success) redirect(`/app/taken?fout=velden`);
  const{supabase,user,membership}=await requireActiveMembership();
  const{data:currentTask}=await supabase.from("tasks").select("project_id").eq("id",parsed.data.id).eq("organization_id",membership.organization_id).maybeSingle();
  if(parsed.data.project_id){
    const{data:project}=await supabase.from("projects").select("id").eq("id",parsed.data.project_id).eq("organization_id",membership.organization_id).is("deleted_at",null).maybeSingle();
    if(!project)redirect(`${returnTo(parsed.data.id)}?fout=project`);
  }
  const{error}=await supabase.from("tasks").update({title:parsed.data.title||"Naamloze taak",description:parsed.data.description||null,status:parsed.data.status,priority:parsed.data.priority,due_at:localDateTimeToIso(parsed.data.due_at),project_id:parsed.data.project_id||null,completed_at:parsed.data.status==="done"?new Date().toISOString():null}).eq("id",parsed.data.id).eq("organization_id",membership.organization_id);
  if(error) redirect(`${returnTo(parsed.data.id)}?fout=opslaan`);
  await supabase.from("activity_events").insert({organization_id:membership.organization_id,entity_type:"task",entity_id:parsed.data.id,action:"task_updated",actor_id:user.id});
  revalidatePath(returnTo(parsed.data.id));revalidatePath("/app/taken");revalidatePath("/app/projecten");
  if(currentTask?.project_id)revalidatePath(`/app/projecten/${currentTask.project_id}`);
  if(parsed.data.project_id)revalidatePath(`/app/projecten/${parsed.data.project_id}`);
  const destination=parsed.data.return_to?.startsWith("/app/projecten/")?parsed.data.return_to:returnTo(parsed.data.id);
  redirect(`${destination}?succes=taak`);
}
export async function addChecklistItem(formData:FormData){
  const parsed=z.object({task_id:z.string().uuid(),title:z.string().trim().max(240).optional()}).safeParse(Object.fromEntries(formData));if(!parsed.success)redirect("/app/taken?fout=velden");
  const{supabase,user}=await requireActiveMembership();const{error}=await supabase.from("task_checklist_items").insert({task_id:parsed.data.task_id,title:parsed.data.title||"Checklistitem",created_by:user.id});if(error)redirect(`${returnTo(parsed.data.task_id)}?fout=checklist`);revalidatePath(returnTo(parsed.data.task_id));
}
export async function toggleChecklistItem(formData:FormData){
  const parsed=z.object({task_id:z.string().uuid(),id:z.string().uuid(),is_done:z.enum(["true","false"])}).safeParse(Object.fromEntries(formData));if(!parsed.success)redirect("/app/taken?fout=velden");
  const{supabase}=await requireActiveMembership();const done=parsed.data.is_done==="true";const{error}=await supabase.from("task_checklist_items").update({is_done:done,completed_at:done?new Date().toISOString():null}).eq("id",parsed.data.id).eq("task_id",parsed.data.task_id);if(error)redirect(`${returnTo(parsed.data.task_id)}?fout=checklist`);revalidatePath(returnTo(parsed.data.task_id));
}
export async function setTaskAssignee(formData:FormData){
  const parsed=z.object({task_id:z.string().uuid(),user_id:z.string().uuid().or(z.literal(""))}).safeParse(Object.fromEntries(formData));if(!parsed.success)redirect("/app/taken?fout=velden");
  const{supabase,user,membership}=await requireActiveMembership();await supabase.from("task_assignees").delete().eq("task_id",parsed.data.task_id);if(parsed.data.user_id){const{error}=await supabase.from("task_assignees").insert({task_id:parsed.data.task_id,user_id:parsed.data.user_id});if(error)redirect(`${returnTo(parsed.data.task_id)}?fout=toewijzen`);const[{data:task},{data:preferences}]=await Promise.all([supabase.from("tasks").select("title").eq("id",parsed.data.task_id).single(),supabase.from("notification_preferences").select("assignment_notifications").eq("organization_id",membership.organization_id).eq("user_id",parsed.data.user_id).maybeSingle()]);if(parsed.data.user_id!==user.id&&preferences?.assignment_notifications!==false)await supabase.from("notifications").insert({organization_id:membership.organization_id,user_id:parsed.data.user_id,type:"assignment",title:"Nieuwe taak aan jou toegewezen",body:task?.title||"Open de taak voor details",entity_type:"task",entity_id:parsed.data.task_id,href:returnTo(parsed.data.task_id),severity:"info",dedupe_key:`assignment:task:${parsed.data.task_id}:${parsed.data.user_id}`});await supabase.from("activity_events").insert({organization_id:membership.organization_id,entity_type:"task",entity_id:parsed.data.task_id,action:"task_assigned",actor_id:user.id});}revalidatePath(returnTo(parsed.data.task_id));redirect(`${returnTo(parsed.data.task_id)}?succes=toegewezen`);
}

export async function deleteTask(formData:FormData){
  const parsed=z.object({id:z.string().uuid(),confirmation:z.literal("VERWIJDER")}).safeParse(Object.fromEntries(formData));
  if(!parsed.success)redirect("/app/taken?fout=verwijderen");
  const{supabase,user,membership}=await requireActiveMembership();
  const now=new Date().toISOString();
  const{error}=await supabase.from("tasks").update({deleted_at:now,updated_at:now}).eq("id",parsed.data.id).eq("organization_id",membership.organization_id).is("deleted_at",null);
  if(error)redirect(`${returnTo(parsed.data.id)}?fout=verwijderen`);
  await supabase.from("activity_events").insert({organization_id:membership.organization_id,entity_type:"task",entity_id:parsed.data.id,action:"task_deleted",actor_id:user.id});
  revalidatePath("/app");revalidatePath("/app/taken");revalidatePath("/app/projecten");
  redirect("/app/taken?succes=verwijderd");
}
