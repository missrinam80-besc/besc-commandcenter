"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
export async function updatePassword(formData: FormData) {
  const password=String(formData.get("password")||"");const confirm=String(formData.get("confirm_password")||"");
  if(password.length<8)redirect("/wachtwoord-instellen?error=eisen");if(password!==confirm)redirect("/wachtwoord-instellen?error=verschil");
  const supabase=await createClient();const{data:{user}}=await supabase.auth.getUser();if(!user)redirect("/login?error=recovery-sessie");
  const{error}=await supabase.auth.updateUser({password});if(error)redirect("/wachtwoord-instellen?error=opslaan");redirect("/app?succes=wachtwoord");
}
