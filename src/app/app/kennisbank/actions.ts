"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActiveMembership } from "@/lib/auth-context";

const path="/app/kennisbank";
const articleSchema=z.object({id:z.string().uuid().optional(),title:z.string().trim().min(3).max(180),summary:z.string().trim().max(1000).optional(),body:z.string().trim().max(30000).optional(),article_type:z.enum(["procedure","guide","policy","faq","onboarding","template","reference","other"]),status:z.enum(["draft","review","published","outdated","archived"]),category_id:z.string().uuid().optional().or(z.literal("")),owner_id:z.string().uuid().optional().or(z.literal("")),drive_url:z.string().url().optional().or(z.literal("")),review_due_date:z.string().optional(),tags:z.string().optional(),change_note:z.string().trim().max(500).optional()});
function tags(value?:string){return[...new Set((value??"").split(",").map(x=>x.trim()).filter(Boolean))]}

export async function saveKnowledgeCategory(formData:FormData){
 const parsed=z.object({name:z.string().trim().min(2).max(100),description:z.string().trim().max(500).optional(),color:z.string().regex(/^#[0-9a-fA-F]{6}$/)}).safeParse(Object.fromEntries(formData));
 if(!parsed.success)redirect(`${path}?fout=categorie`);
 const{supabase,user,membership}=await requireActiveMembership();if(!["admin","board"].includes(membership.role))redirect(`${path}?fout=rechten`);
 const{error}=await supabase.from("knowledge_categories").insert({organization_id:membership.organization_id,...parsed.data,description:parsed.data.description||null,created_by:user.id});
 if(error)redirect(`${path}?fout=categorie-opslaan`);revalidatePath(path);redirect(`${path}?succes=categorie`);
}

export async function saveKnowledgeArticle(formData:FormData){
 const parsed=articleSchema.safeParse(Object.fromEntries(formData));if(!parsed.success)redirect(`${path}?fout=velden`);
 const{supabase,user,membership}=await requireActiveMembership();if(!["admin","board"].includes(membership.role))redirect(`${path}?fout=rechten`);
 const{id,change_note,...values}=parsed.data,payload={...values,category_id:values.category_id||null,owner_id:values.owner_id||null,drive_url:values.drive_url||null,review_due_date:values.review_due_date||null,summary:values.summary||null,body:values.body||null,tags:tags(values.tags),published_at:values.status==="published"?new Date().toISOString():null};
 if(id){
  const{data:old}=await supabase.from("knowledge_articles").select("title,summary,body,status").eq("organization_id",membership.organization_id).eq("id",id).maybeSingle();
  if(!old)redirect(`${path}?fout=niet-gevonden`);
  const{error}=await supabase.from("knowledge_articles").update(payload).eq("organization_id",membership.organization_id).eq("id",id);if(error)redirect(`${path}/${id}?fout=opslaan`);
  await supabase.from("knowledge_revisions").insert({article_id:id,title:old.title,summary:old.summary,body:old.body,status:old.status,changed_by:user.id,change_note:change_note||"Artikel bijgewerkt"});
  revalidatePath(`${path}/${id}`);revalidatePath(path);redirect(`${path}/${id}?succes=1`);
 }
 const{data,error}=await supabase.from("knowledge_articles").insert({organization_id:membership.organization_id,...payload,created_by:user.id}).select("id").single();
 if(error||!data)redirect(`${path}?fout=opslaan`);revalidatePath(path);redirect(`${path}/${data.id}`);
}
