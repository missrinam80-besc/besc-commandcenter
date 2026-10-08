import { dossierEditorGate } from "@/components/dossier-editor-gate";
import Link from "next/link";
import { CalendarSync, Download, ExternalLink, FilePlus2 } from "lucide-react";
import { notFound } from "next/navigation";
import { generateMeetingMinutes } from "@/app/app/google-document-actions";
import { addMeetingAction, convertMeetingActionToTask, updateMeetingAction } from "@/app/app/vergaderingen/actions";
import { AppShell } from "@/components/app-shell";
import { EmailCommunicationPanel } from "@/components/email-communication-panel";
import { RecordLifecyclePanel } from "@/components/record-lifecycle-panel";
import { requireActiveMembership } from "@/lib/auth-context";
import { syncMeetingToGoogleCalendar } from "@/app/app/vergaderingen/calendar-actions";
import { hasPermission } from "@/lib/permissions";
import { formatDateTime } from "@/lib/format";

export default async function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|undefined>>}) {
  const {id}=await params;
  const q=await searchParams;
  const unifiedEditor = await dossierEditorGate({kind:"meeting",id,query:q});
  if (unifiedEditor) return unifiedEditor;

  const{supabase,membership}=await requireActiveMembership();
  const canManage=hasPermission(membership,"manageOrganization");
  const[m,a,p,d,c]=await Promise.all([
    supabase.from("meetings").select("*").eq("organization_id",membership.organization_id).eq("id",id).is("deleted_at",null).maybeSingle(),
    supabase.from("meeting_action_items").select("*").eq("organization_id",membership.organization_id).eq("meeting_id",id).order("created_at"),
    supabase.from("projects").select("id,title").eq("organization_id",membership.organization_id).is("deleted_at",null).order("title"),
    supabase.from("google_resource_links").select("google_id,name,web_url").eq("organization_id",membership.organization_id).eq("entity_type","meeting").eq("entity_id",id).eq("resource_type","document").order("updated_at",{ascending:false}).limit(1).maybeSingle(),
    supabase.from("google_resource_links").select("google_id,name,web_url,updated_at").eq("organization_id",membership.organization_id).eq("entity_type","meeting").eq("entity_id",id).eq("resource_type","calendar_event").maybeSingle(),
  ]);
  if(!m.data)notFound();
  const r=m.data,actions=a.data??[],projects=p.data??[],document=d.data,calendar=c.data;
  const calendarIsCurrent=calendar?new Date(calendar.updated_at).getTime()>=new Date(r.updated_at).getTime():false;
  return <AppShell active="Vergaderingen & besluiten">
    <header className="project-detail-head"><div><Link href="/app/vergaderingen">← Terug naar vergaderingen</Link><span className="eyebrow">VERGADERING</span><h1>{r.title}</h1><p>{r.meeting_type} · {r.status}</p></div><div className="project-actions">{r.minutes_url&&<a href={r.minutes_url} target="_blank" rel="noreferrer"><ExternalLink size={16}/>Open notulen</a>}{!document&&<form action={generateMeetingMinutes}><input type="hidden" name="meeting_id" value={id}/><button><FilePlus2 size={16}/>Genereer notulen</button></form>}<form action={syncMeetingToGoogleCalendar}><input type="hidden" name="meeting_id" value={id}/><button><CalendarSync size={16}/>{calendar?"Kalender bijwerken":"Naar Google Calendar"}</button></form>{<Link className="primary" href="?bewerken=1">Bewerken</Link>}</div></header>
    <div className="project-detail-body">
      {q.fout&&<div className="error-note">{q.fout==="document-genereren"?"Het document kon niet vanuit het Google-template worden gegenereerd.":q.fout==="kalender-tijden"?"Vul eerst een geldige start- én eindtijd in. De eindtijd moet na de starttijd liggen.":q.fout==="kalender-sync"?"De vergadering kon niet met Google Calendar worden gesynchroniseerd. Controleer de kalenderrechten en probeer opnieuw.":`De wijziging kon niet worden opgeslagen (${q.fout}).`}</div>}
      {q.succes&&<div className="success">{q.succes.startsWith("kalender-")?`Google Calendar is ${q.succes==="kalender-created"?"gekoppeld":"bijgewerkt"}.`:"Wijziging opgeslagen."}</div>}
      {q.waarschuwing==="kalender-sync"&&<div className="error-note">De vergadering is opgeslagen, maar Google Calendar kon niet automatisch worden bijgewerkt. Gebruik hieronder “Opnieuw synchroniseren”.</div>}
      {<>
        <section className="project-summary"><article><span>Type</span><strong>{r.meeting_type}</strong></article><article><span>Status</span><strong>{r.status}</strong></article><article><span>Start</span><strong>{formatDateTime(r.meeting_at,"—")}</strong></article><article><span>Einde</span><strong>{formatDateTime(r.ends_at,"—")}</strong></article></section>
        {document&&<section className="form-card"><div className="form-heading"><h2>Google-document</h2><div className="project-actions"><a href={document.web_url} target="_blank" rel="noreferrer"><ExternalLink size={14}/> {document.name}</a><a href={`https://docs.google.com/document/d/${document.google_id}/export?format=pdf`} target="_blank" rel="noreferrer"><Download size={14}/>PDF downloaden</a></div></div><p>Gegenereerd vanuit het notulentemplate. Alleen de link en metadata staan in het Command Center.</p></section>}
        <section className="form-card"><div className="form-heading"><div><span className="eyebrow">GOOGLE CALENDAR</span><h2>Kalendersynchronisatie</h2></div>{calendar&&!calendar.name.startsWith("[VERWIJDERD]")&&<a href={calendar.web_url} target="_blank" rel="noreferrer"><ExternalLink size={14}/>Open afspraak</a>}</div>{calendar?<div className="content-meta"><div><span>Status</span><strong>{calendar.name.startsWith("[VERWIJDERD]")?"Verwijderd uit Google Calendar":calendarIsCurrent?"Gesynchroniseerd":"Synchronisatie nodig"}</strong></div><div><span>Kalenderitem</span><strong>{calendar.name.replace("[VERWIJDERD] ","")}</strong></div><div><span>Laatste synchronisatie</span><strong>{new Intl.DateTimeFormat("nl-BE",{dateStyle:"medium",timeStyle:"short"}).format(new Date(calendar.updated_at))}</strong></div></div>:<p>Deze vergadering staat nog niet in de gedeelde BESC-kalender. Start- en eindtijd zijn verplicht.</p>}<form className="drive-organize-action" action={syncMeetingToGoogleCalendar}><input type="hidden" name="meeting_id" value={id}/><button><CalendarSync size={15}/>{calendar?"Opnieuw synchroniseren":"Publiceren naar Google Calendar"}</button></form></section>
        <div className="relation-grid">
          <section className="form-card record-notes"><div className="form-heading"><h2>Notities en verslag</h2></div><p>{r.notes||"Nog geen notities."}</p></section>
          <section className="form-card record-notes"><div className="form-heading"><h2>Besluiten</h2></div><p>{r.decisions||"Nog geen besluiten geregistreerd."}</p></section>
          <section className="form-card relation-wide"><div className="form-heading"><h2>Actiepunten</h2><span>{actions.filter(x=>x.status!=="done").length} open</span></div><div className="meeting-action-list">{actions.map(x=><article key={x.id}><div><strong>{x.title}</strong><span>{x.assignee_text||"Nog niet toegewezen"}</span></div><form action={updateMeetingAction}><input type="hidden" name="id" value={x.id}/><input type="hidden" name="meeting_id" value={id}/><select name="status" defaultValue={x.status}><option value="todo">Te doen</option><option value="doing">Bezig</option><option value="done">Afgerond</option><option value="cancelled">Geannuleerd</option></select><button>Bijwerken</button></form>{x.task_id?<Link className="row-action" href={`/app/taken/${x.task_id}`}>Open taak</Link>:<form className="task-convert-form" action={convertMeetingActionToTask}><input type="hidden" name="id" value={x.id}/><input type="hidden" name="meeting_id" value={id}/><select name="priority" defaultValue="normal"><option value="low">Laag</option><option value="normal">Normaal</option><option value="high">Hoog</option><option value="urgent">Urgent</option></select><input type="date" name="due_at" aria-label="Deadline"/><select name="project_id" defaultValue=""><option value="">Geen project</option>{projects.map(project=><option key={project.id} value={project.id}>{project.title}</option>)}</select><button className="primary">Maak taak</button></form>}</article>)}</div><form className="milestone-add" action={addMeetingAction}><input type="hidden" name="meeting_id" value={id}/><input name="title" placeholder="Nieuw actiepunt" required/><input name="assignee_text" placeholder="Verantwoordelijke (optioneel)"/><button>Toevoegen</button></form></section>
        </div>
        <EmailCommunicationPanel entityType="meeting" entityId={id}/>
        <RecordLifecyclePanel entity="meeting" id={id} label="Vergadering" isArchived={r.status==="archived"} canManage={canManage}/>
      </>}
    </div>
  </AppShell>;
}
