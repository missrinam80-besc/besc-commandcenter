import type {SupabaseClient} from "@supabase/supabase-js";
import {choiceOptionKey,type DossierChoice} from "./dossier-choices";
export async function loadManagedChoices(supabase:SupabaseClient,organizationId:string){
 const {data,error}=await supabase.from("dossier_choice_options").select("set_key,value,label,position,is_default").eq("organization_id",organizationId).order("position").order("label");
 if(error||!Array.isArray(data))throw Error("De keuzevelden kunnen niet worden geladen. Controleer of de migratie voor beheerde keuzevelden is uitgevoerd.");
 return (data??[]) as DossierChoice[];
}
export function choiceEditorOptions(rows:DossierChoice[]){
 const options:Record<string,{id:string;label:string}[]>={};
 for(const row of rows){const [table,field]=row.set_key.split(".");const key=choiceOptionKey(table,field);(options[key]??=[]).push({id:row.value,label:row.label});}
 return options;
}
