import {requirePermission} from "@/lib/auth-context";
import {notFound} from "next/navigation";
import {DossierWorkspace} from "./dossier-workspace";
import {dossierEditorCatalog} from "@/lib/dossier-editor-catalog";
import type {EditorRecord} from "@/lib/dossier-editor-draft";

const moduleKinds:Record<string,string>={sponsors:"partner",community:"community",campagnes:"campaign",social:"social"};
const creationKinds:Record<string,string>={taak:"task",project:"project",event:"event",campagne:"campaign",content:"content",social:"social",budget:"budget",kost:"expense",inkomst:"income",product:"product",lancering:"launch",lid:"member",mandaat:"mandate",deadline:"deadline",document:"administration"};
const names:Record<string,string>={task:"Taken",project:"Projecten",event:"Events",campaign:"Campagnes",partner:"Sponsors & CRM",community:"Community & vrijwilligers",social:"Social planning",content:"Content",meeting:"Vergaderingen & besluiten",inbox:"Inbox",knowledge:"Kennisbank",expense:"Financiën",income:"Financiën",budget:"Financiën",product:"Shop & merchandise",launch:"Shop & merchandise",asset:"Materialen & resources",newsletter:"Nieuwsbrieven",member:"VZW-administratie",mandate:"VZW-administratie",deadline:"VZW-administratie",administration:"VZW-administratie"};
export async function dossierEditorGate({kind,module,id,query,group}:{kind?:string;module?:string;id?:string;query:Record<string,string|undefined>;group?:"finance"|"shop"|"administration"}){
 if(query.fout)return null;
 const parentKind=kind??(module?moduleKinds[module]:undefined);
 let target=parentKind;
 if(group==="finance")target=({budget:"budget",kost:"expense",inkomst:"income"} as Record<string,string>)[query.nieuw??""];
 if(group==="shop")target=({product:"product",lancering:"launch"} as Record<string,string>)[query.nieuw??""];
 if(group==="administration")target=({lid:"member",mandaat:"mandate",deadline:"deadline",document:"administration"} as Record<string,string>)[query.nieuw??""]??(["member","mandate","deadline","administration"].includes(query.fiche??"")?query.fiche:undefined);
 const eventPart=parentKind==="event"&&["materiaal","schema","activiteit","giveaway","inschrijving","financieel"].some(key=>Boolean(query[key]));
 const editing=(Boolean(query.bewerken)||eventPart)&&!query.nieuw;
 if(!editing&&query.nieuw&&query.nieuw!=="1")target=creationKinds[query.nieuw]??target;
 if(!query.nieuw&&!editing||!target||!dossierEditorCatalog[target])return null;
 // Categories/templates/etc. keep their own settings workflow.
 if(query.nieuw&&!creationKinds[query.nieuw]&&query.nieuw!=="1"&&query.nieuw!=="artikel")return null;
 const cfg=dossierEditorCatalog[target];
 const parent=parentKind?dossierEditorCatalog[parentKind]:null;
 const returnTo=group==="finance"?"/app/financien":group==="shop"?"/app/shop":group==="administration"?"/app/administratie":`${parent?.path??cfg.path}${id?`/${id}`:""}`;
 const preset:EditorRecord={};
 if(!editing&&id&&parent){const foreignKey=({project:"project_id",event:"event_id",campaign:"campaign_id",partner:"partner_id"} as Record<string,string>)[parentKind!];if(foreignKey&&cfg.fields.includes(foreignKey))preset[foreignKey]=id;}
 if(target==="task"&&!editing&&parentKind==="asset"&&query.herstel_asset_id){
  if(!/^[0-9a-f-]{36}$/i.test(query.herstel_asset_id))notFound();
  const {supabase,membership}=await requirePermission("manageOrganization");
  const {data:asset,error}=await supabase.from("assets").select("id,name").eq("organization_id",membership.organization_id).eq("id",query.herstel_asset_id).is("deleted_at",null).maybeSingle();
  if(error)throw Error("Het materiaal voor de herstelling kan niet worden geladen.");
  if(!asset)notFound();
  preset.repair_asset_id=asset.id;
  preset.title="Herstelling — "+asset.name;
 }
 const context=!editing&&id&&parent?.entity?{type:parent.entity,id}:undefined;
 return <DossierWorkspace kind={target} id={editing?id??query.bewerken:undefined} active={names[parentKind??target]??names[target]} returnTo={returnTo} preset={preset} initialTab={query.tab} context={context}/>;
}
