import {randomUUID} from "node:crypto";
import {AppShell} from "./app-shell";
import {ExpenseIntakeForm} from "./expense-intake-form";
import {requirePermission} from "@/lib/auth-context";
export async function ExpenseIntakePage({eventId=""}:{eventId?:string}){
 const{user,supabase}=await requirePermission("submitExpenses");const profile=await supabase.from("profiles").select("display_name").eq("id",user.id).maybeSingle();
 return <AppShell active="Financiën"><header className="topbar module-top"><div><p>MIJN WERKPLEK</p><h1>Kost indienen</h1></div></header><div className="module-body"><ExpenseIntakeForm initialId={randomUUID()} claimantName={profile.data?.display_name??""} eventId={eventId}/></div></AppShell>;
}
