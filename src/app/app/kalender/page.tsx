import Link from "next/link";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Grid3X3,
  List,
  Plus,
  TriangleAlert,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { requireActiveMembership } from "@/lib/auth-context";
import {
  calendarDayKey,
  calendarKinds,
  calendarLabels,
  filterCalendarItems,
  shiftCalendarMonth,
  validCalendarMonth,
  type CalendarItem,
  type CalendarKind,
} from "@/lib/calendar";

function time(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  return new Intl.DateTimeFormat("nl-BE", {
    timeZone: "Europe/Brussels",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function personalAssignee(rows: { user_id: string }[] | null | undefined, userId: string) {
  return rows?.some((row) => row.user_id === userId) ?? false;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams;
  const month = validCalendarMonth(query.maand);
  const selected: CalendarKind | "all" = calendarKinds.includes(query.type as CalendarKind)
    ? (query.type as CalendarKind)
    : "all";
  const scope = query.scope === "mijn" ? "mine" : "all";
  const view = query.weergave === "agenda" ? "agenda" : "month";
  const [year, monthNumber] = month.split("-").map(Number);
  const start = `${month}-01`;
  const next = shiftCalendarMonth(month, 1);
  const end = `${next}-01`;
  const { supabase, membership, user } = await requireActiveMembership();
  const organizationId = membership.organization_id;

  const [
    tasks,
    projects,
    deadlines,
    publications,
    events,
    meetings,
    social,
    campaigns,
    compliance,
    launches,
    overdueTaskRows,
    undatedTaskRows,
  ] = await Promise.all([
    supabase.from("tasks").select("id,title,due_at,created_by,task_assignees(user_id)").eq("organization_id", organizationId).is("deleted_at", null).gte("due_at", start).lt("due_at", end).not("status", "in", "(done,cancelled)"),
    supabase.from("projects").select("id,title,due_date,owner_id,project_members(user_id)").eq("organization_id", organizationId).is("deleted_at", null).gte("due_date", start).lt("due_date", end).not("status", "in", "(done,archived)"),
    supabase.from("content_items").select("id,title,deadline,owner_id").eq("organization_id", organizationId).is("deleted_at", null).gte("deadline", start).lt("deadline", end).not("status", "in", "(completed,archived)"),
    supabase.from("content_items").select("id,title,publication_at,owner_id").eq("organization_id", organizationId).is("deleted_at", null).gte("publication_at", start).lt("publication_at", end).not("status", "eq", "archived"),
    supabase.from("events").select("id,title,start_at,owner_id").eq("organization_id", organizationId).is("deleted_at", null).gte("start_at", start).lt("start_at", end).not("status", "in", "(cancelled,archived)"),
    supabase.from("meetings").select("id,title,meeting_at,created_by").eq("organization_id", organizationId).is("deleted_at", null).gte("meeting_at", start).lt("meeting_at", end).not("status", "in", "(cancelled,archived)"),
    supabase.from("social_posts").select("id,title,scheduled_at,platform").eq("organization_id", organizationId).is("deleted_at", null).gte("scheduled_at", start).lt("scheduled_at", end).not("status", "eq", "archived"),
    supabase.from("campaigns").select("id,title,end_date,owner_id").eq("organization_id", organizationId).is("deleted_at", null).gte("end_date", start).lt("end_date", end).not("status", "in", "(completed,cancelled,archived)"),
    supabase.from("compliance_deadlines").select("id,title,due_date,responsible_id").eq("organization_id", organizationId).is("deleted_at", null).gte("due_date", start).lt("due_date", end).not("status", "in", "(completed,cancelled,not_applicable)"),
    supabase.from("merch_launches").select("id,title,launch_date,owner_id").eq("organization_id", organizationId).is("deleted_at", null).gte("launch_date", start).lt("launch_date", end).not("status", "in", "(completed,cancelled,archived)"),
    supabase.from("tasks").select("id,created_by,task_assignees(user_id)").eq("organization_id", organizationId).is("deleted_at", null).lt("due_at", new Date().toISOString()).not("status", "in", "(done,cancelled)"),
    supabase.from("tasks").select("id,created_by,task_assignees(user_id)").eq("organization_id", organizationId).is("deleted_at", null).is("due_at", null).not("status", "in", "(done,cancelled)"),
  ]);

  const isPersonalTask = (row: { created_by: string; task_assignees: { user_id: string }[] | null }) =>
    personalAssignee(row.task_assignees, user.id) ||
    (!row.task_assignees?.length && row.created_by === user.id);
  const overdueCount = (overdueTaskRows.data ?? []).filter(isPersonalTask).length;
  const undatedCount = (undatedTaskRows.data ?? []).filter(isPersonalTask).length;

  const items = filterCalendarItems(
    [
      ...(tasks.data ?? []).map((item) => ({
        id: `task-${item.id}`, title: item.title, date: item.due_at!, kind: "task" as const,
        label: calendarLabels.task, href: `/app/taken/${item.id}`, timed: true,
        personal: personalAssignee(item.task_assignees, user.id) || (!item.task_assignees?.length && item.created_by === user.id),
      })),
      ...(projects.data ?? []).map((item) => ({
        id: `project-${item.id}`, title: item.title, date: item.due_date!, kind: "project" as const,
        label: calendarLabels.project, href: `/app/projecten/${item.id}`,
        personal: item.owner_id === user.id || personalAssignee(item.project_members, user.id),
      })),
      ...(deadlines.data ?? []).map((item) => ({
        id: `content-${item.id}`, title: item.title, date: item.deadline!, kind: "content" as const,
        label: calendarLabels.content, href: `/app/content/${item.id}`, personal: item.owner_id === user.id,
      })),
      ...(publications.data ?? []).map((item) => ({
        id: `publication-${item.id}`, title: item.title, date: item.publication_at!, kind: "publication" as const,
        label: calendarLabels.publication, href: `/app/content/${item.id}`, timed: true, personal: item.owner_id === user.id,
      })),
      ...(events.data ?? []).map((item) => ({
        id: `event-${item.id}`, title: item.title, date: item.start_at!, kind: "event" as const,
        label: calendarLabels.event, href: `/app/events/${item.id}`, timed: true, personal: item.owner_id === user.id,
      })),
      ...(meetings.data ?? []).map((item) => ({
        id: `meeting-${item.id}`, title: item.title, date: item.meeting_at!, kind: "meeting" as const,
        label: calendarLabels.meeting, href: `/app/vergaderingen/${item.id}`, timed: true, personal: item.created_by === user.id,
      })),
      ...(social.data ?? []).map((item) => ({
        id: `social-${item.id}`, title: item.title, date: item.scheduled_at!, kind: "social" as const,
        label: item.platform || calendarLabels.social, href: `/app/social/${item.id}`, timed: true, personal: false,
      })),
      ...(campaigns.data ?? []).map((item) => ({
        id: `campaign-${item.id}`, title: item.title, date: item.end_date!, kind: "campaign" as const,
        label: calendarLabels.campaign, href: `/app/campagnes/${item.id}`, personal: item.owner_id === user.id,
      })),
      ...(compliance.data ?? []).map((item) => ({
        id: `compliance-${item.id}`, title: item.title, date: item.due_date!, kind: "compliance" as const,
        label: calendarLabels.compliance, href: "/app/administratie", personal: item.responsible_id === user.id,
      })),
      ...(launches.data ?? []).map((item) => ({
        id: `launch-${item.id}`, title: item.title, date: item.launch_date!, kind: "launch" as const,
        label: calendarLabels.launch, href: `/app/shop/lanceringen/${item.id}`, personal: item.owner_id === user.id,
      })),
    ] satisfies CalendarItem[],
    selected,
    scope,
  );

  const offset = (new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const cells = Array.from({ length: Math.ceil((offset + days) / 7) * 7 }, (_, index) => {
    const day = index - offset + 1;
    return day > 0 && day <= days ? day : null;
  });
  const grouped = new Map<string, CalendarItem[]>();
  items.forEach((item) => {
    const key = calendarDayKey(item.date);
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  });
  const title = new Intl.DateTimeFormat("nl-BE", { month: "long", year: "numeric" }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
  const today = calendarDayKey(new Date().toISOString());
  const scopeParam = scope === "mine" ? "mijn" : "alles";
  const base = `type=${selected}&scope=${scopeParam}`;

  return (
    <AppShell active="Kalender">
      <header className="topbar module-top">
        <div><p>PLANNING & DEADLINES</p><h1>Kalender</h1></div>
        <details className="quick-create">
          <summary className="row-action"><Plus size={15}/>Plannen</summary>
          <div><Link href="/app/taken?nieuw=1">Nieuwe taak</Link><Link href="/app/events?nieuw=1">Nieuw event</Link><Link href="/app/vergaderingen?nieuw=1">Nieuwe vergadering</Link></div>
        </details>
      </header>
      <div className="module-body">
        <p className="lead">Eén overzicht van taken, vergaderingen, publicaties, events, campagnes en wettelijke verplichtingen.</p>
        <section className="calendar-alerts">
          <Link href="/app/taken?van_mij=1&deadline=verlopen"><TriangleAlert size={17}/><span><strong>{overdueCount} achterstallige taken</strong><small>Mijn werk met een verlopen deadline</small></span></Link>
          <Link href="/app/taken?van_mij=1"><Clock3 size={17}/><span><strong>{undatedCount} taken zonder datum</strong><small>Nog inplannen</small></span></Link>
        </section>
        <section className="calendar-toolbar">
          <div className="calendar-navigation">
            <Link aria-label="Vorige maand" href={`?${base}&weergave=${view}&maand=${shiftCalendarMonth(month, -1)}`}><ChevronLeft size={17}/></Link>
            <h2>{title}</h2>
            <Link aria-label="Volgende maand" href={`?${base}&weergave=${view}&maand=${shiftCalendarMonth(month, 1)}`}><ChevronRight size={17}/></Link>
            <Link className="calendar-today" href={`?${base}&weergave=${view}`}>Vandaag</Link>
          </div>
          <form>
            <input type="hidden" name="maand" value={month}/>
            <label>Bereik<select name="scope" defaultValue={scopeParam}><option value="alles">Heel BESC</option><option value="mijn">Mijn planning</option></select></label>
            <label>Toon<select name="type" defaultValue={selected}><option value="all">Alles</option>{calendarKinds.map((kind) => <option key={kind} value={kind}>{calendarLabels[kind]}</option>)}</select></label>
            <input type="hidden" name="weergave" value={view}/>
            <button>Filter</button>
          </form>
        </section>
        <div className="calendar-view-switch">
          <Link className={view === "month" ? "active" : ""} href={`?${base}&maand=${month}&weergave=maand`}><Grid3X3 size={14}/>Maand</Link>
          <Link className={view === "agenda" ? "active" : ""} href={`?${base}&maand=${month}&weergave=agenda`}><List size={14}/>Agenda</Link>
        </div>
        <section className="calendar-summary">
          <article><CalendarDays size={18}/><div><span>Gepland deze maand</span><strong>{items.length}</strong></div></article>
          {calendarKinds.map((kind) => {
            const count = items.filter((item) => item.kind === kind).length;
            return count ? <article key={kind}><i className={`calendar-kind ${kind}`}/><div><span>{calendarLabels[kind]}</span><strong>{count}</strong></div></article> : null;
          })}
        </section>
        {view === "month" ? (
          <>
            <div className="calendar-weekdays">{["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"].map((day) => <span key={day}>{day}</span>)}</div>
            <section className="calendar-grid">
              {cells.map((day, index) => {
                if (!day) return <div className="calendar-cell outside" key={`empty-${index}`}/>;
                const key = `${month}-${String(day).padStart(2, "0")}`;
                const dayItems = grouped.get(key) ?? [];
                return <article className={`calendar-cell${key === today ? " today" : ""}`} key={key}><span className="calendar-day">{day}</span><div className="calendar-items">{dayItems.slice(0, 5).map((item) => <Link className={`calendar-item ${item.kind}`} href={item.href} key={item.id}><span>{item.timed ? time(item.date) : item.label}</span><strong>{item.title}</strong></Link>)}{dayItems.length > 5 && <span className="calendar-more">+ {dayItems.length - 5} meer</span>}</div></article>;
              })}
            </section>
          </>
        ) : (
          <section className="calendar-agenda">
            {items.map((item) => <Link href={item.href} key={item.id}><time dateTime={item.date}><strong>{new Intl.DateTimeFormat("nl-BE", { day: "2-digit" }).format(new Date(item.date))}</strong><span>{new Intl.DateTimeFormat("nl-BE", { month: "short" }).format(new Date(item.date))}</span></time><i className={`calendar-kind ${item.kind}`}/><div><strong>{item.title}</strong><small>{item.label}{item.timed && time(item.date) ? ` · ${time(item.date)}` : ""}</small></div><ChevronRight size={15}/></Link>)}
          </section>
        )}
        {!items.length && <div className="calendar-empty">Geen geplande items voor deze selectie.</div>}
      </div>
    </AppShell>
  );
}
