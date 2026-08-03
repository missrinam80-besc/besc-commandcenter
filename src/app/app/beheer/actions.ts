"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth-context";

export async function updateMemberAccess(formData: FormData) {
  const parsed=z.object({user_id:z.string().uuid(),role:z.enum(["admin","board","member","volunteer"]),status:z.enum(["pending","active","suspended"]),finance_role:z.enum(["none","submitter","approver","treasurer"])}).safeParse(Object.fromEntries(formData));
  if(!parsed.success) redirect("/app/beheer/gebruikers?fout=velden");
  const {supabase,user,membership}=await requirePermission("manageUsers");
  if(parsed.data.user_id===user.id && (parsed.data.status!=="active"||parsed.data.role!=="admin")) redirect("/app/beheer/gebruikers?fout=eigen-account");
  const {error}=await supabase.from("organization_members").update({role:parsed.data.role,status:parsed.data.status,finance_role:parsed.data.finance_role}).eq("organization_id",membership.organization_id).eq("user_id",parsed.data.user_id);
  if(error) redirect("/app/beheer/gebruikers?fout=opslaan");
  revalidatePath("/app/beheer/gebruikers"); redirect("/app/beheer/gebruikers?succes=bijgewerkt");
}

export async function savePortalAccess(formData: FormData) {
  const parsed=z.object({user_id:z.string().uuid(),access_type:z.enum(["sponsor","streamer"]),target_id:z.string().uuid()}).safeParse(Object.fromEntries(formData));
  if(!parsed.success)redirect("/app/beheer/gebruikers?fout=portaal-velden");
  const{supabase,user,membership}=await requirePermission("manageUsers");
  const values={organization_id:membership.organization_id,user_id:parsed.data.user_id,access_type:parsed.data.access_type,partner_id:parsed.data.access_type==="sponsor"?parsed.data.target_id:null,community_person_id:parsed.data.access_type==="streamer"?parsed.data.target_id:null,status:"active",created_by:user.id,updated_at:new Date().toISOString()};
  const existing=await supabase.from("portal_access").select("id").eq("organization_id",membership.organization_id).eq("user_id",parsed.data.user_id).eq(parsed.data.access_type==="sponsor"?"partner_id":"community_person_id",parsed.data.target_id).maybeSingle();
  const result=existing.data?await supabase.from("portal_access").update({status:"active",updated_at:new Date().toISOString()}).eq("id",existing.data.id):await supabase.from("portal_access").insert(values);
  if(result.error)redirect(`/app/beheer/gebruikers?portaal=${parsed.data.user_id}&fout=portaal-opslaan`);
  revalidatePath("/app/beheer/gebruikers");redirect(`/app/beheer/gebruikers?portaal=${parsed.data.user_id}&succes=portaal`);
}

export async function revokePortalAccess(formData: FormData){const parsed=z.object({id:z.string().uuid(),user_id:z.string().uuid()}).safeParse(Object.fromEntries(formData));if(!parsed.success)redirect("/app/beheer/gebruikers?fout=portaal-velden");const{supabase,membership}=await requirePermission("manageUsers");const{error}=await supabase.from("portal_access").update({status:"revoked",updated_at:new Date().toISOString()}).eq("organization_id",membership.organization_id).eq("id",parsed.data.id);if(error)redirect(`/app/beheer/gebruikers?portaal=${parsed.data.user_id}&fout=portaal-intrekken`);revalidatePath("/app/beheer/gebruikers");redirect(`/app/beheer/gebruikers?portaal=${parsed.data.user_id}&succes=portaal`)}
