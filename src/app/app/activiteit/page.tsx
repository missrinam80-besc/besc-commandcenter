import Link from "next/link";
import { Activity, CheckCircle2, FolderKanban, MessageSquare, RefreshCw, UserPlus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { requireActiveMembership } from "@/lib/auth-context";
import { isoDaysAgo } from "@/lib/date-range";

type EventRow={id:string;entity_type:"task"|"project";entity_id:string;action:string;metadata:Record<string,unknown>;created_at:string;actor_id:string;profiles:{display_name:string|null}|null};
const actions:Record<string,{label:string;icon:typeof Activity}>={
  task_updated:{label:"heeft een taak bijgewerkt",icon:RefreshCw},
  task_assigned:{label:"heeft een taak toegewezen",icon:UserPlus},
  project_updated:{label:"heeft een project bijgewerkt",icon:FolderKanban},
  comment_added:{label:"heeft een reactie toegevoegd",icon:MessageSquare},
  task_completed:{label:"heeft een taak afgerond",icon:CheckCircle2},
};
const pageSize=30;
function safePage(value?:string){const page=Number(value);return Number.isInteger(page)&&page>0?page:1}
function queryString(values:Record<string,string|number|undefined>){const p=new URLSearchParams();Object.entries(values).forEach(([key,value])=>{if(value!==undefined&&value!=="")p.set(key,String(value))});return`?${p.toString()}`}

export default async function ActivityPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
  const q=await searchParams,page=safePage(q.pagina),type=["task","project"].includes(q.type??"")?q.type:undefined,action=q.actie&&Object.keys(actions).includes(q.actie)?q.actie:undefined,actor=q.gebruiker||undefined,days=Math.min(365,Math.max(1,Number(q.periode)||30));
  const{supabase,membership}=await requireActiveMembership(),org=membership.organization_id;
  let request=supabase.from("activity_events").select("id,entity_type,entity_id,action,metadata,created_at,actor_id,profiles!activity_events_actor_id_fkey(display_name)",{count:"exact"}).eq("organization_id",org).gte("created_at",isoDaysAgo(days)).order("created_at",{ascending:false}).range((page-1)*pageSize,page*pageSize-1);
  if(type)request=request.eq("entity_type",type);
  if(action)request=request.eq("action",action);
  if(actor)request=request.eq("actor_id",actor);
  const[{data:rows,count},{data:members}]=await Promise.all([request,supabase.from("organization_members").select("user_id,profiles(display_name)").eq("organization_id",org).eq("status","active")]);
  const events=(rows??[]) as unknown as EventRow[],taskIds=events.filter(x=>x.entity_type==="task").map(x=>x.entity_id),projectIds=events.filter(x=>x.entity_type==="project").map(x=>x.entity_id);
  const[{data:tasks},{data:projects}]=await Promise.all([
    taskIds.length?supabase.from("tasks").select("id,title").in("id",taskIds):Promise.resolve({data:[] as {id:string;title:string}[]}),
    projectIds.length?supabase.from("projects").select("id,title").in("id",projectIds):Promise.resolve({data:[] as {id:string;title:string}[]})
  ]);
  const titles=new Map<string,string>([...(tasks??[]).map(x=>[`task:${x.id}`,x.title] as const),...(projects??[]).map(x=>[`project:${x.id}`,x.title] as const)]),total=count??0,pages=Math.max(1,Math.ceil(total/pageSize));
  const activeMembers=(members??[]) as unknown as {user_id:string;profiles:{display_name:string|null}|null}[];
  const base={type,actie:action,gebruiker:actor,periode:days};
  return <AppShell active="Activiteit"><header className="topbar module-top"><div><p>SAMENWERKING & AUDIT</p><h1>Activiteit</h1></div><span className="history-total"><Activity size={15}/>{total} gebeurtenissen</span></header><div className="module-body">
    <p className="lead">Bekijk wie taken en projecten heeft gewijzigd, toegewezen of besproken.</p>
    <form className="activity-filters">
      <label>Onderdeel<select name="type" defaultValue={type??""}><option value="">Taken en projecten</option><option value="task">Taken</option><option value="project">Projecten</option></select></label>
      <label>Actie<select name="actie" defaultValue={action??""}><option value="">Alle acties</option>{Object.entries(actions).map(([value,item])=><option value={value} key={value}>{item.label}</option>)}</select></label>
      <label>Gebruiker<select name="gebruiker" defaultValue={actor??""}><option value="">Iedereen</option>{activeMembers.map(member=><option value={member.user_id} key={member.user_id}>{member.profiles?.display_name||"Naamloos account"}</option>)}</select></label>
      <label>Periode<select name="periode" defaultValue={String(days)}><option value="7">7 dagen</option><option value="30">30 dagen</option><option value="90">90 dagen</option><option value="365">1 jaar</option></select></label>
      <button>Filter</button><Link href="/app/activiteit">Wissen</Link>
    </form>
    <section className="activity-log">
      {events.map(event=>{const definition=actions[event.action]??{label:event.action.replaceAll("_"," "),icon:Activity},Icon=definition.icon,title=titles.get(`${event.entity_type}:${event.entity_id}`)??"Verwijderd of gearchiveerd dossier",href=`/app/${event.entity_type==="task"?"taken":"projecten"}/${event.entity_id}`;return <article key={event.id}><div className={`activity-log-icon ${event.entity_type}`}><Icon size={16}/></div><div><p><strong>{event.profiles?.display_name||"Onbekende gebruiker"}</strong> {definition.label}</p><Link href={href}>{title}</Link><time>{new Intl.DateTimeFormat("nl-BE",{dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Brussels"}).format(new Date(event.created_at))}</time></div><span className="badge">{event.entity_type==="task"?"Taak":"Project"}</span></article>})}
      {!events.length&&<div className="empty">Geen activiteiten gevonden voor deze selectie.</div>}
    </section>
    {pages>1&&<nav className="pagination"><span>Pagina {page} van {pages}</span><div>{page>1&&<Link href={queryString({...base,pagina:page-1})}>Vorige</Link>}{page<pages&&<Link href={queryString({...base,pagina:page+1})}>Volgende</Link>}</div></nav>}
  </div></AppShell>
}
