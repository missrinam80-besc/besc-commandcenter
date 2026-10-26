import {dossierEditorCatalog,dossierFieldTab,type EditorConfig} from "./dossier-editor-catalog";
import {assetStorageValues} from "./asset-followup";
import schemas from "./dossier-editor-schema.json";
import {eventEditorValues,eventEditorStorageValues,eventEditorTimingError} from "./event-editor-timing";
import {managedChoice,choiceKey} from "./dossier-choices";
import {communityProfileTypes} from "./community-people";

export type FieldSchema={name:string;type:string;required:boolean;default:unknown;options:string[];reference:string|null};
export type EditorRecord=Record<string,unknown>;
export type DraftRow={localId:string;id:string;values:EditorRecord;base:EditorRecord|null;deleted:boolean};
export type DossierDraft={kind:string;id:string;values:EditorRecord;base:EditorRecord|null;parts:Record<string,DraftRow[]>};
export type EditorChange={id:string;new:boolean;values:EditorRecord;base:EditorRecord|null;delete?:boolean;collection?:string};
export type EditorBundle={kind:string;root:EditorChange;parts:EditorChange[];partner_contribution?:string};
export function editorFields(kind:string,table:string):FieldSchema[]{
  const fields=(schemas as unknown as Record<string,Record<string,FieldSchema[]>>)[kind]?.[table]??[];
  return table==="community_people"?fields.map(field=>field.name==="person_type"?{...field,options:Object.keys(communityProfileTypes)}:field):fields;
}
export function defaultEditorValues(kind:string,table:string):EditorRecord {
  return Object.fromEntries(editorFields(kind,table).filter(field=>field.default!==null).map(field=>[field.name,field.default]));
}
export function createDossierDraft(kind:string,id:string,record:EditorRecord|null,parts:Record<string,EditorRecord[]>={}):DossierDraft {
  const cfg=dossierEditorCatalog[kind];if(!cfg)throw Error("Onbekend dossiertype");
  return {kind,id,base:record,values:kind==="event"?eventEditorValues(record??defaultEditorValues(kind,cfg.table)):record?{...record}:defaultEditorValues(kind,cfg.table),parts:Object.fromEntries(cfg.collections.map(part=>[part.table,(parts[part.table]??[]).map((row,index)=>({localId:`${part.table}:${index}`,id:String(row[part.key??"id"]??""),values:{...row},base:record?row:null,deleted:false}))]))};
}
function equal(a:unknown,b:unknown){return JSON.stringify(a??null)===JSON.stringify(b??null);}
function changed(values:EditorRecord,base:EditorRecord|null,allowed:string[]):EditorRecord {
  return Object.fromEntries(allowed.filter(key=>key in values&&(!base||!equal(values[key],base[key]))).map(key=>[key,values[key]]));
}
export function buildEditorBundle(draft:DossierDraft):EditorBundle {
  const cfg=dossierEditorCatalog[draft.kind];if(!cfg)throw Error("Onbekend dossiertype");
  const root={id:draft.id,new:!draft.base,values:changed(draft.kind==="event"?eventEditorStorageValues(draft.values):draft.kind==="asset"?assetStorageValues(draft.values):draft.values,draft.base,cfg.fields),base:draft.base};
  const parts:EditorChange[]=[];
  for(const part of cfg.collections)for(const row of draft.parts[part.table]??[]){
    if(row.deleted&&!row.base)continue;
    const values=changed(row.values,row.base,part.fields);
    if(row.base&&!row.deleted&&Object.keys(values).length===0)continue;
    const id=!row.base&&part.key&&part.key!=="id"?String(row.values[part.key]??row.id):row.id;
    parts.push({id,new:!row.base,values,base:row.base,delete:row.deleted,collection:part.table});
  }
  return {kind:draft.kind,root,parts};
}
export function editorHasChanges(draft:DossierDraft){const bundle=buildEditorBundle(draft);return !draft.base||Object.keys(bundle.root.values).length>0||bundle.parts.length>0;}
export type EditorIssue={message:string;tab?:string;field?:string;rowId?:string;collection?:string;label?:string};
export function validateEditorBundle(bundle:EditorBundle,config:EditorConfig=dossierEditorCatalog[bundle.kind]):string[]{
 return [...new Set(validateEditorIssues(bundle,config).map(issue=>issue.message))];
}
export function validateEditorIssues(bundle:EditorBundle,config:EditorConfig=dossierEditorCatalog[bundle.kind],choiceValues?:Record<string,string[]>):EditorIssue[]{
  if(!config||config!==dossierEditorCatalog[bundle.kind])return [{message:"Onbekend dossiertype."}];
  const problems:EditorIssue[]=[];
  let location:Omit<EditorIssue,"message">={};
  const add=(message:string,field?:string)=>problems.push({...location,message,field,tab:field&&!location.collection?dossierFieldTab(field,config):location.tab});
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if(!uuid.test(bundle.root.id)||bundle.root.delete)add("Ongeldig hoofddossier.");
  if(bundle.parts.length>250)add("Er staan te veel onderdelen in deze wijziging.");
  const seen=new Set<string>();
  for(const [index,change] of [bundle.root,...bundle.parts].entries()){
    location={};
    const part=index===0?null:config.collections.find(p=>p.table===change.collection);
    if(index>0&&!part){add("Onbekend dossieronderdeel.");continue;}
    location={tab:part?.tab??config.tabs[0].id,rowId:change.id,collection:part?.table,label:part?`${part.label}: ${String(change.values.title??change.values.name??change.base?.title??change.base?.name??"onderdeel")}`:config.label};
    const fields=index===0?config.fields:part!.fields;
    const table=index===0?config.table:part!.table;
    const key=index===0?"id":part?.key??"id";
    const identity=`${table}:${change.id}`;if(seen.has(identity))add("Hetzelfde onderdeel staat tweemaal in de wijziging.");seen.add(identity);
    if(key==="id"&&!uuid.test(change.id))add("Ongeldig onderdeel.");
    if(!change.new&&!change.base)add("De oorspronkelijke versie ontbreekt.");
    if(change.delete){if(index===0)add("Verwijderen van de fiche is een aparte dossieractie.");continue;}
    for(const name of Object.keys(change.values))if(!fields.includes(name))add("Deze wijziging bevat een veld dat niet bij het dossier hoort.");
    const all={...change.base,...change.values};
    if(table==="assets"&&change.new&&!all.acquisition_type)add("Kies of het materiaal aangekocht, geleend of gekregen is.","acquisition_type");
    if(table==="event_activities"){
      const title=String(all.title??"").trim();if(title.length<2||title.length>180)add("De titel van de activiteit moet 2 tot 180 tekens bevatten.","title");
      if(String(all.description??"").length>16000)add("De uitleg mag maximaal 16000 tekens bevatten.","description");
      if(!Number.isInteger(all.position)||Number(all.position)<0)add("Gebruik een geheel getal vanaf 0 voor de volgorde.","position");
    }
    if(table==="event_schedule_items"){
      if(all.activity_id&&bundle.parts.some(part=>part.collection==="event_activities"&&part.id===all.activity_id&&part.delete))add("Deze activiteit wordt verwijderd. Koppel het programmaonderdeel eerst los of kies een andere activiteit.","activity_id");
      if(!all.kind)add("Kies een soort onderdeel.","kind");
      if(!all.status)add("Kies een status voor het tijdslot.","status");
      const start=all.starts_at,end=all.ends_at;
      if(end&&!start)add("Voor een eindmoment is een startmoment nodig.","starts_at");
      if(start&&end&&new Date(String(end)).getTime()<=new Date(String(start)).getTime())add("Het eindmoment moet na het startmoment liggen.","ends_at");
      const title=String(all.title??"").trim();
      if(title.length<2||title.length>180)add("De titel van het tijdslot moet 2 tot 180 tekens bevatten.","title");
      if(String(all.location??"").length>300)add("De locatie mag maximaal 300 tekens bevatten.","location");
      if(String(all.notes??"").length>4000)add("De praktische afspraken mogen maximaal 4000 tekens bevatten.","notes");
    }
    if(table==="events"){const timingError=eventEditorTimingError(all);if(timingError)add(timingError,"end_date");}
    for(const field of editorFields(bundle.kind,table)){
      const value=all[field.name];
      if(field.required&&(value===null||value===undefined||value===""))add(`Vul ${field.name} in.`,field.name);
      if(value===null||value===undefined||value==="")continue;
      const allowed=managedChoice(table,field.name)?choiceValues?.[choiceKey(table,field.name)]:field.options.length?field.options:undefined;
      if(allowed&&!allowed.includes(String(value)))add(`Kies een geldige waarde voor ${field.name}.`,field.name);
      if(/timestamp|timestamptz|^date$/.test(field.type)&&!Number.isFinite(new Date(String(value)).getTime()))add(`Vul een geldige datum of tijd in bij ${field.name}.`,field.name);
      if(field.type==="uuid"&&!uuid.test(String(value)))add(`Kies een geldige koppeling voor ${field.name}.`,field.name);
      if(field.type==="boolean"&&typeof value!=="boolean")add(`Gebruik een geldige ja/nee-keuze voor ${field.name}.`,field.name);
      if(field.type.endsWith("[]")&&(!Array.isArray(value)||value.some(v=>typeof v!=="string")))add(`Gebruik een lijst van tekstwaarden voor ${field.name}.`,field.name);
      if(/^(integer|bigint|smallint|numeric|decimal)/.test(field.type)&&(!Number.isFinite(Number(value))||(typeof value!=="number")))add(`Vul een geldig getal in bij ${field.name}.`,field.name);
      if(typeof value==="string"&&value.length>30000)add(`De tekst bij ${field.name} is te lang.`,field.name);
      if(typeof value==="string"&&/(_url|^url$|^website$)/.test(field.name))try{const url=new URL(value);if(!["https:","http:"].includes(url.protocol))throw Error();}catch{add(`Vul een volledige http- of https-link in bij ${field.name}.`,field.name);}
    }
  }
  return problems;
}
