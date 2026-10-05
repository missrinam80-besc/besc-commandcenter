import {
  AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, CircleDollarSign,
  FolderKanban, Landmark, Plus, Sparkles, BookOpen,
} from "lucide-react";
import Link from "next/link";
import type { DashboardData } from "@/lib/types";

const widgetIcons={orange:CheckCircle2,violet:Landmark,green:FolderKanban,red:AlertTriangle};

function greeting(){
  const hour=new Date().getHours();
  if(hour<12)return "Goedemorgen";
  if(hour<18)return "Goedemiddag";
  return "Goedenavond";
}

export function Dashboard({data}:{data:DashboardData}){
  if (data.loadState && data.loadState !== "ready") {
    const messages = {
      unavailable: ["Gegevens konden niet worden geladen.", "Dit overzicht is tijdelijk niet beschikbaar. Probeer opnieuw; er worden geen aantallen of lege lijsten getoond."],
      not_configured: ["Command Center is nog niet verbonden.", "De gegevensverbinding is nog niet ingericht. Laat de configuratie controleren."],
      no_access: ["Je werkruimte is nog niet beschikbaar.", "Meld je aan met het juiste account of laat je toegang controleren."],
    };
    const [title, description] = messages[data.loadState];
    return <><header className="topbar"><div><h1>Command Center</h1></div></header>
      <section className="panel" role={data.loadState === "unavailable" ? "alert" : "status"}>
        <h2>{title}</h2><p>{description}</p>
        <a className="primary" href="/app">Opnieuw proberen</a>
      </section></>;
  }
  return <><header className="topbar"><div><p>{new Intl.DateTimeFormat("nl-BE",{weekday:"long",day:"numeric",month:"long",timeZone:"Europe/Brussels"}).format(new Date())}</p><h1>{greeting()}, {data.name}</h1></div>
    <details className="quick-create"><summary className="primary"><Plus size={17}/>Snel toevoegen</summary><div><Link href="/app/taken?nieuw=1">Nieuwe taak</Link><Link href="/app/inbox?nieuw=1">Inboxitem</Link>{["admin","board"].includes(data.roleKey)&&<><Link href="/app/projecten?nieuw=1">Nieuw project</Link><Link href="/app/events?nieuw=1">Nieuw event</Link></>}</div></details>
  </header><div className="dashboard">
    {(data.notificationCount>0||data.attentionCount>0)&&<div className="attention-bar"><div><strong>{data.attentionCount} werkitems vragen aandacht</strong><span>{data.notificationCount} ongelezen meldingen · achterstanden, blokkades en reviews gebundeld</span></div><Link href="/app/meldingen">Bekijk signalen <ArrowRight size={15}/></Link></div>}
    <section className="hero-card"><div><span className="eyebrow">JOUW FOCUS</span><h2>{data.attention.length?`${data.attention.length} concrete aandachtspunten om eerst op te lossen.`:"Geen aandachtspunten gevonden in dit persoonlijke overzicht."}</h2><p>Dit overzicht is persoonlijk samengesteld voor jouw rol als {data.role.toLowerCase()}.</p></div><Link className="hero-action" href="/app/taken?van_mij=1">Open mijn werk <ArrowRight size={17}/></Link></section>

    <section className="panel onboarding-panel">
      <div className="panel-head">
        <div><span className="eyebrow">AAN DE SLAG</span><h3>Command Center handleidingen</h3></div>
        <Link href="/app/kennisbank">Kennisbank <ArrowRight size={15}/></Link>
      </div>
      <div className="onboarding-links">
        <Link href="/app/kennisbank?zoeken=Start%20hier"><BookOpen size={16}/><span><strong>Start hier</strong><small>Basisflow, modules en dagelijkse werkwijze.</small></span></Link>
        <Link href="/app/kennisbank?zoeken=Processen%20automatisaties"><Sparkles size={16}/><span><strong>Processen en automatisaties</strong><small>Drive, Calendar, Gmail, meldingen en goedkeuringen.</small></span></Link>
        <Link href="/app/kennisbank?zoeken=Rollen%20rechten"><CheckCircle2 size={16}/><span><strong>Rollen en rechten</strong><small>Toegang, archiveren, verwijderen en databeheer.</small></span></Link>
      </div>
    </section>

    <section className="dashboard-widgets" aria-label="Persoonlijke kerncijfers">{data.widgets.map(widget=>{const Icon=widgetIcons[widget.tone];return <Link href={widget.href} className={`dashboard-widget tone-${widget.tone}`} key={widget.label}><div className={`stat-icon ${widget.tone}`}><Icon/></div><div><span>{widget.label}</span><strong>{widget.value}</strong><small>{widget.description}</small></div><ArrowRight size={15}/></Link>})}</section>

    <div className="dashboard-focus-grid"><section className="panel attention-panel"><div className="panel-head"><div><span className="eyebrow">AANDACHT NODIG</span><h3>Blokkades en deadlines</h3></div><Link href="/app/meldingen">Alle signalen <ArrowRight size={15}/></Link></div><div className="attention-list">{data.attention.length?data.attention.map(item=><Link href={item.href} key={item.id}><span className={`attention-mark ${item.severity}`}><AlertTriangle size={15}/></span><div><strong>{item.title}</strong><small>{item.kind} · {item.detail}</small></div><ArrowRight size={14}/></Link>):<div className="empty">Geen blokkades of verlopen deadlines gevonden in dit overzicht.</div>}</div></section>
      <section className="panel schedule-panel"><div className="panel-head"><div><span className="eyebrow">KOMENDE 14 DAGEN</span><h3>Planning</h3></div><Link href="/app/kalender">Kalender</Link></div><div className="schedule-list">{data.schedule.length?data.schedule.map(item=><Link href={item.href} key={item.id}><CalendarDays size={17}/><div><strong>{item.title}</strong><small>{item.kind} · {item.when}</small></div></Link>):<div className="empty">Geen events of vergaderingen gepland.</div>}</div></section>
    </div>

    <div className="content-grid dashboard-work-grid"><section className="panel tasks-panel"><div className="panel-head"><div><span className="eyebrow">MIJN WERK</span><h3>Eerstvolgende taken</h3></div><Link href="/app/taken?van_mij=1">Alle taken <ArrowRight size={15}/></Link></div><div className="task-list">{data.tasks.length?data.tasks.map(task=><article key={task.id}><Link className="check-link" href={`/app/taken/${task.id}`} aria-label={`Open ${task.title}`}/><div className="task-main"><Link href={`/app/taken/${task.id}`}><strong>{task.title}</strong></Link><span>{task.project}</span></div><span className={`badge ${task.status==="Review"?"purple":""}`}>{task.status}</span><div className="task-due"><small>Deadline</small><span>{task.due}</span></div></article>):<div className="empty">Geen open taken gevonden in dit overzicht.</div>}</div></section>
      <section className="panel inbox-panel"><div className="panel-head"><div><span className="eyebrow">{data.inbox.length?"INBOX":"PERSOONLIJK"}</span><h3>{data.inbox.length?"Te beoordelen":"Nieuwe invoer"}</h3></div>{data.inbox.length>0&&<Link href="/app/inbox">Open inbox</Link>}</div>{data.inbox.map(item=><article key={item.id}><div className={`source ${item.source.toLowerCase().includes("discord")?"discord":"mail"}`}>{item.source.toLowerCase().includes("discord")?"D":"@"}</div><div><strong>{item.title}</strong><span>Via {item.source} · {item.created}</span></div></article>)}<Link className="quiet" href="/app/taken?nieuw=1"><Plus size={16}/>Nieuwe taak toevoegen</Link></section>
    </div>

    {data.actionItems.length>0&&<section className="panel dashboard-actions"><div className="panel-head"><div><span className="eyebrow">BESTUUR & OPVOLGING</span><h3>Open vergaderactiepunten</h3></div><Link href="/app/vergaderingen">Alle vergaderingen <ArrowRight size={15}/></Link></div><div>{data.actionItems.map(item=><Link href={item.href} key={item.id}><Landmark size={16}/><span><strong>{item.title}</strong><small>{item.meeting}</small></span><ArrowRight size={14}/></Link>)}</div></section>}

    <section className="panel projects-panel"><div className="panel-head"><div><span className="eyebrow">MIJN PROJECTEN</span><h3>Waar ik aan werk</h3></div><Link href="/app/projecten?van_mij=1">Alle projecten <ArrowRight size={15}/></Link></div><div className="project-grid">{data.projects.length?data.projects.map(project=><Link href={`/app/projecten/${project.id}`} key={project.id}><div className="project-top"><span className="project-dot" style={{background:project.color}}/><span className="badge">{project.status}</span></div><h4>{project.name}</h4><p>Projectdeadline · {project.due}</p></Link>):<div className="empty">Je bent nog niet aan een actief project gekoppeld.</div>}</div></section>

    {data.widgets.some(widget=>widget.label==="Financiële opvolging")&&<Link className="finance-dashboard-link" href="/app/financien"><CircleDollarSign size={18}/><span><strong>Financiële administratie</strong><small>Bekijk kosten, terugbetalingen en open goedkeuringen.</small></span><ArrowRight size={16}/></Link>}
    <div className="dashboard-footer-note"><Sparkles size={15}/>Het dashboard past zich automatisch aan jouw rol, toewijzingen en deadlines aan.</div>
  </div></>;
}
