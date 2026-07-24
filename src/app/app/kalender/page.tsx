import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, List } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { requireActiveMembership } from "@/lib/auth-context";

type Kind="task"|"project"|"content"|"publication"|"event"|"social"|"campaign"|"compliance";
type Item={id:string;title:string;date:string;kind:Kind;label:string;href:string;timed?:boolean};
const labels:Record<Kind,string>={task:"Taak",project:"Project",content:"Contentdeadline",publication:"Publicatie",event:"Event",social:"Social post",campaign:"Campagne",compliance:"VZW-deadline"};
const kinds=Object.keys(labels) as Kind[];
const validMonth=(value?:string)=>value&&/^\d{4}-(0[1-9]|1[0-2])$/.test(value)?value:new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Brussels",year:"numeric",month:"2-digit"}).format(new Date());
function shiftMonth(month:string,offset:number){const[y,m]=month.split("-").map(Number),d=new Date(Date.UTC(y,m-1+offset,1));return`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}`}
function dayKey(value:string){return/^\d{4}-\d{2}-\d{2}$/.test(value)?value:new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Brussels",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(value))}
function time(value:string){return/^\d{4}-\d{2}-\d{2}$/.test(value)?"":new Intl.DateTimeFormat("nl-BE",{timeZone:"Europe/Brussels",hour:"2-digit",minute:"2-digit"}).format(new Date(value))}

export default async function CalendarPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 const q=await searchParams,month=validMonth(q.maand),selected:Kind|"all"=kinds.includes(q.type as Kind)?q.type as Kind:"all";
 const[y,m]=month.split("-").map(Number),start=`${month}-01`,next=shiftMonth(month,1),end=`${next}-01`,{supabase,membership}=await requireActiveMembership(),org=membership.organization_id;
 const[tasks,projects,deadlines,publications,events,social,campaigns,compliance]=await Promise.all([
  supabase.from("tasks").select("id,title,due_at").eq("organization_id",org).is("deleted_at",null).gte("due_at",start).lt("due_at",end).not("status","in","(done,cancelled)"),
  supabase.from("projects").select("id,title,due_date").eq("organization_id",org).is("deleted_at",null).gte("due_date",start).lt("due_date",end).not("status","in","(done,archived)"),
  supabase.from("content_items").select("id,title,deadline").eq("organization_id",org).is("deleted_at",null).gte("deadline",start).lt("deadline",end).not("status","in","(completed,archived)"),
  supabase.from("content_items").select("id,title,publication_at").eq("organization_id",org).is("deleted_at",null).gte("publication_at",start).lt("publication_at",end).not("status","eq","archived"),
  supabase.from("events").select("id,title,start_at").eq("organization_id",org).is("deleted_at",null).gte("start_at",start).lt("start_at",end).not("status","in","(cancelled,archived)"),
  supabase.from("social_posts").select("id,title,scheduled_at,platform").eq("organization_id",org).is("deleted_at",null).gte("scheduled_at",start).lt("scheduled_at",end).not("status","eq","archived"),
  supabase.from("campaigns").select("id,title,end_date").eq("organization_id",org).is("deleted_at",null).gte("end_date",start).lt("end_date",end).not("status","in","(completed,cancelled,archived)"),
  supabase.from("compliance_deadlines").select("id,title,due_date").eq("organization_id",org).is("deleted_at",null).gte("due_date",start).lt("due_date",end).not("status","in","(completed,cancelled,not_applicable)")
 ]);
 const items:Item[]=[
  ...(tasks.data??[]).map(x=>({id:`task-${x.id}`,title:x.title,date:x.due_at!,kind:"task" as const,label:labels.task,href:`/app/taken/${x.id}`,timed:true})),
  ...(projects.data??[]).map(x=>({id:`project-${x.id}`,title:x.title,date:x.due_date!,kind:"project" as const,label:labels.project,href:`/app/projecten/${x.id}`})),
  ...(deadlines.data??[]).map(x=>({id:`content-${x.id}`,title:x.title,date:x.deadline!,kind:"content" as const,label:labels.content,href:`/app/content/${x.id}`})),
  ...(publications.data??[]).map(x=>({id:`publication-${x.id}`,title:x.title,date:x.publication_at!,kind:"publication" as const,label:labels.publication,href:`/app/content/${x.id}`,timed:true})),
  ...(events.data??[]).map(x=>({id:`event-${x.id}`,title:x.title,date:x.start_at!,kind:"event" as const,label:labels.event,href:`/app/events/${x.id}`,timed:true})),
  ...(social.data??[]).map(x=>({id:`social-${x.id}`,title:x.title,date:x.scheduled_at!,kind:"social" as const,label:x.platform||labels.social,href:`/app/social/${x.id}`,timed:true})),
  ...(campaigns.data??[]).map(x=>({id:`campaign-${x.id}`,title:x.title,date:x.end_date!,kind:"campaign" as const,label:labels.campaign,href:`/app/campagnes/${x.id}`})),
  ...(compliance.data??[]).map(x=>({id:`compliance-${x.id}`,title:x.title,date:x.due_date!,kind:"compliance" as const,label:labels.compliance,href:"/app/administratie"}))
 ].filter(x=>selected==="all"||x.kind===selected).sort((a,b)=>a.date.localeCompare(b.date));
 const offset=(new Date(Date.UTC(y,m-1,1)).getUTCDay()+6)%7,days=new Date(Date.UTC(y,m,0)).getUTCDate(),cells=Array.from({length:Math.ceil((offset+days)/7)*7},(_,i)=>{const d=i-offset+1;return d>0&&d<=days?d:null});
 const grouped=new Map<string,Item[]>();items.forEach(x=>grouped.set(dayKey(x.date),[...(grouped.get(dayKey(x.date))??[]),x]));
 const title=new Intl.DateTimeFormat("nl-BE",{month:"long",year:"numeric"}).format(new Date(Date.UTC(y,m-1,1))),today=dayKey(new Date().toISOString()),suffix=selected==="all"?"":`&type=${selected}`;
 return <AppShell active="Kalender"><header className="topbar module-top"><div><p>PLANNING & DEADLINES</p><h1>Kalender</h1></div><Link className="row-action" href="/app/taken"><List size={15}/>Open Mijn werk</Link></header><div className="module-body"><p className="lead">Eén overzicht van operationele deadlines, publicaties, events, campagnes en wettelijke verplichtingen.</p>
 <section className="calendar-toolbar"><div className="calendar-navigation"><Link aria-label="Vorige maand" href={`?maand=${shiftMonth(month,-1)}${suffix}`}><ChevronLeft size={17}/></Link><h2>{title}</h2><Link aria-label="Volgende maand" href={`?maand=${shiftMonth(month,1)}${suffix}`}><ChevronRight size={17}/></Link><Link className="calendar-today" href={`?${selected==="all"?"":`type=${selected}`}`}>Vandaag</Link></div><form><input type="hidden" name="maand" value={month}/><label>Toon<select name="type" defaultValue={selected}><option value="all">Alles</option>{kinds.map(k=><option key={k} value={k}>{labels[k]}</option>)}</select></label><button>Filter</button></form></section>
 <section className="calendar-summary"><article><CalendarDays size={18}/><div><span>Gepland deze maand</span><strong>{items.length}</strong></div></article>{kinds.map(k=>{const count=items.filter(x=>x.kind===k).length;return count?<article key={k}><i className={`calendar-kind ${k}`}/><div><span>{labels[k]}</span><strong>{count}</strong></div></article>:null})}</section>
 <div className="calendar-weekdays">{["Ma","Di","Wo","Do","Vr","Za","Zo"].map(d=><span key={d}>{d}</span>)}</div><section className="calendar-grid">{cells.map((day,i)=>{if(!day)return <div className="calendar-cell outside" key={`e-${i}`}/>;const key=`${month}-${String(day).padStart(2,"0")}`,dayItems=grouped.get(key)??[];return <article className={`calendar-cell${key===today?" today":""}`} key={key}><span className="calendar-day">{day}</span><div className="calendar-items">{dayItems.slice(0,5).map(x=><Link className={`calendar-item ${x.kind}`} href={x.href} key={x.id}><span>{x.timed?time(x.date):x.label}</span><strong>{x.title}</strong></Link>)}{dayItems.length>5&&<span className="calendar-more">+ {dayItems.length-5} meer</span>}</div></article>})}</section>{!items.length&&<div className="calendar-empty">Geen geplande items voor deze selectie.</div>}
 </div></AppShell>
}
