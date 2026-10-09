"use server";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {z} from "zod";
import {requirePermission} from "@/lib/auth-context";
import {choiceValue,managedChoiceFields} from "@/lib/dossier-choices";
import {dossierEditorCatalog} from "@/lib/dossier-editor-catalog";
const path="/app/beheer/keuzevelden";
function finish(key:string,error?:string):never{
 revalidatePath(path);
 for(const cfg of Object.values(dossierEditorCatalog))revalidatePath(cfg.path,"layout");
 redirect(`${path}?lijst=${encodeURIComponent(key)}&${error?`fout=${error}`:"succes=opgeslagen"}`);
}
const identity=z.object({set_key:z.string().refine(key=>key in managedChoiceFields),value:z.string().regex(/^[a-z0-9_]{1,80}$/).optional()});
function failure(message:string,code:string){return message==="choice_in_use"?"in-gebruik":message==="choice_default_protected"?"standaard":message==="choice_protected_set"?"beschermd":code==="23505"?"dubbel":code==="42501"?"rechten":"opslaan";}
export async function saveChoice(form:FormData){
 const parsed=identity.extend({label:z.string().trim().min(1).max(120),position:z.coerce.number().int().min(0).max(100000)}).safeParse(Object.fromEntries(form));
 if(!parsed.success)redirect(`${path}?fout=velden`);
 const {supabase,membership}=await requirePermission("manageUsers");
 const {set_key,label,position}=parsed.data,value=parsed.data.value??choiceValue(label);
 if(!value)finish(set_key,"velden");
 const query=parsed.data.value
  ?supabase.from("dossier_choice_options").update({label,position}).eq("organization_id",membership.organization_id).eq("set_key",set_key).eq("value",value)
  :supabase.from("dossier_choice_options").insert({organization_id:membership.organization_id,set_key,value,label,position});
 const {data,error}=await query.select("value").maybeSingle();
 if(error||data?.value!==value)finish(set_key,error?failure(error.message,error.code):"niet-beschikbaar");
 finish(set_key);
}
export async function deleteChoice(form:FormData){
 const parsed=identity.extend({value:z.string().regex(/^[a-z0-9_]{1,80}$/)}).safeParse(Object.fromEntries(form));
 if(!parsed.success)redirect(`${path}?fout=velden`);
 const {supabase,membership}=await requirePermission("manageUsers");
 const {data,error}=await supabase.from("dossier_choice_options").delete().eq("organization_id",membership.organization_id).eq("set_key",parsed.data.set_key).eq("value",parsed.data.value).select("value").maybeSingle();
 if(error||data?.value!==parsed.data.value)finish(parsed.data.set_key,error?failure(error.message,error.code):"niet-beschikbaar");
 finish(parsed.data.set_key);
}
