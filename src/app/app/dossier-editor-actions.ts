"use server";
import {revalidatePath} from "next/cache";
import {requireActiveMembership} from "@/lib/auth-context";
import {validateEditorBundle,type EditorBundle} from "@/lib/dossier-editor-draft";
import {dossierEditorCatalog} from "@/lib/dossier-editor-catalog";
import {hasPermission,type Capability} from "@/lib/permissions";

export async function saveDossierEditor(bundle:EditorBundle){
 if(!bundle||typeof bundle!=="object"||!bundle.root||!Array.isArray(bundle.parts)||JSON.stringify(bundle).length>800000)return {ok:false,message:"De dossierwijziging is ongeldig of te groot."};
 const cfg=dossierEditorCatalog[bundle.kind];if(!cfg)return {ok:false,message:"Onbekende fiche."};
 const problems=validateEditorBundle(bundle);if(problems.length)return {ok:false,message:"Controleer de ingevulde velden. Er is niets opgeslagen."};
 const {supabase,membership}=await requireActiveMembership();
 const capability=bundle.kind==="expense"&&!bundle.root.new?"manageFinance":cfg.capability;
 if(capability!=="active"&&!hasPermission(membership,capability as Capability))return {ok:false,message:"Je hebt geen bevoegdheid om deze fiche te wijzigen."};
 const {data,error}=await supabase.rpc("save_dossier_bundle",{p_organization_id:membership.organization_id,p_bundle:bundle});
 if(error)return {ok:false,message:error.code==="40001"?"Dit dossier of een onderdeel is ondertussen gewijzigd. Je invoer blijft hier staan; vergelijk de recente versie voordat je opnieuw opslaat.":error.code==="42883"?"De gezamenlijke opslag is nog niet beschikbaar. Voer eerst de bijbehorende migratie uit.":"Het volledige dossier is niet opgeslagen. Controleer de velden, koppelingen en bevoegdheden."};
 if(data!==bundle.root.id)return {ok:false,message:"De opslag kon niet worden bevestigd. Controleer het dossier voordat je opnieuw probeert."};
 for(const def of Object.values(dossierEditorCatalog))revalidatePath(def.path,"layout");
 const listOnly=["asset","member","mandate","deadline","administration"].includes(bundle.kind);
 return {ok:true,href:`${cfg.path}${listOnly?"":`/${bundle.root.id}`}?succes=dossier`};
}
