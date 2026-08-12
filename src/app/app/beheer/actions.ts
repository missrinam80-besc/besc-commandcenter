"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth-context";
import { capabilities } from "@/lib/permissions";

export async function updateMemberAccess(formData: FormData) {
  const parsed=z.object({user_id:z.string().uuid(),role:z.enum(["admin","board","member","volunteer"]),status:z.enum(["pending","active","suspended"]),finance_role:z.enum(["none","submitter","approver","treasurer"]),access_role_id:z.string().uuid().optional().or(z.literal(""))}).safeParse(Object.fromEntries(formData));
  if(!parsed.success) redirect("/app/beheer/gebruikers?fout=velden");
  const {supabase,user,membership}=await requirePermission("manageUsers");
  if(parsed.data.user_id===user.id && (parsed.data.status!=="active"||parsed.data.role!=="admin")) redirect("/app/beheer/gebruikers?fout=eigen-account");
  const {error}=await supabase.from("organization_members").update({role:parsed.data.role,status:parsed.data.status,finance_role:parsed.data.finance_role,access_role_id:parsed.data.access_role_id||null}).eq("organization_id",membership.organization_id).eq("user_id",parsed.data.user_id);
  if(error) redirect("/app/beheer/gebruikers?fout=opslaan");
  revalidatePath("/app/beheer/gebruikers"); redirect("/app/beheer/gebruikers?succes=bijgewerkt");
}

const accessRoleSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  name: z.string().trim().min(1),
  description: z.string().trim().optional(),
  base_role: z.enum(["admin","board","member","volunteer"]),
  finance_role: z.enum(["none","submitter","approver","treasurer"]),
});

export async function saveAccessRole(formData: FormData) {
  const parsed = accessRoleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/beheer/rechten?fout=velden");
  const { supabase, user, membership } = await requirePermission("manageUsers", "/app/beheer/rechten?fout=geen-toegang");
  const selectedCapabilities = capabilities.filter((capability) => formData.getAll("capabilities").includes(capability));
  const values = {
    name: parsed.data.name,
    description: parsed.data.description || null,
    base_role: parsed.data.base_role,
    finance_role: parsed.data.finance_role,
    capabilities: selectedCapabilities,
    updated_at: new Date().toISOString(),
  };
  const result = parsed.data.id
    ? await supabase.from("organization_access_roles").update(values).eq("organization_id", membership.organization_id).eq("id", parsed.data.id).eq("is_system", false)
    : await supabase.from("organization_access_roles").insert({ ...values, organization_id: membership.organization_id, created_by: user.id });
  if (result.error) redirect(`/app/beheer/rechten?${parsed.data.id ? `bewerken=${parsed.data.id}&` : "nieuw=rol&"}fout=opslaan`);
  revalidatePath("/app/beheer/rechten");
  redirect("/app/beheer/rechten?succes=rol");
}

export async function deleteAccessRole(formData: FormData) {
  const parsed = z.object({ id: z.string().uuid(), confirm: z.literal("VERWIJDER") }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/beheer/rechten?fout=bevestiging");
  const { supabase, membership } = await requirePermission("manageUsers", "/app/beheer/rechten?fout=geen-toegang");
  const { error: detachError } = await supabase.from("organization_members").update({ access_role_id: null }).eq("organization_id", membership.organization_id).eq("access_role_id", parsed.data.id);
  if (detachError) redirect(`/app/beheer/rechten?bewerken=${parsed.data.id}&fout=ontkoppelen`);
  const { error } = await supabase.from("organization_access_roles").update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("organization_id", membership.organization_id).eq("id", parsed.data.id).eq("is_system", false);
  if (error) redirect(`/app/beheer/rechten?bewerken=${parsed.data.id}&fout=verwijderen`);
  revalidatePath("/app/beheer/rechten");
  revalidatePath("/app/beheer/gebruikers");
  redirect("/app/beheer/rechten?succes=verwijderd");
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
