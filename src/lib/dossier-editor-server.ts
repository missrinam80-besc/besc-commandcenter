import {randomUUID} from "node:crypto";
import {notFound,redirect} from "next/navigation";
import {requireActiveMembership} from "./auth-context";
import {hasPermission,type Capability} from "./permissions";
import {dossierEditorCatalog} from "./dossier-editor-catalog";
import {editorFields,type EditorRecord} from "./dossier-editor-draft";
import type {EditorOption} from "@/components/dossier-editor";

export async function loadDossierEditor(kind:string,id?:string,preset:EditorRecord={}){
 const cfg=dossierEditorCatalog[kind];if(!cfg)notFound();
 const {supabase,membership,user}=await requireActiveMembership();
 const capability=kind==="expense"&&id?"manageFinance":cfg.capability;
 if(capability!=="active"&&!hasPermission(membership,capability as Capability))redirect("/app?fout=geen-toegang");
 let record:EditorRecord|null=null;
 if(id){let query=supabase.from(cfg.table).select("*").eq("organization_id",membership.organization_id).eq("id",id);if(editorFields(kind,cfg.table).some(f=>f.name==="deleted_at"))query=query.is("deleted_at",null);
   const result=await query.maybeSingle();if(result.error)throw Error("De fiche kan niet worden geladen.");if(!result.data||result.data.deleted_at)notFound();record=result.data;
 }
 const permissions:Record<string,boolean>={},parts:Record<string,EditorRecord[]>={};
 permissions.manageFinance=hasPermission(membership,"manageFinance");
 permissions.eventSponsors=membership.role==="admin"||membership.role==="board";
 await Promise.all(cfg.collections.map(async part=>{
   permissions[part.table]=(part.capability??cfg.capability)==="active"||hasPermission(membership,(part.capability??cfg.capability) as Capability);
   if(!id){parts[part.table]=[];return;}
   let query=supabase.from(part.table).select("*");
   if(part.through){
     const {data:relations,error}=await supabase.from("record_relationships").select("source_type,source_id,target_type,target_id").eq("organization_id",membership.organization_id).or(`and(source_type.eq.${part.entityValue},source_id.eq.${id},target_type.eq.task),and(target_type.eq.${part.entityValue},target_id.eq.${id},source_type.eq.task)`);
     if(error)throw Error("Eventtaken kunnen niet worden geladen.");
     const ids=(relations??[]).map(row=>row.source_type==="task"?row.source_id:row.target_id);if(!ids.length){parts[part.table]=[];return;}query=query.in("id",ids).eq("organization_id",membership.organization_id);
   }else if(part.table==="record_relationships")query=query.eq("organization_id",membership.organization_id).or(`and(source_id.eq.${id},source_type.eq.${part.entityValue}),and(target_id.eq.${id},target_type.eq.${part.entityValue})`);
   else query=query.eq(part.parentField,id);
   if(part.entityField&&part.table!=="record_relationships")query=query.eq(part.entityField,part.entityValue);
   if(part.table==="google_resource_links")query=query.in("resource_type",["document","folder"]);
   const {data,error}=await query;
   if(error){if(!permissions[part.table]){parts[part.table]=[];return;}throw Error(`De onderdelen van ${part.label} kunnen niet worden geladen.`);}
   parts[part.table]=(data??[]).filter(row=>!row.deleted_at&&(!row.organization_id||row.organization_id===membership.organization_id));
   if(part.table==="comments")for(const row of parts[part.table])permissions[`comments:${row.id}`]=row.author_id===user.id;
 }));
 const options:Record<string,EditorOption[]>={};
 const refs=new Set([cfg.table,...cfg.collections.map(part=>part.table)].flatMap(table=>editorFields(kind,table).flatMap(field=>field.reference?[field.reference]:[])));
 if(cfg.collections.some(part=>part.table==="record_relationships"))for(const target of ["projects","events","campaigns","content_items","partners","community_people","tasks"])refs.add(target);
 if(kind==="expense"&&!permissions.manageFinance)refs.delete("budget_envelopes");
 // Composite foreign keys are represented explicitly rather than guessed from labels.
 for(const [field,target] of Object.entries({person_id:"community_people",responsible_person_id:"community_people",community_person_id:"community_people",owner_person_id:"community_people",asset_id:"assets"})){
   if([cfg,...cfg.collections].some(def=>def.fields.includes(field)))refs.add(target);
 }
 await Promise.all([...refs].map(async table=>{
   if(table==="profiles"){
     const {data,error}=await supabase.from("organization_members").select("user_id,profiles(display_name)").eq("organization_id",membership.organization_id).eq("status","active");
     if(error)throw Error("Accountkeuzes kunnen niet worden geladen.");
     options[table]=(data??[]).map(row=>({id:row.user_id,label:String((row.profiles as unknown as {display_name?:string}|null)?.display_name??"Account")}));return;
   }
   const {data,error}=await supabase.from(table).select("*").eq("organization_id",membership.organization_id).limit(1000);
   if(error){options[table]=[];return;}
   options[table]=(data??[]).filter(row=>!row.deleted_at).map(row=>({id:row.id,label:String(row.title??row.name??row.display_name??row.full_name??row.id),searchText:[row.handle,row.discord_handle].filter(Boolean).join(" ")}));
 }));
 for(const [field,target] of Object.entries({person_id:"community_people",responsible_person_id:"community_people",community_person_id:"community_people",owner_person_id:"community_people",asset_id:"assets"}))options[field]=options[target]??[];
 return {kind,id:id??randomUUID(),record,parts,options,permissions,preset};
}
