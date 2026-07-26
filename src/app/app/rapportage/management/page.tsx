import Link from "next/link";
import type { CSSProperties } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  CircleDollarSign,
  Gauge,
  Minus,
  Target,
  Users,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ManagementReportActions } from "@/components/management-report-actions";
import { requireActiveMembership } from "@/lib/auth-context";
import {
  managementPeriod,
  percentageDelta,
  targetScore,
  type ReportPeriod,
} from "@/lib/management-report";

function money(value: number) {
  return new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" }).format(value);
}

function Delta({ current, previous }: { current: number; previous: number }) {
  const delta = percentageDelta(current, previous);
  if (delta === null) return <span className="management-delta neutral"><Minus size={12}/>Nieuwe activiteit</span>;
  if (delta === 0) return <span className="management-delta neutral"><Minus size={12}/>Ongewijzigd</span>;
  return <span className={`management-delta ${delta > 0 ? "up" : "down"}`}>{delta > 0 ? <ArrowUpRight size={12}/> : <ArrowDownRight size={12}/>}{Math.abs(delta)}% t.o.v. vorige periode</span>;
}

export default async function ManagementReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const period: ReportPeriod = ["month", "quarter", "year"].includes(params.periode ?? "") ? params.periode as ReportPeriod : "month";
  const anchor = params.datum && /^\d{4}-\d{2}-\d{2}$/.test(params.datum) ? new Date(`${params.datum}T12:00:00Z`) : new Date();
  const range = managementPeriod(period, anchor);
  const { supabase, membership } = await requireActiveMembership();
  const manager = ["admin", "board"].includes(membership.role);
  const organizationId = membership.organization_id;
  if (!manager) return <AppShell active="Rapportage & KPI"><div className="module-body"><div className="permission-note">Het managementoverzicht is alleen beschikbaar voor bestuur en beheerders.</div></div></AppShell>;

  const start = range.start.toISOString();
  const end = range.end.toISOString();
  const previousStart = range.previousStart.toISOString();
  const previousEnd = range.previousEnd.toISOString();
  const today = new Date().toISOString();
  const todayDate = today.slice(0, 10);

  const [
    completedTasks, previousCompletedTasks, publishedContent, previousPublishedContent,
    periodEvents, previousPeriodEvents, newPeople, previousNewPeople, openTasks, overdueTasksCount,
    projects, activePartners, overduePartnerCount, openActions, overdueComplianceCount,
    campaigns, expenses, income, budgets, kpis, overdueTaskRows, blockedProjects,
    overduePartners, overdueCompliance,
  ] = await Promise.all([
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).is("deleted_at", null).gte("completed_at", start).lt("completed_at", end),
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).is("deleted_at", null).gte("completed_at", previousStart).lt("completed_at", previousEnd),
    supabase.from("content_items").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).is("deleted_at", null).gte("publication_at", start).lt("publication_at", end).eq("status", "published"),
    supabase.from("content_items").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).is("deleted_at", null).gte("publication_at", previousStart).lt("publication_at", previousEnd).eq("status", "published"),
    supabase.from("events").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).is("deleted_at", null).gte("start_at", start).lt("start_at", end).not("status", "in", "(cancelled,archived)"),
    supabase.from("events").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).is("deleted_at", null).gte("start_at", previousStart).lt("start_at", previousEnd).not("status", "in", "(cancelled,archived)"),
    supabase.from("community_people").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).is("deleted_at", null).gte("created_at", start).lt("created_at", end),
    supabase.from("community_people").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).is("deleted_at", null).gte("created_at", previousStart).lt("created_at", previousEnd),
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).is("deleted_at", null).not("status", "in", "(done,cancelled)"),
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).is("deleted_at", null).lt("due_at", today).not("status", "in", "(done,cancelled)"),
    supabase.from("projects").select("id,title,status,due_date").eq("organization_id", organizationId).is("deleted_at", null).not("status", "eq", "archived"),
    supabase.from("partners").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).is("deleted_at", null).eq("status", "active"),
    supabase.from("partners").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).is("deleted_at", null).lt("next_follow_up", todayDate).not("status", "in", "(inactive,rejected,archived)"),
    supabase.from("meeting_action_items").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).in("status", ["todo", "doing"]),
    supabase.from("compliance_deadlines").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).is("deleted_at", null).lt("due_date", todayDate).in("status", ["open", "planned"]),
    supabase.from("campaigns").select("id,title,status,end_date").eq("organization_id", organizationId).is("deleted_at", null).not("status", "in", "(completed,cancelled,archived)"),
    supabase.from("expenses").select("amount,status").eq("organization_id", organizationId).is("deleted_at", null).gte("expense_date", start.slice(0, 10)).lt("expense_date", end.slice(0, 10)).not("status", "in", "(rejected,cancelled,archived)"),
    supabase.from("income_entries").select("amount,status").eq("organization_id", organizationId).is("deleted_at", null).gte("expected_date", start.slice(0, 10)).lt("expected_date", end.slice(0, 10)).not("status", "in", "(cancelled,archived)"),
    supabase.from("budget_envelopes").select("planned_amount,status").eq("organization_id", organizationId).is("deleted_at", null).not("status", "in", "(rejected,archived)"),
    supabase.from("kpi_records").select("value,target,domain,metric,name").eq("organization_id", organizationId).is("deleted_at", null).gte("period_end", start.slice(0, 10)).lt("period_end", end.slice(0, 10)),
    supabase.from("tasks").select("id,title,due_at").eq("organization_id", organizationId).is("deleted_at", null).lt("due_at", today).not("status", "in", "(done,cancelled)").order("due_at").limit(5),
    supabase.from("projects").select("id,title,due_date").eq("organization_id", organizationId).is("deleted_at", null).eq("status", "blocked").order("due_date").limit(5),
    supabase.from("partners").select("id,name,next_follow_up").eq("organization_id", organizationId).is("deleted_at", null).lt("next_follow_up", todayDate).not("status", "in", "(inactive,rejected,archived)").order("next_follow_up").limit(5),
    supabase.from("compliance_deadlines").select("id,title,due_date").eq("organization_id", organizationId).is("deleted_at", null).lt("due_date", todayDate).in("status", ["open", "planned"]).order("due_date").limit(5),
  ]);

  const taskDone = completedTasks.count ?? 0;
  const contentDone = publishedContent.count ?? 0;
  const eventsDone = periodEvents.count ?? 0;
  const peopleAdded = newPeople.count ?? 0;
  const projectRows = projects.data ?? [];
  const projectStatuses = ["idea", "planned", "active", "blocked", "done"].map((status) => ({ status, count: projectRows.filter((project) => project.status === status).length }));
  const maxProjects = Math.max(1, ...projectStatuses.map((item) => item.count));
  const expenseTotal = (expenses.data ?? []).reduce((sum, item) => sum + Number(item.amount), 0);
  const incomeTotal = (income.data ?? []).reduce((sum, item) => sum + Number(item.amount), 0);
  const budgetTotal = (budgets.data ?? []).reduce((sum, item) => sum + Number(item.planned_amount), 0);
  const kpiScore = targetScore((kpis.data ?? []).map((item) => ({ value: Number(item.value), target: item.target === null ? null : Number(item.target) })));
  const riskCount = (overdueTasksCount.count ?? 0) + projectRows.filter((project) => project.status === "blocked").length + (overduePartnerCount.count ?? 0) + (overdueComplianceCount.count ?? 0);
  const risks = [
    ...(overdueTaskRows.data ?? []).map((item) => ({ id: `task-${item.id}`, title: item.title, type: "Achterstallige taak", date: item.due_at, href: `/app/taken/${item.id}` })),
    ...(blockedProjects.data ?? []).map((item) => ({ id: `project-${item.id}`, title: item.title, type: "Geblokkeerd project", date: item.due_date, href: `/app/projecten/${item.id}` })),
    ...(overduePartners.data ?? []).map((item) => ({ id: `partner-${item.id}`, title: item.name, type: "Partneropvolging verlopen", date: item.next_follow_up, href: `/app/sponsors/${item.id}` })),
    ...(overdueCompliance.data ?? []).map((item) => ({ id: `compliance-${item.id}`, title: item.title, type: "VZW-deadline verlopen", date: item.due_date, href: "/app/administratie" })),
  ].slice(0, 10);

  return (
    <AppShell active="Rapportage & KPI">
      <header className="topbar module-top management-report-top">
        <div><p>BESTUURSRAPPORT</p><h1>Managementoverzicht</h1></div>
        <div><ManagementReportActions/><Link className="row-action" href="/app/rapportage">KPI-register</Link></div>
      </header>
      <div className="module-body management-report">
        <section className="management-report-intro">
          <div><span className="eyebrow">LIVE MANAGEMENTBEELD</span><h2>{range.label}</h2><p>Samengesteld uit de actuele BESC-gegevens. Momentopname {new Intl.DateTimeFormat("nl-BE", { dateStyle: "long", timeStyle: "short" }).format(new Date())}.</p></div>
          <form><label>Periode<select name="periode" defaultValue={period}><option value="month">Maand</option><option value="quarter">Kwartaal</option><option value="year">Jaar</option></select></label><label>Peildatum<input type="date" name="datum" defaultValue={anchor.toISOString().slice(0, 10)}/></label><button>Bijwerken</button></form>
        </section>

        <section className="management-hero-metrics">
          <article><CheckCircle2/><div><span>Afgeronde taken</span><strong>{taskDone}</strong><Delta current={taskDone} previous={previousCompletedTasks.count ?? 0}/></div></article>
          <article><Gauge/><div><span>Gepubliceerde content</span><strong>{contentDone}</strong><Delta current={contentDone} previous={previousPublishedContent.count ?? 0}/></div></article>
          <article><Target/><div><span>Events in periode</span><strong>{eventsDone}</strong><Delta current={eventsDone} previous={previousPeriodEvents.count ?? 0}/></div></article>
          <article><Users/><div><span>Nieuwe profielen</span><strong>{peopleAdded}</strong><Delta current={peopleAdded} previous={previousNewPeople.count ?? 0}/></div></article>
          <Link href="#risicos" className={riskCount ? "risk" : "healthy"}><AlertTriangle/><div><span>Open risico’s</span><strong>{riskCount}</strong><small>Bekijk risico’s en aandachtspunten</small></div><ArrowRight size={16}/></Link>
        </section>

        <div className="management-grid">
          <section className="panel management-health">
            <div className="panel-head"><div><span className="eyebrow">OPERATIONELE GEZONDHEID</span><h3>Werkvoorraad</h3></div></div>
            <div className="management-health-grid">
              <Link href="/app/taken?weergave=open"><span>Open taken</span><strong>{openTasks.count ?? 0}</strong></Link>
              <Link href="/app/taken?periode=achterstallig&weergave=open"><span>Achterstallig</span><strong>{overdueTasksCount.count ?? 0}</strong></Link>
              <Link href="/app/projecten?status=active"><span>Actieve projecten</span><strong>{projectRows.filter((item) => item.status === "active").length}</strong></Link>
              <Link href="/app/projecten?status=blocked"><span>Geblokkeerd</span><strong>{projectRows.filter((item) => item.status === "blocked").length}</strong></Link>
              <Link href="/app/vergaderingen?actiepunten=open#open-actiepunten"><span>Open actiepunten</span><strong>{openActions.count ?? 0}</strong></Link>
              <Link href="/app/campagnes?weergave=open"><span>Actieve campagnes</span><strong>{campaigns.data?.length ?? 0}</strong></Link>
              <Link href="/app/sponsors?status=active"><span>Actieve partners</span><strong>{activePartners.count ?? 0}</strong></Link>
              <Link href="/app/administratie?periode=achterstallig#deadlines"><span>VZW achterstallig</span><strong>{overdueComplianceCount.count ?? 0}</strong></Link>
            </div>
          </section>
          <section className="panel management-portfolio">
            <div className="panel-head"><div><span className="eyebrow">PROJECTPORTFOLIO</span><h3>Statusverdeling</h3></div><Link href="/app/projecten">Open projecten</Link></div>
            <div className="management-bars">{projectStatuses.map((item) => <div key={item.status}><span>{({ idea: "Idee", planned: "Gepland", active: "Actief", blocked: "Geblokkeerd", done: "Afgerond" } as Record<string, string>)[item.status]}</span><i><b style={{ width: `${item.count / maxProjects * 100}%` }}/></i><strong>{item.count}</strong></div>)}</div>
          </section>
        </div>

        <div className="management-grid">
          <section className="panel management-finance">
            <div className="panel-head"><div><span className="eyebrow">FINANCIËLE KERNCIJFERS</span><h3>{range.label}</h3></div><Link href="/app/financien/rapportage">Financieel rapport</Link></div>
            <div className="management-finance-grid">
              <article><span>Inkomsten</span><strong>{money(incomeTotal)}</strong></article>
              <article><span>Kosten</span><strong>{money(expenseTotal)}</strong></article>
              <article className={incomeTotal - expenseTotal < 0 ? "negative" : ""}><span>Saldo periode</span><strong>{money(incomeTotal - expenseTotal)}</strong></article>
              <article><span>Actief/gepland budget</span><strong>{money(budgetTotal)}</strong></article>
            </div>
          </section>
          <section className="panel management-kpis">
            <div className="panel-head"><div><span className="eyebrow">KPI & DOELEN</span><h3>Doelrealisatie</h3></div><Link href="/app/rapportage">Alle KPI’s</Link></div>
            <div className="management-target-score"><div style={{ "--score": `${kpiScore.percentage}%` } as CSSProperties}><strong>{kpiScore.percentage}%</strong></div><span><b>{kpiScore.reached} van {kpiScore.total}</b> KPI-doelen behaald in deze periode</span></div>
          </section>
        </div>

        <section id="risicos" className="panel management-risks">
          <div className="panel-head"><div><span className="eyebrow">RISICO’S & AANDACHTSPUNTEN</span><h3>Prioriteiten voor het bestuur</h3></div><span>{risks.length} van {riskCount} getoond</span></div>
          <div>{risks.map((risk) => <Link href={risk.href} key={risk.id}><AlertTriangle size={15}/><span><strong>{risk.title}</strong><small>{risk.type}{risk.date ? ` · ${new Intl.DateTimeFormat("nl-BE", { dateStyle: "medium" }).format(new Date(risk.date))}` : ""}</small></span><ArrowRight size={14}/></Link>)}{!risks.length && <div className="empty">Geen achterstallige of geblokkeerde dossiers.</div>}</div>
        </section>

        <footer className="management-source-note"><CircleDollarSign size={14}/>Bronnen: live operationele tabellen en handmatig geregistreerde KPI’s in Supabase. Financiële bedragen volgen de geselecteerde rapportageperiode.</footer>
      </div>
    </AppShell>
  );
}
