import { kpiValueLabel, kpiTargetLabel, targetDirectionLabels, targetScore } from "@/lib/management-report";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ManagementReportActions } from "@/components/management-report-actions";
import { requireActiveMembership } from "@/lib/auth-context";
import { isActiveStreamTeamMember } from "@/lib/reporting-scope";

const number = (value: number) => new Intl.NumberFormat("nl-BE").format(value);

export default async function StreamTeamReport({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const query = await searchParams;
  const year = Number(query.jaar) || new Date().getFullYear();
  const { supabase, membership } = await requireActiveMembership();
  if (!["admin", "board", "member"].includes(membership.role)) {
    return <AppShell active="Streamerrapportage"><div className="module-body"><div className="permission-note">Streamerrapportage is alleen beschikbaar voor bestuur en medewerkers.</div></div></AppShell>;
  }
  const organizationId = membership.organization_id;
  const { data: peopleData } = await supabase.from("community_people").select("id,display_name,handle,status,person_type,roles:community_person_roles(role)").eq("organization_id", organizationId).is("deleted_at", null).order("display_name");
  const people = (peopleData ?? []).filter(isActiveStreamTeamMember);
  const personIds = people.map((person) => person.id);
  const [kpis, assignments] = personIds.length
    ? await Promise.all([
        supabase.from("kpi_records").select("id,community_person_id,name,metric,value,target,measurement_status,target_direction,unit,source,collection_method,period_start,period_end").eq("organization_id", organizationId).in("community_person_id", personIds).is("deleted_at", null).gte("period_end", `${year}-01-01`).lte("period_end", `${year}-12-31`).order("period_end", { ascending: false }),
        supabase.from("community_assignments").select("id,person_id,role_name,status,starts_at,projects(id,title),events(id,title)").eq("organization_id", organizationId).in("person_id", personIds).neq("status", "cancelled").order("starts_at", { ascending: false }),
      ])
    : [{ data: [] }, { data: [] }];
  const kpiRows = kpis.data ?? [];
  const assignmentRows = assignments.data ?? [];
  const score = targetScore(kpiRows);
  const byPerson = people.map((person) => {
    const personKpis = kpiRows.filter((item) => item.community_person_id === person.id);
    const personScore = targetScore(personKpis);
    return { ...person, kpis: personKpis.length, assignments: assignmentRows.filter((item) => item.person_id === person.id).length, reached: personScore.reached, targets: personScore.total, unassessed: personScore.unassessed };
  });

  return <AppShell active="Streamerrapportage">
    <header className="project-detail-head"><div><Link href="/app/rapportage/creators">← Individuele streamteamfiches</Link><span className="eyebrow">STREAMTEAMRAPPORT</span><h1>Totaalrapport streamteam</h1><p>{year} · actieve streamteamleden, inzetten en KPI-resultaten</p></div><div className="project-actions"><ManagementReportActions exportHref={`/app/rapportage/creators/team/export?jaar=${year}`} /></div></header>
    <div className="project-detail-body management-report">
      <section className="management-report-intro"><div><span className="eyebrow">RAPPORTPERIODE</span><h2>{year}</h2><p>Alleen actieve communityprofielen met de rol Streamteam worden meegenomen. Het streamteamniveau is niet vereist.</p></div><form><label>Jaar<input name="jaar" type="number" defaultValue={year} /></label><button>Bijwerken</button></form></section>
      <section className="management-hero-metrics"><article><div><span>Streamteamleden</span><strong>{people.length}</strong></div></article><article><div><span>KPI-metingen</span><strong>{kpiRows.length}</strong></div></article><article><div><span>Doelen behaald</span><strong>{score.reached}/{score.total}</strong><small>{score.unassessed} niet te beoordelen</small></div></article><article><div><span>Inzetten</span><strong>{assignmentRows.length}</strong></div></article></section>
      <section className="panel management-sponsors"><div className="panel-head"><div><span className="eyebrow">TEAMOVERZICHT</span><h3>Resultaten per streamteamlid</h3></div><Link href="/app/rapportage/creators">Individuele fiches</Link></div><div className="management-table-wrap"><table className="management-table"><thead><tr><th>Streamteamlid</th><th>Handle</th><th>Metingen</th><th>Doelen behaald</th><th>Inzetten</th><th>Status</th></tr></thead><tbody>{byPerson.map((person) => <tr key={person.id}><td><Link href={`/app/rapportage/creators/${person.id}`}>{person.display_name}</Link></td><td>{person.handle || "—"}</td><td>{number(person.kpis)}</td><td>{person.reached}/{person.targets}<small> · {person.unassessed} niet te beoordelen</small></td><td>{number(person.assignments)}</td><td>{person.status}</td></tr>)}</tbody></table>{!byPerson.length && <div className="empty">Er zijn nog geen actieve streamteamleden.</div>}</div></section>
      <section className="panel management-sponsors"><div className="panel-head"><div><span className="eyebrow">RECENTE RESULTATEN</span><h3>KPI&apos;s van het team</h3></div></div><div className="management-table-wrap"><table className="management-table"><thead><tr><th>Streamteamlid</th><th>Metric</th><th>Waarde</th><th>Doel</th><th>Bron</th><th>Periode</th></tr></thead><tbody>{kpiRows.map((item) => { const person = people.find((candidate) => candidate.id === item.community_person_id); return <tr key={item.id}><td>{person ? <Link href={`/app/rapportage/creators/${person.id}`}>{person.display_name}</Link> : "Onbekend"}</td><td><Link href={`/app/rapportage/${item.id}`}>{item.metric}</Link></td><td>{kpiValueLabel(item)} {item.unit}</td><td>{item.target == null ? "—" : number(Number(item.target))}<small> · {targetDirectionLabels[item.target_direction] ?? targetDirectionLabels.unknown} · {kpiTargetLabel(item)}</small></td><td>{item.source}</td><td>{item.period_start || "—"} — {item.period_end || "—"}</td></tr>; })}</tbody></table>{!kpiRows.length && <div className="empty">Nog geen KPI-metingen voor dit jaar.</div>}</div></section>
    </div>
  </AppShell>;
}
