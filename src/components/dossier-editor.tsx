"use client";
import {useEffect,useState,type FormEvent} from "react";
import {useRouter} from "next/navigation";
import {RichTextField} from "./rich-text-field";
import {isRichTextField} from "@/lib/rich-text";
import {dossierEditorCatalog,dossierFieldTab,type EditorCollection} from "@/lib/dossier-editor-catalog";
import {buildEditorBundle,createDossierDraft,defaultEditorValues,editorFields,editorHasChanges,validateEditorIssues,type DossierDraft,type DraftRow,type EditorBundle,type EditorRecord,type EditorIssue,type FieldSchema} from "@/lib/dossier-editor-draft";
import {dossierFieldLabel,dossierChoiceLabel} from "@/lib/dossier-editor-labels";
import {formatDateTimeLocal,localDateTimeToIso} from "@/lib/format";
import {eventPartnerIds,eventPartnerForRow,selectEventPartners} from "@/lib/event-editor-partners";
import {editorIssueText} from "@/lib/dossier-editor-feedback";
import {managedChoice,choiceKey,choiceOptionKey} from "@/lib/dossier-choices";
import {hasDossierDriveFolder,unlinkDossierDriveFolder} from "@/lib/dossier-drive-unlink";

export type EditorOption={id:string;label:string;searchText?:string};
function ArrayField({id,label,value,disabled,onChange}:{id:string;label:string;value:unknown;disabled:boolean;onChange:(value:string[])=>void}){
  const [text,setText]=useState(Array.isArray(value)?value.join(", "):String(value??""));
  return <label htmlFor={id}>{label}<input id={id} disabled={disabled} value={text} onChange={event=>{setText(event.target.value);onChange(event.target.value.split(",").map(item=>item.trim()).filter(Boolean));}}/><small>Meerdere waarden scheiden met een komma.</small></label>;
}
function ReferenceField({id,label,value,choices,disabled,required,onChange}:{id:string;label:string;value:string;choices:EditorOption[];disabled:boolean;required:boolean;onChange:(value:string|null)=>void}){
  const [query,setQuery]=useState("");
  const filtered=choices.filter(choice=>choice.id===value||`${choice.label} ${choice.searchText??""}`.toLocaleLowerCase("nl-BE").includes(query.toLocaleLowerCase("nl-BE")));
  return <label htmlFor={id}>{label}{choices.length>10&&<input disabled={disabled} aria-label={`Zoek ${label.toLowerCase()}`} placeholder="Zoeken…" type="search" value={query} onChange={event=>setQuery(event.target.value)}/>}<select id={id} disabled={disabled} aria-required={required} value={value} onChange={event=>onChange(event.target.value||null)}><option value="">Kies…</option>{filtered.map(choice=><option key={choice.id} value={choice.id}>{choice.label}</option>)}{value&&!choices.some(choice=>choice.id===value)&&<option value={value}>Huidige koppeling</option>}</select></label>;
}
type SaveResult={ok:boolean;message?:string;href?:string;issues?:EditorIssue[]};
function MultiReferenceField({id,choices,selected,disabled,onChange}:{id:string;choices:EditorOption[];selected:string[];disabled:boolean;onChange:(ids:string[])=>void}){
  const [query,setQuery]=useState("");
  const available:EditorOption[]=[...choices,...selected.filter(value=>!choices.some(choice=>choice.id===value)).map(value=>({id:value,label:"Huidige koppeling"}))];
  const filtered=available.filter(choice=>`${choice.label} ${choice.searchText??""}`.toLocaleLowerCase("nl-BE").includes(query.toLocaleLowerCase("nl-BE")));
  return <fieldset className="event-partner-picker"><legend>Sponsors / partners</legend><details><summary>{selected.length?`${selected.length} geselecteerd`:"Kies sponsors / partners…"}</summary><input id={id} aria-label="Zoek sponsors / partners" type="search" disabled={disabled} value={query} placeholder="Zoeken…" onChange={e=>setQuery(e.target.value)}/><div className="event-partner-options">{filtered.map(choice=><label className="inline-check" key={choice.id}><input type="checkbox" disabled={disabled} checked={selected.includes(choice.id)} onChange={e=>onChange(e.target.checked?[...selected,choice.id]:selected.filter(value=>value!==choice.id))}/>{choice.label}</label>)}{!filtered.length&&<p className="form-help">Geen sponsors gevonden.</p>}</div></details><small>Je kunt meerdere sponsors koppelen. Ze worden samen met het event opgeslagen.</small></fieldset>;
}
export type DossierEditorProps={
  kind:string;id:string;record?:EditorRecord|null;parts?:Record<string,EditorRecord[]>;
  options?:Record<string,EditorOption[]>;permissions?:Record<string,boolean>;
  mode:"create"|"edit";cancelHref:string;
  initialValues?:EditorRecord;
  initialTab?:string;
  onSave?:(bundle:EditorBundle)=>Promise<SaveResult>;
};

export function DossierEditor({kind,id,record=null,parts={},options={},permissions={},mode,cancelHref,onSave,initialValues={},initialTab}:DossierEditorProps){
  const router=useRouter();
  const cfg=dossierEditorCatalog[kind];
  const visibleRootFields=editorFields(kind,cfg.table).filter(field=>kind!=="event"||!["start_at","end_at"].includes(field.name));
  const [draft,setDraft]=useState<DossierDraft>(()=>{const created=createDossierDraft(kind,id,record,parts);if(!record)created.values={...created.values,...initialValues};return created;});
  const [tab,setTab]=useState(cfg.tabs.find(item=>item.id===initialTab)?.id??cfg.tabs[0].id),[saving,setSaving]=useState(false),[message,setMessage]=useState("");
  const [issues,setIssues]=useState<EditorIssue[]>([]);
  const dirty=editorHasChanges(draft);
  const folderUnlinkPending=!hasDossierDriveFolder(draft)&&(Boolean(draft.base?.drive_url)||(draft.parts.google_resource_links??[]).some(row=>row.deleted&&row.base?.resource_type==="folder"));
  const [touched,setTouched]=useState(false);
  useEffect(()=>{
    if(!dirty||!touched)return;
    const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();};
    const leave=(event:MouseEvent)=>{const link=event.target instanceof Element?event.target.closest("a"):null;if(!link||link.target==="_blank"||event.ctrlKey||event.metaKey||event.shiftKey||link.download||link.href===window.location.href)return;if(!window.confirm("Niet-opgeslagen wijzigingen verwerpen?")){event.preventDefault();event.stopPropagation();}};
    window.addEventListener("beforeunload",warn);document.addEventListener("click",leave,true);return()=>{window.removeEventListener("beforeunload",warn);document.removeEventListener("click",leave,true);};
  },[dirty,touched]);
  function cancel(){if(!dirty||!touched||window.confirm("Niet-opgeslagen wijzigingen verwerpen?"))router.push(cancelHref);}
  function updateRoot(name:string,value:unknown){setTouched(true);setDraft(current=>({...current,values:{...current.values,[name]:value}}));}
  function updateRow(part:EditorCollection,row:DraftRow,name:string,value:unknown){setTouched(true);setDraft(current=>({...current,parts:{...current.parts,[part.table]:(current.parts[part.table]??[]).map(item=>item.localId===row.localId?{...item,values:{...item.values,[name]:value}}:item)}}));}
  function addRow(part:EditorCollection){setTouched(true);const uuid=crypto.randomUUID();setDraft(current=>({...current,parts:{...current.parts,[part.table]:[...(current.parts[part.table]??[]),{localId:uuid,id:part.key&&part.key!=="id"?"":uuid,values:{...defaultEditorValues(kind,part.table),...(part.table==="record_relationships"?{source_id:id,source_type:part.entityValue}:{})},base:null,deleted:false}]}}));}
  function toggleRemoval(part:EditorCollection,row:DraftRow){setTouched(true);setDraft(current=>({...current,parts:{...current.parts,[part.table]:(current.parts[part.table]??[]).map(item=>item.localId===row.localId?{...item,deleted:!item.deleted}:item)}}));}
  function input(field:FieldSchema,values:EditorRecord,change:(name:string,value:unknown)=>void,readonly=false,prefix=id,table=cfg.table){
    readonly=readonly||(table==="expenses"&&field.name==="budget_id"&&permissions.manageFinance===false);
    const value=values[field.name]??"",label=dossierFieldLabel(field.name),inputId=`${field.name}-${prefix}`;
    const invalid=issues.some(issue=>issue.field===field.name&&issue.rowId===prefix);
    const shared={id:inputId,disabled:readonly||saving,"aria-required":field.required,"aria-invalid":invalid||undefined,"aria-describedby":invalid?"dossier-save-feedback":undefined};
    const managed=managedChoice(table,field.name),managedOptions=options[choiceOptionKey(table,field.name)]??[];
    const known=(managed?managedOptions.map(option=>option.id):field.options).filter(choice=>field.name==="target_type"?['project','event','campaign','content','partner','community_person','task'].includes(choice):field.name==="resource_type"?['document','folder'].includes(choice):field.name==="status"&&table==="expenses"?!['paid','approved','reimbursed'].includes(choice):field.name==="status"&&table==="budget_envelopes"?choice!=="approved":true);
    const relationTable=({project:"projects",event:"events",campaign:"campaigns",content:"content_items",partner:"partners",community_person:"community_people",task:"tasks"} as Record<string,string>)[String(values.target_type??"")];
    const candidates=field.name==="target_id"?options[relationTable]??[]:field.reference?options[field.reference]??[]:options[field.name]??[];
    const linkedPending=(draft.parts[field.reference??""]??[]).filter(row=>!row.deleted).map(row=>({id:row.id,label:String(row.values.title??row.values.name??"Nieuw onderdeel")}));
    const choices=[...candidates,...linkedPending.filter(row=>!candidates.some(candidate=>candidate.id===row.id))];
    if(kind==="event"&&table==="events"&&field.name==="partner_id")return <MultiReferenceField key={field.name} id={inputId} choices={choices} selected={eventPartnerIds(draft)} disabled={readonly||saving||permissions.eventSponsors===false} onChange={ids=>{setTouched(true);setDraft(current=>selectEventPartners(current,ids,()=>crypto.randomUUID()));}}/>;
    if(field.type==="boolean")return <label className="inline-check" key={field.name}><input {...shared} type="checkbox" checked={Boolean(value)} onChange={e=>change(field.name,e.target.checked)}/>{label}</label>;
    if(field.type==="uuid")return <ReferenceField key={field.name} id={inputId} label={label} value={String(value)} choices={choices} disabled={readonly||saving} required={field.required} onChange={value=>change(field.name,value)}/>;
    if(known.length||managed)return <label key={field.name} htmlFor={inputId}>{label}<select {...shared} value={String(value)} onChange={e=>change(field.name,e.target.value||null)}><option value="">Kies…</option>{known.map(choice=><option key={choice} value={choice}>{managed?managedOptions.find(option=>option.id===choice)?.label:dossierChoiceLabel(choice)}</option>)}{value&&!known.includes(String(value))&&<option value={String(value)}>{dossierChoiceLabel(String(value))}</option>}</select></label>;
    if(field.type.endsWith("[]"))return <ArrayField key={field.name} id={inputId} label={label} value={value} disabled={readonly||saving} onChange={value=>change(field.name,value)}/>;
    if(isRichTextField(field.name))return <RichTextField key={field.name} id={inputId} label={label} value={String(value)} disabled={readonly||saving} onChange={value=>change(field.name,value||null)}/>;
    if(table==="events"&&["start_date","end_date"].includes(field.name)){
      const prefix=field.name==="start_date"?"start":"end",timeName=`${prefix}_time`,timeId=`${timeName}-${id}`;
      const minimum=prefix==="end"?String(values.start_date??""):undefined;
      const minimumTime=prefix==="end"&&values.start_date===values.end_date?String(values.start_time??""):undefined;
      return <div key={field.name} className="event-timing-fields"><label htmlFor={inputId}>{label}<input {...shared} type="date" min={minimum||undefined} value={String(value).slice(0,10)} onChange={e=>change(field.name,e.target.value||null)}/></label><label htmlFor={timeId}>{prefix==="start"?"Starttijd":"Eindtijd"}<input id={timeId} type="time" min={minimumTime||undefined} disabled={readonly||saving} value={String(values[timeName]??"")} onChange={e=>change(timeName,e.target.value)}/><small>Optioneel · Europe/Brussels</small></label></div>;
    }
    const numeric=/^(integer|bigint|smallint|numeric|decimal)/.test(field.type),date=field.type==="date",timestamp=/timestamp|timestamptz/.test(field.type);
    const type=numeric?"number":timestamp?"datetime-local":date?"date":/(_url|^url$|website)/.test(field.name)?"url":field.name==="email"?"email":"text";
    return <label key={field.name} htmlFor={inputId}>{label}<input {...shared} type={type} step={numeric?(/numeric|decimal/.test(field.type)?"0.01":"1"):undefined} value={timestamp&&value?formatDateTimeLocal(String(value)):date?String(value).slice(0,10):String(value)} onChange={e=>change(field.name,numeric?(e.target.value===""?null:Number(e.target.value)):timestamp?localDateTimeToIso(e.target.value):e.target.value||null)}/></label>;
  }
  async function save(event:FormEvent){
    event.preventDefault();if(saving||!onSave)return;
    const choiceValues=Object.fromEntries(Object.entries(options).filter(([key])=>key.startsWith("choices:")).map(([key,rows])=>[key.slice(8),rows.map(row=>row.id)]));
    for(const def of [cfg,...cfg.collections])for(const field of editorFields(kind,def.table))if(managedChoice(def.table,field.name))choiceValues[choiceKey(def.table,field.name)]??=[];
    const bundle=buildEditorBundle(draft),problems=validateEditorIssues(bundle,cfg,choiceValues);
    setIssues(problems);
    if(problems.length){setMessage("Controleer de onderstaande velden. Er is niets opgeslagen.");return;}
    setSaving(true);setMessage("");
    try{
      const result=await onSave(bundle);
      if(!result.ok){setIssues(result.issues??[]);setMessage(result.message||"Er is niets opgeslagen. Controleer de gegevens en probeer opnieuw.");return;}
      if(result.href){router.push(result.href);router.refresh();}
      else setMessage("Het volledige dossier is opgeslagen.");
    }catch{setMessage("Opslaan kon niet worden bevestigd. Je wijzigingen blijven in dit formulier staan.");}
    finally{setSaving(false);}
  }
  return <form className="dossier-editor" onSubmit={save} noValidate>
    <div className="dossier-editor-heading"><h2>{mode==="create"?`Nieuw: ${cfg.label}`:`${cfg.label} bewerken`}</h2><span>{dirty?"Niet opgeslagen":"Geen wijzigingen"}</span></div>
    <div className="event-dossier-tabs dossier-editor-tabs" role="tablist" aria-label="Dossieronderdelen">{cfg.tabs.map(item=><button type="button" role="tab" id={`editor-tab-${item.id}`} aria-controls={`editor-panel-${item.id}`} aria-selected={tab===item.id} tabIndex={tab===item.id?0:-1} key={item.id} onClick={()=>setTab(item.id)} onKeyDown={e=>{if(!["ArrowLeft","ArrowRight","Home","End"].includes(e.key))return;e.preventDefault();const index=cfg.tabs.findIndex(t=>t.id===tab);const next=e.key==="Home"?0:e.key==="End"?cfg.tabs.length-1:(index+(e.key==="ArrowRight"?1:-1)+cfg.tabs.length)%cfg.tabs.length;setTab(cfg.tabs[next].id);document.getElementById(`editor-tab-${cfg.tabs[next].id}`)?.focus();}}>{item.label}</button>)}</div>
    {message&&<div id="dossier-save-feedback" className="error-note" role="alert"><p>{message}</p>{issues.length>0&&<ul>{issues.map((issue,index)=><li key={index}>{issue.tab?<button type="button" className="dossier-error-link" onClick={()=>{setTab(issue.tab!);setTimeout(()=>{const field=issue.field&&document.getElementById(`${issue.field}-${issue.rowId??id}`);(field||document.getElementById(`editor-panel-${issue.tab}`))?.focus();},0);}}>{editorIssueText(issue)}</button>:editorIssueText(issue)}</li>)}</ul>}</div>}
    {cfg.tabs.map(item=><section key={item.id} role="tabpanel" id={`editor-panel-${item.id}`} aria-labelledby={`editor-tab-${item.id}`} hidden={tab!==item.id} className="dossier-editor-panel" tabIndex={-1}>
      {item.id==="documenten"&&(hasDossierDriveFolder(draft)||folderUnlinkPending)&&<section className="dossier-editor-basics"><h3>Drive-mapkoppeling</h3><p className="form-help">Ontkoppelen verwijdert de maplink en mapregistratie uit deze fiche. De map en bestanden in Google Drive en afzonderlijk gekoppelde documenten blijven behouden. Bevestig daarna met Alles opslaan.</p>{folderUnlinkPending&&<p role="status">De map wordt ontkoppeld zodra je Alles opslaan kiest. Annuleren bewaart de koppeling.</p>}<button type="button" disabled={saving||folderUnlinkPending||Boolean((draft.parts.google_resource_links??[]).some(row=>!row.deleted&&row.values.resource_type==="folder")&&permissions.google_resource_links!==true)} onClick={()=>{setTouched(true);setDraft(current=>unlinkDossierDriveFolder(current));}}>Map ontkoppelen bij opslaan</button></section>}
      {visibleRootFields.some(field=>dossierFieldTab(field.name,cfg)===item.id)&&<section className="dossier-editor-basics"><h3>{item.label}</h3><div className="dossier-editor-fields">{visibleRootFields.filter(field=>dossierFieldTab(field.name,cfg)===item.id).map(field=>input(field,draft.values,updateRoot))}</div></section>}
      {cfg.collections.filter(part=>part.tab===item.id).map(part=>{
        const rows=(draft.parts[part.table]??[]).filter(row=>kind!=="event"||part.table!=="record_relationships"||!eventPartnerForRow(row,id)),canManage=permissions[part.table]===true;
        return <section className="dossier-editor-collection" key={part.table}><div className="form-heading"><h3>{part.label}</h3>{canManage&&(!part.singleton||!rows.some(row=>!row.deleted))&&<button type="button" disabled={saving} onClick={()=>addRow(part)}>Toevoegen</button>}</div>
          {!rows.length&&<p className="form-help">Nog geen onderdelen toegevoegd.</p>}
          {!canManage&&<p className="form-help">Je kunt deze onderdelen bekijken. Wijzigen vraagt een aanvullende bevoegdheid.</p>}
          {rows.map(row=>{
            const canEdit=canManage&&permissions[`${part.table}:${row.id}`]!==false;
            const incoming=part.table==="record_relationships"&&row.base?.target_id===id&&row.base?.target_type===part.entityValue;
            const values=incoming?{...row.values,target_type:row.values.source_type,target_id:row.values.source_id}:row.values;
            return <details key={row.localId} open={!row.base||row.deleted||issues.some(issue=>issue.rowId===row.id&&issue.collection===part.table)} className={`dossier-editor-row ${row.deleted?"pending-removal":""}`}><summary>{String(row.values.title??row.values.name??row.values.label??part.label)}{row.deleted?" — wordt verwijderd":""}</summary><div className="dossier-editor-fields">{!row.deleted&&editorFields(kind,part.table).filter(field=>part.table!=="record_relationships"||!['source_id','source_type'].includes(field.name)).map(field=>input(field,values,(name,value)=>updateRow(part,row,incoming?name.replace(/^target_/,"source_"):name,value),!canEdit,row.localId,part.table))}</div>{canManage&&!canEdit&&<p className="form-help">Alleen de auteur kan deze opmerking wijzigen.</p>}{canManage&&!part.singleton&&<button type="button" disabled={saving} className="row-action" onClick={()=>toggleRemoval(part,row)}>{row.deleted?"Verwijdering ongedaan maken":"Verwijderen bij opslaan"}</button>}</details>;
          })}
        </section>;
      })}
      {!visibleRootFields.some(field=>dossierFieldTab(field.name,cfg)===item.id)&&!cfg.collections.some(part=>part.tab===item.id)&&<p className="form-help">Dit onderdeel bevat weergaven of afzonderlijke acties. Hier zijn geen fichevelden om in te vullen.</p>}
    </section>)}
    <div className="dossier-editor-actions"><button type="button" disabled={saving} onClick={cancel}>Annuleren</button><button className="primary" type="submit" disabled={saving||!onSave||(!dirty&&mode==="edit")}>{saving?"Opslaan…":"Alles opslaan"}</button></div>
  </form>;
}
