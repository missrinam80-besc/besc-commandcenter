import Link from "next/link";
import { BellRing, CalendarClock, CheckCheck, Settings2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { requireActiveMembership } from "@/lib/auth-context";
import { markAllRead, markNotificationRead, saveNotificationPreferences } from "./actions";

type Notification={id:string;title:string;body:string|null;href:string|null;read_at:string|null;created_at:string;type:string;severity:"info"|"warning"|"urgent"};
type Preferences={deadline_notifications:boolean;follow_up_notifications:boolean;assignment_notifications:boolean;daily_digest:boolean;weekly_digest:boolean;reminder_days:number[]};
const typeLabels:Record<string,string>={assignment:"Toewijzing",comment:"Reactie",deadline:"Deadline",sponsor_follow_up:"Sponsoropvolging",event_readiness:"Eventvoorbereiding",meeting_follow_up:"Vergaderopvolging",daily_digest:"Dagoverzicht",weekly_digest:"Weekoverzicht"};
const reminderOptions=[1,2,3,5,7,14,30];

export default async function NotificationsPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
  const query=await searchParams;
  const{supabase,user,membership}=await requireActiveMembership();
  await supabase.rpc("refresh_my_notifications");
  const[{data},{data:preferenceData}]=await Promise.all([
    supabase.from("notifications").select("id,title,body,href,read_at,created_at,type,severity").eq("user_id",user.id).order("created_at",{ascending:false}).limit(150),
    supabase.from("notification_preferences").select("deadline_notifications,follow_up_notifications,assignment_notifications,daily_digest,weekly_digest,reminder_days").eq("organization_id",membership.organization_id).eq("user_id",user.id).maybeSingle(),
  ]);
  const items=(data??[]) as Notification[];
  const preferences=(preferenceData??{deadline_notifications:true,follow_up_notifications:true,assignment_notifications:true,daily_digest:true,weekly_digest:true,reminder_days:[1,3,7]}) as Preferences;
  const unread=items.filter(x=>!x.read_at).length;
  const urgent=items.filter(x=>!x.read_at&&x.severity==="urgent").length;
  const deadlines=items.filter(x=>!x.read_at&&x.type==="deadline").length;
  const followUps=items.filter(x=>!x.read_at&&["sponsor_follow_up","event_readiness","meeting_follow_up"].includes(x.type)).length;
  const filtered=query.filter==="overzichten"?items.filter(x=>["daily_digest","weekly_digest"].includes(x.type)):query.filter?items.filter(x=>x.type===query.filter):items;
  return <AppShell active="Meldingen"><header className="topbar module-top"><div><p>PERSOONLIJK</p><h1>Meldingen & opvolging</h1></div><div className="project-actions">
    <Link href={query.instellingen?"?":"?instellingen=1"}><Settings2 size={16}/>{query.instellingen?"Sluiten":"Voorkeuren"}</Link>
    {unread>0&&<form action={markAllRead}><button className="primary"><CheckCheck size={16}/>Alles gelezen</button></form>}
  </div></header><div className="module-body"><p className="lead">Persoonlijke signalen voor toewijzingen, deadlines, opvolging en werkoverzichten.</p>
    {query.succes&&<div className="success">Je meldingsvoorkeuren zijn opgeslagen.</div>}{query.fout&&<div className="error-note">De meldingsvoorkeuren konden niet worden opgeslagen.</div>}
    <section className="history-stats notification-stats"><article><span>Ongelezen</span><strong>{unread}</strong></article><article><span>Urgent</span><strong>{urgent}</strong></article><article><span>Deadline-signalen</span><strong>{deadlines}</strong></article><article><span>Opvolging</span><strong>{followUps}</strong></article></section>
    {query.instellingen&&<section className="form-card notification-preferences"><div className="form-heading"><div><h2>Meldingsvoorkeuren</h2><p>Bepaal welke signalen in jouw Command Center verschijnen.</p></div></div>
      <form action={saveNotificationPreferences}><div className="preference-grid">
        <label><input type="checkbox" name="deadline_notifications" defaultChecked={preferences.deadline_notifications}/><span><strong>Deadlinewaarschuwingen</strong><small>Taken, projecten, events, campagnes en opvolging.</small></span></label>
        <label><input type="checkbox" name="follow_up_notifications" defaultChecked={preferences.follow_up_notifications}/><span><strong>Operationele opvolging</strong><small>Sponsors, eventvoorbereiding, notulen en actiepunten.</small></span></label>
        <label><input type="checkbox" name="assignment_notifications" defaultChecked={preferences.assignment_notifications}/><span><strong>Nieuwe toewijzingen</strong><small>Wanneer iemand een taak aan jou koppelt.</small></span></label>
        <label><input type="checkbox" name="daily_digest" defaultChecked={preferences.daily_digest}/><span><strong>Dagoverzicht</strong><small>Samenvatting van wat vandaag aandacht vraagt.</small></span></label>
        <label><input type="checkbox" name="weekly_digest" defaultChecked={preferences.weekly_digest}/><span><strong>Weekoverzicht</strong><small>Samenvatting van de komende zeven dagen.</small></span></label>
      </div><fieldset><legend>Herinner mij vooraf</legend><div className="reminder-days">{reminderOptions.map(day=><label key={day}><input type="checkbox" name="reminder_days" value={day} defaultChecked={preferences.reminder_days.includes(day)}/><span>{day} {day===1?"dag":"dagen"}</span></label>)}</div></fieldset><div className="form-actions"><button className="primary">Voorkeuren opslaan</button></div></form>
    </section>}
    <nav className="notification-filters" aria-label="Meldingen filteren"><Link className={!query.filter?"active":""} href="?">Alles</Link><Link className={query.filter==="deadline"?"active":""} href="?filter=deadline"><CalendarClock size={15}/>Deadlines</Link><Link className={query.filter==="sponsor_follow_up"?"active":""} href="?filter=sponsor_follow_up">Sponsors</Link><Link className={query.filter==="event_readiness"?"active":""} href="?filter=event_readiness">Events</Link><Link className={query.filter==="meeting_follow_up"?"active":""} href="?filter=meeting_follow_up">Vergaderingen</Link><Link className={query.filter==="assignment"?"active":""} href="?filter=assignment"><BellRing size={15}/>Toewijzingen</Link><Link className={query.filter==="overzichten"?"active":""} href="?filter=overzichten">Overzichten</Link></nav>
    <div className="notification-list">{filtered.length?filtered.map(n=><article className={`${n.read_at?"read":""} severity-${n.severity}`} key={n.id}><span className="notification-dot"/><div><div className="notification-title"><strong>{n.title}</strong><span>{typeLabels[n.type]??n.type}</span></div>{n.body&&<p>{n.body}</p>}<time>{new Intl.DateTimeFormat("nl-BE",{dateStyle:"medium",timeStyle:"short"}).format(new Date(n.created_at))}</time></div><div>{n.href&&<Link href={n.href}>Openen</Link>}{!n.read_at&&<form action={markNotificationRead}><input type="hidden" name="id" value={n.id}/><button>Gelezen</button></form>}</div></article>):<div className="empty">Geen meldingen in deze selectie.</div>}</div>
  </div></AppShell>;
}
