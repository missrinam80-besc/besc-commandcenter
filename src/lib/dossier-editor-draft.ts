import {dossierEditorCatalog,type EditorConfig} from "./dossier-editor-catalog";
import schemas from "./dossier-editor-schema.json";

export type FieldSchema={name:string;type:string;required:boolean;default:unknown;options:string[];reference:string|null};
export type EditorRecord=Record<string,unknown>;
export type DraftRow={localId:string;id:string;values:EditorRecord;base:EditorRecord|null;deleted:boolean};
export type DossierDraft={kind:string;id:string;values:EditorRecord;base:EditorRecord|null;parts:Record<string,DraftRow[]>};
export type EditorChange={id:string;new:boolean;values:EditorRecord;base:EditorRecord|null;delete?:boolean;collection?:string};
export type EditorBundle={kind:string;root:EditorChange;parts:EditorChange[]};
export function editorFields(kind:string,table:string):FieldSchema[]{
  return (schemas as unknown as Record<string,Record<string,FieldSchema[]>>)[kind]?.[table]??[];
}
export function defaultEditorValues(kind:string,table:string):EditorRecord {
  return Object.fromEntries(editorFields(kind,table).filter(field=>field.default!==null).map(field=>[field.name,field.default]));
}
export function createDossierDraft(kind:string,id:string,record:EditorRecord|null,parts:Record<string,EditorRecord[]>={}):DossierDraft {
  const cfg=dossierEditorCatalog[kind];if(!cfg)throw Error("Onbekend dossiertype");
  return {kind,id,base:record,values:record?{...record}:defaultEditorValues(kind,cfg.table),parts:Object.fromEntries(cfg.collections.map(part=>[part.table,(parts[part.table]??[]).map((row,index)=>({localId:`${part.table}:${index}`,id:String(row[part.key??"id"]??""),values:{...row},base:record?row:null,deleted:false}))]))};
}
function equal(a:unknown,b:unknown){return JSON.stringify(a??null)===JSON.stringify(b??null);}
function changed(values:EditorRecord,base:EditorRecord|null,allowed:string[]):EditorRecord {
  return Object.fromEntries(allowed.filter(key=>key in values&&(!base||!equal(values[key],base[key]))).map(key=>[key,values[key]]));
}
export function buildEditorBundle(draft:DossierDraft):EditorBundle {
  const cfg=dossierEditorCatalog[draft.kind];if(!cfg)throw Error("Onbekend dossiertype");
  const root={id:draft.id,new:!draft.base,values:changed(draft.values,draft.base,cfg.fields),base:draft.base};
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
export function validateEditorBundle(bundle:EditorBundle,config:EditorConfig=dossierEditorCatalog[bundle.kind]):string[]{
  if(!config||config!==dossierEditorCatalog[bundle.kind])return ["Onbekend dossiertype."];
  const problems:string[]=[];
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if(!uuid.test(bundle.root.id)||bundle.root.delete)problems.push("Ongeldig hoofddossier.");
  if(bundle.parts.length>250)problems.push("Er staan te veel onderdelen in deze wijziging.");
  const seen=new Set<string>();
  for(const [index,change] of [bundle.root,...bundle.parts].entries()){
    const part=index===0?null:config.collections.find(p=>p.table===change.collection);
    if(index>0&&!part){problems.push("Onbekend dossieronderdeel.");continue;}
    const fields=index===0?config.fields:part!.fields;
    const table=index===0?config.table:part!.table;
    const key=index===0?"id":part?.key??"id";
    const identity=`${table}:${change.id}`;if(seen.has(identity))problems.push("Hetzelfde onderdeel staat tweemaal in de wijziging.");seen.add(identity);
    if(key==="id"&&!uuid.test(change.id))problems.push("Ongeldig onderdeel.");
    if(!change.new&&!change.base)problems.push("De oorspronkelijke versie ontbreekt.");
    if(change.delete){if(index===0)problems.push("Verwijderen van de fiche is een aparte dossieractie.");continue;}
    for(const name of Object.keys(change.values))if(!fields.includes(name))problems.push("Deze wijziging bevat een veld dat niet bij het dossier hoort.");
    const all={...change.base,...change.values};
    for(const field of editorFields(bundle.kind,table)){
      const value=all[field.name];
      if(field.required&&(value===null||value===undefined||value===""))problems.push(`Vul ${field.name} in.`);
      if(value===null||value===undefined||value==="")continue;
      if(field.options.length&&!field.options.includes(String(value)))problems.push(`Controleer ${field.name}.`);
      if(field.type==="uuid"&&!uuid.test(String(value)))problems.push(`Controleer de koppeling ${field.name}.`);
      if(field.type==="boolean"&&typeof value!=="boolean")problems.push(`Controleer ${field.name}.`);
      if(field.type.endsWith("[]")&&(!Array.isArray(value)||value.some(v=>typeof v!=="string")))problems.push(`Controleer ${field.name}.`);
      if(/^(integer|bigint|smallint|numeric|decimal)/.test(field.type)&&(!Number.isFinite(Number(value))||(typeof value!=="number")))problems.push(`Controleer het getal bij ${field.name}.`);
      if(typeof value==="string"&&value.length>30000)problems.push(`De tekst bij ${field.name} is te lang.`);
      if(typeof value==="string"&&/(_url|^url$|^website$)/.test(field.name))try{const url=new URL(value);if(!["https:","http:"].includes(url.protocol))throw Error();}catch{problems.push(`Controleer de link bij ${field.name}.`);}
    }
  }
  return [...new Set(problems)];
}
