"use server";
import {revalidatePath} from "next/cache";
import {requireActiveMembership} from "@/lib/auth-context";
import {validateEditorIssues,type EditorBundle} from "@/lib/dossier-editor-draft";
import {dossierStorageFeedback} from "@/lib/dossier-editor-feedback";
import {loadManagedChoices} from "@/lib/dossier-choices-server";
import {managedChoiceFields} from "@/lib/dossier-choices";
import {dossierEditorCatalog} from "@/lib/dossier-editor-catalog";
import {hasPermission,type Capability} from "@/lib/permissions";

export async function saveDossierEditor(bundle:EditorBundle){
 if(!bundle||typeof bundle!=="object"||!bundle.root||!Array.isArray(bundle.parts)||JSON.stringify(bundle).length>800000)return {ok:false,message:"De dossierwijziging is ongeldig of te groot."};
 const cfg=dossierEditorCatalog[bundle.kind];if(!cfg)return {ok:false,message:"Onbekende fiche."};
 const issues=validateEditorIssues(bundle);if(issues.length)return {ok:false,message:"Controleer de onderstaande velden. Er is niets opgeslagen.",issues};
 const {supabase,membership}=await requireActiveMembership();
 const capability=bundle.kind==="expense"&&!bundle.root.new?"manageFinance":cfg.capability;
 if(capability!=="active"&&!hasPermission(membership,capability as Capability))return {ok:false,message:"Je hebt geen bevoegdheid om deze fiche te wijzigen."};
 let choiceRows;
 try{choiceRows=await loadManagedChoices(supabase,membership.organization_id);}catch{return {ok:false,message:"De keuzevelden kunnen niet worden gecontroleerd. Controleer de migratie voor beheerde keuzevelden; er is niets opgeslagen."};}
 const choiceValues:Record<string,string[]>=Object.fromEntries(Object.keys(managedChoiceFields).map(key=>[key,[]]));
 for(const row of choiceRows)choiceValues[row.set_key]?.push(row.value);
 const choiceIssues=validateEditorIssues(bundle,cfg,choiceValues);
 if(choiceIssues.length)return {ok:false,message:"Een keuze is niet meer beschikbaar. Controleer de onderstaande velden.",issues:choiceIssues};
 const {data,error}=await supabase.rpc("save_dossier_bundle",{p_organization_id:membership.organization_id,p_bundle:bundle});
 if(error)return {ok:false,...dossierStorageFeedback(error,bundle)};
 if(data!==bundle.root.id)return {ok:false,message:"De opslag kon niet worden bevestigd. Controleer het dossier voordat je opnieuw probeert."};
 for(const def of Object.values(dossierEditorCatalog))revalidatePath(def.path,"layout");
 const listOnly=["asset","member","mandate","deadline","administration"].includes(bundle.kind);
 return {ok:true,href:`${cfg.path}${listOnly?"":`/${bundle.root.id}`}?succes=dossier`};
}
