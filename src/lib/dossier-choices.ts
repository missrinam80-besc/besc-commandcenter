import {dossierEditorCatalog} from "./dossier-editor-catalog";
import schemas from "./dossier-editor-schema.json";
import {dossierChoiceLabel,dossierFieldLabel} from "./dossier-editor-labels";

export type DossierChoice={set_key:string;value:string;label:string;position:number;is_default?:boolean;usage_count?:number};
// Only classifications. Workflow states, permissions, integration channels and routing stay fixed.
export const managedChoiceFields:Record<string,string>={
 "events.event_type":"Events · Eventtype",
 "event_schedule_items.kind":"Programma en inzet · Soort onderdeel",
 "content_items.content_type":"Content · Contenttype",
 "budget_envelopes.category":"Budgetten · Categorie",
 "expenses.category":"Kosten · Categorie",
 "income_entries.income_type":"Inkomsten · Inkomstentype",
 "partner_interactions.interaction_type":"Sponsors · Contacttype",
 "community_onboarding_items.item_type":"Community · Soort onboarding",
 "meetings.meeting_type":"Vergaderingen · Vergaderingstype",
 "knowledge_articles.article_type":"Kennisbank · Artikeltype",
 "shop_products.product_type":"Shop · Producttype",
 "assets.asset_type":"Materialen · Materiaaltype",
 "association_members.membership_type":"VZW · Lidmaatschapstype",
 "compliance_deadlines.category":"VZW · Deadlinecategorie",
 "administrative_documents.document_type":"VZW · Documenttype",
};
export function choiceKey(table:string,field:string){return `${table}.${field}`;}
export function managedChoice(table:string,field:string){return choiceKey(table,field) in managedChoiceFields;}
export function dossierChoiceSets(){
 const all=new Map<string,{key:string;table:string;field:string;label:string;editable:boolean;defaultValue:unknown;values:{value:string;label:string}[]}>();
 for(const [kind,tables] of Object.entries(schemas))for(const [table,fields]of Object.entries(tables))for(const field of fields){
  const key=choiceKey(table,field.name);if(!field.options.length||all.has(key))continue;
  all.set(key,{key,table,field:field.name,label:managedChoiceFields[key]??`${([dossierEditorCatalog[kind],...dossierEditorCatalog[kind].collections].find(def=>def.table===table)?.label??table)} · ${dossierFieldLabel(field.name)}`,editable:managedChoice(table,field.name),defaultValue:field.default,values:field.options.map((value:string)=>({value,label:dossierChoiceLabel(value)}))});
 }
 return [...all.values()];
}
export function choiceOptionKey(table:string,field:string){return `choices:${choiceKey(table,field)}`;}
export function choiceValue(label:string){return label.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"").slice(0,80);}
