"use client";

import {useEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";
import {Printer, X} from "lucide-react";
import {scheduleAgendaDays,scheduleAgendaTime,scheduleKindLabel,scheduleKindColor,scheduleStatuses,type EventScheduleItem} from "@/lib/event-schedule";
import "./event-agenda-export.css";

type ExportProps={eventTitle:string;rows:EventScheduleItem[];kinds:Record<string,string>;people:{id:string;label:string}[];activities:{id:string;title:string}[]};
export function EventAgendaPrintDocument({eventTitle,rows,kinds,people,activities,category="",view="list"}:ExportProps&{category?:string;view?:"list"|"agenda"}){
  const selected=category?rows.filter(row=>row.kind===category):rows;
  const person=(row:EventScheduleItem)=>people.find(item=>item.id===row.person_id)?.label||(row.person_id?"Eerder toegewezen persoon":"Nog niet toegewezen");
  const activity=(row:EventScheduleItem)=>activities.find(item=>item.id===row.activity_id)?.title;
  const time=(row:EventScheduleItem)=>`${row.starts_at?scheduleAgendaTime(row.starts_at):"Start onbekend"} – ${row.ends_at?scheduleAgendaTime(row.ends_at,row.starts_at):"Einde onbekend"}`;
  return <article className={`agenda-print-document agenda-print-${view}`}>
    <header><p>BESC · Eventagenda</p><h1>{eventTitle}</h1><p>{category?scheduleKindLabel(category,kinds):"Alle categorieën"} · {view==="list"?"Lijstweergave":"Dagagenda"} · Tijden in België (Europe/Brussels)</p><p>{selected.length} onderdeel{selected.length===1?"":"en"}</p></header>
    {!selected.length&&<p>Geen agendaonderdelen voor deze selectie.</p>}
    {scheduleAgendaDays(selected).map(day=><section className="agenda-print-day" key={day.key}>
      <h2>{day.label}</h2>
      {view==="list"?<table><thead><tr><th scope="col">Tijd</th><th scope="col">Onderdeel</th><th scope="col">Persoon / locatie</th></tr></thead><tbody>{day.items.map(row=><tr key={row.id}>
        <td>{time(row)}</td><td><strong>{row.title}</strong><span>{scheduleKindLabel(row.kind,kinds)} · {scheduleStatuses[row.status]}</span>{activity(row)&&<span>Activiteit: {activity(row)}</span>}{row.notes&&<p>{row.notes}</p>}</td><td>{person(row)}{row.location&&<span>{row.location}</span>}</td>
      </tr>)}</tbody></table>:<div className="agenda-print-timeline">{day.items.map(row=><article key={row.id}>
        <div className="agenda-print-time">{time(row)}</div><div className="agenda-print-entry" style={{borderLeftColor:scheduleKindColor(row.kind)}}><p>{scheduleKindLabel(row.kind,kinds)} · {scheduleStatuses[row.status]}</p><h3>{row.title}</h3>{activity(row)&&<p>Activiteit: {activity(row)}</p>}<p>{person(row)}{row.location?` · ${row.location}`:""}</p>{row.notes&&<p className="agenda-print-notes">{row.notes}</p>}</div>
      </article>)}</div>}
    </section>)}
  </article>;
}

export function EventAgendaExport({initialCategory="",...props}:ExportProps&{initialCategory?:string}){
  const [open,setOpen]=useState(false),[category,setCategory]=useState(initialCategory),[view,setView]=useState<"list"|"agenda">("list");
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{if(open)dialog.current?.showModal();},[open]);
  const close=()=>{dialog.current?.close();setOpen(false);};
  const categories={...Object.fromEntries(props.rows.map(row=>[row.kind,scheduleKindLabel(row.kind,props.kinds)])),...props.kinds};
  return <><button type="button" className="row-action" onClick={()=>setOpen(true)}><Printer size={14}/>Afdrukken / PDF</button>{open&&createPortal(
    <dialog ref={dialog} className="event-agenda-export" aria-label="Eventagenda afdrukken" onClose={()=>setOpen(false)}>
      <div className="agenda-export-controls"><div><h2>Eventagenda afdrukken</h2><p>Kies je indeling. Selecteer bij afdrukken ‘Opslaan als PDF’ om een PDF te bewaren.</p></div>
        <label htmlFor="agenda-export-category">Categorie<select id="agenda-export-category" autoFocus value={category} onChange={event=>setCategory(event.target.value)}><option value="">Alle categorieën</option>{Object.entries(categories).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label htmlFor="agenda-export-view">Indeling<select id="agenda-export-view" value={view} onChange={event=>setView(event.target.value as "list"|"agenda")}><option value="list">Lijst</option><option value="agenda">Dagagenda</option></select></label>
        <button type="button" onClick={()=>window.print()}><Printer size={16}/>Afdrukken / opslaan als PDF</button><button type="button" onClick={close}><X size={16}/>Sluiten</button>
      </div>
      <EventAgendaPrintDocument {...props} category={category} view={view}/>
    </dialog>,document.body)}</>;
}
