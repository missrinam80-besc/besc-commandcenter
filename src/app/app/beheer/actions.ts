"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActiveMembership } from "@/lib/auth-context";

export async function updateMemberAccess(formData: FormData) {
  const parsed=z.object({user_id:z.string().uuid(),role:z.enum(["admin","board","member","volunteer"]),status:z.enum(["pending","active","suspended"])}).safeParse(Object.fromEntries(formData));
  if(!parsed.success) redirect("/app/beheer/gebruikers?fout=velden");
  const {supabase,user,membership}=await requireActiveMembership();
  if(membership.role!=="admin") redirect("/app?fout=geen-toegang");
  if(parsed.data.user_id===user.id && (parsed.data.status!=="active"||parsed.data.role!=="admin")) redirect("/app/beheer/gebruikers?fout=eigen-account");
  const {error}=await supabase.from("organization_members").update({role:parsed.data.role,status:parsed.data.status}).eq("organization_id",membership.organization_id).eq("user_id",parsed.data.user_id);
  if(error) redirect("/app/beheer/gebruikers?fout=opslaan");
  revalidatePath("/app/beheer/gebruikers"); redirect("/app/beheer/gebruikers?succes=bijgewerkt");
}
