"use server";
import {revalidatePath} from "next/cache";import {requireActiveMembership} from "@/lib/auth-context";
export async function markNotificationRead(formData:FormData){const id=String(formData.get("id")||"");const{supabase,user}=await requireActiveMembership();await supabase.from("notifications").update({read_at:new Date().toISOString()}).eq("id",id).eq("user_id",user.id);revalidatePath("/app/meldingen");revalidatePath("/app");}
export async function markAllRead(){const{supabase,user}=await requireActiveMembership();await supabase.from("notifications").update({read_at:new Date().toISOString()}).eq("user_id",user.id).is("read_at",null);revalidatePath("/app/meldingen");revalidatePath("/app");}
