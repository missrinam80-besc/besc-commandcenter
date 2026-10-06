import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ManagementReportActions } from "@/components/management-report-actions";
import { requireActiveMembership } from "@/lib/auth-context";
import { managementPeriod, type ReportPeriod, kpiValueLabel, kpiTargetLabel, targetDirectionLabels, measuredValue } from "@/lib/management-report";
import { googlePitchdeckConfiguration } from "@/lib/google-workspace";
import { generateSponsorPitchdeck } from "@/app/app/google-document-actions";
import { isActiveSponsor } from "@/lib/reporting-scope";

const money = (value: number) => new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" }).format(value);
const number = (value: number) => new Intl.NumberFormat("nl-BE").format(value);

export default async function SponsorReportPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const q = await searchParams;
  const period: ReportPeriod = ["month", "quarter", "year"].includes(q.periode ?? "") ? q.periode as ReportPeriod : "month";
  const anchor = q.datum && /^\d{4}-\d{2}-\d{2}$/.test(q.datum) ? new Date(`${q.datum}T12:00:00Z`) : new Date();
  const range = managementPeriod(period, anchor);
  const start = range.start.toISOString().slice(0, 10);
  const end = range.end.toISOString().slice(0, 10);
  const { supabase, membership } = await requireActiveMembership();
  const org = membership.organization_id;
  if (!["admin", "board", "member"].includes(membership.role)) return <AppShell active="Sponsorrapportage"><div className="module-body"><div className="permission-note">Sponsorrapporten zijn alleen beschikbaar voor bestuur en medewerkers.</div></div></AppShell>;
  const canManageReportAssets = ["admin", "board"].includes(membership.role);
  const [partner, campaignResult, allDeliverables, kpis, expenses, income, content] = await Promise.all([
    supabase.from("partners").select("id,name,status,partner_type,estimated_value,collaboration_type,agreement_summary").eq("organization_id", org).eq("id", id).is("deleted_at", null).maybeSingle(),
    supabase.from("campaigns").select("id,title,status,start_date,end_date,value,impressions,clicks,results_summary").eq("organization_id", org).eq("partner_id", id).is("deleted_at", null).not("status", "in", "(cancelled,archived)"),
    supabase.from("campaign_deliverables").select("id,campaign_id,title,status,due_date,approval_status").eq("organization_id", org),
    supabase.from("kpi_records").select("id,name,metric,value,target,measurement_status,target_direction,unit,source,collection_method,metric_definition,partner_id,campaign_id,community_person_id,community_people(display_name)").eq("organization_id", org).is("deleted_at", null).gte("period_end", start).lt("period_end", end),
    supabase.from("expenses").select("amount,partner_id,campaign_id,expense_date,status").eq("organization_id", org).is("deleted_at", null).gte("expense_date", start).lt("expense_date", end).not("status", "in", "(rejected,cancelled,archived)"),
    supabase.from("income_entries").select("amount,partner_id,campaign_id,expected_date,status").eq("organization_id", org).is("deleted_at", null).gte("expected_date", start).lt("expected_date", end).not("status", "in", "(cancelled,archived)"),
    supabase.from("content_items").select("id,title,status,publication_at,campaign_id,partner_id,publication_url").eq("organization_id", org).is("deleted_at", null).gte("publication_at", range.start.toISOString()).lt("publication_at", range.end.toISOString()),
  ]);
  if (!partner.data || !isActiveSponsor(partner.data)) notFound();
  const campaigns = (campaignResult.data ?? []).filter((item) => (!item.start_date || item.start_date < end) && (!item.end_date || item.end_date >= start));
  const campaignIds = new Set(campaigns.map((item) => item.id));
  const deliverables = (allDeliverables.data ?? []).filter((item) => campaignIds.has(item.campaign_id));
  const sponsorKpis = (kpis.data ?? []).filter((item) => item.partner_id === id || (item.campaign_id && campaignIds.has(item.campaign_id)));
  const sponsorExpenses = (expenses.data ?? []).filter((item) => item.partner_id === id || (item.campaign_id && campaignIds.has(item.campaign_id)));
  const sponsorIncome = (income.data ?? []).filter((item) => item.partner_id === id || (item.campaign_id && campaignIds.has(item.campaign_id)));
  const sponsorContent = (content.data ?? []).filter((item) => item.partner_id === id || (item.campaign_id && campaignIds.has(item.campaign_id)));
  const realized = campaigns.reduce((sum, item) => sum + Number(item.value ?? 0), 0);
  const impressions = campaigns.reduce((sum, item) => sum + Number(item.impressions ?? 0), 0);
  const clicks = campaigns.reduce((sum, item) => sum + Number(item.clicks ?? 0), 0);
  const completedDeliverables = deliverables.filter((item) => ["completed", "approved"].includes(item.status)).length;
  const creatorRows = sponsorKpis.filter((item) => item.community_person_id).reduce((rows, item) => { const raw = item.community_people as unknown as { display_name?: string } | { display_name?: string }[] | null; const name = (Array.isArray(raw) ? raw[0]?.display_name : raw?.display_name) ?? "Onbekende creator"; const row = rows.get(item.community_person_id!) ?? { name, measurements: 0, total: 0, measured: 0 }; row.measurements += 1; const value = measuredValue(item); if (value !== null) { row.total += value; row.measured += 1; } rows.set(item.community_person_id!, row); return rows; }, new Map<string, { name: string; measurements: number; total: number; measured: number }>());
  const exportHref = `/app/rapportage/sponsors/${id}/export?periode=${period}&datum=${anchor.toISOString().slice(0, 10)}`;
  const pitchdeck=googlePitchdeckConfiguration();
  return <AppShell active="Sponsorrapportage">
    <header className="project-detail-head"><div><Link href="/app/rapportage/sponsors">← Kies andere sponsor</Link><span className="eyebrow">SPONSORRAPPORT</span><h1>{partner.data.name}</h1><p>{range.label} · live gegevens uit BESC Command Center</p></div><div className="project-actions"><Link href={`/app/sponsors/${id}`}>Open sponsorfiche</Link>{canManageReportAssets && (pitchdeck.sponsor?<form action={generateSponsorPitchdeck}><input type="hidden" name="partner_id" value={id}/><input type="hidden" name="period_start" value={start}/><input type="hidden" name="period_end" value={end}/><input type="hidden" name="period_label" value={range.label}/><button>Google Slides-pitchdeck</button></form>:<span className="field-help">Voeg het sponsor-pitchdecktemplate toe in Vercel.</span>)}<ManagementReportActions exportHref={exportHref}/></div></header>
    <div className="project-detail-body management-report">
      {q.succes==="pitchdeck"&&<div className="success">Het sponsor-pitchdeck is in Google Drive aangemaakt.</div>}{q.fout&&<div className="error-note">Pitchdeck aanmaken is mislukt ({q.fout}).</div>}
      <section className="management-report-intro"><div><span className="eyebrow">RAPPORTPERIODE</span><h2>{range.label}</h2><p>Bronnen: campagnes, deliverables, content, financiën en KPI-registraties. Automatische en handmatige metingen worden afzonderlijk aangeduid.</p></div><form><label>Periode<select name="periode" defaultValue={period}><option value="month">Maand</option><option value="quarter">Kwartaal</option><option value="year">Jaar</option></select></label><label>Peildatum<input type="date" name="datum" defaultValue={anchor.toISOString().slice(0, 10)}/></label><button>Bijwerken</button></form></section>
      <section className="management-hero-metrics"><article><div><span>Campagnes</span><strong>{campaigns.length}</strong></div></article><article><div><span>Gerealiseerde waarde</span><strong>{money(realized)}</strong></div></article><article><div><span>Deliverables</span><strong>{completedDeliverables}/{deliverables.length}</strong></div></article><article><div><span>Bereik</span><strong>{number(impressions)}</strong><small>{number(clicks)} klikken</small></div></article><article><div><span>Publicaties</span><strong>{sponsorContent.length}</strong></div></article></section>
      <section className="panel management-sponsors"><div className="panel-head"><div><span className="eyebrow">CAMPAGNES</span><h3>Realisatie per campagne</h3></div></div><div className="management-table-wrap"><table className="management-table"><thead><tr><th>Campagne</th><th>Status</th><th>Waarde</th><th>Impressies</th><th>Kliks</th><th>Periode</th></tr></thead><tbody>{campaigns.map((item) => <tr key={item.id}><td><Link href={`/app/campagnes/${item.id}`}>{item.title}</Link></td><td>{item.status}</td><td>{money(Number(item.value ?? 0))}</td><td>{number(Number(item.impressions ?? 0))}</td><td>{number(Number(item.clicks ?? 0))}</td><td>{item.start_date || "—"} — {item.end_date || "—"}</td></tr>)}</tbody></table>{!campaigns.length && <div className="empty">Geen campagnes in deze periode.</div>}</div></section>
      <section className="panel management-sponsors"><div className="panel-head"><div><span className="eyebrow">KPI-RESULTATEN</span><h3>Meetresultaten en definities</h3></div></div><div className="management-table-wrap"><table className="management-table"><thead><tr><th>Metric</th><th>Waarde</th><th>Doel</th><th>Bron</th><th>Methode</th><th>Definitie</th></tr></thead><tbody>{sponsorKpis.map((item) => <tr key={item.id}><td><Link href={`/app/rapportage/${item.id}`}>{item.metric}</Link></td><td>{kpiValueLabel(item)} {item.unit}</td><td>{item.target == null ? "—" : number(Number(item.target))}<small> · {targetDirectionLabels[item.target_direction] ?? targetDirectionLabels.unknown} · {kpiTargetLabel(item)}</small></td><td>{item.source}</td><td>{item.collection_method === "api" ? "API" : item.collection_method === "imported" ? "Import" : "Handmatig"}</td><td>{item.metric_definition || "Nog niet vastgelegd"}</td></tr>)}</tbody></table>{!sponsorKpis.length && <div className="empty">Geen KPI-metingen gekoppeld aan deze sponsor of campagnes.</div>}</div></section>
      <div className="management-grid"><section className="panel management-finance"><div className="panel-head"><div><span className="eyebrow">FINANCIËLE REALISATIE</span><h3>Inkomsten en kosten</h3></div></div><div className="management-finance-grid"><article><span>Inkomsten</span><strong>{money(sponsorIncome.reduce((sum, item) => sum + Number(item.amount), 0))}</strong></article><article><span>Kosten</span><strong>{money(sponsorExpenses.reduce((sum, item) => sum + Number(item.amount), 0))}</strong></article></div></section><section className="panel"><div className="panel-head"><div><span className="eyebrow">CREATORS & STREAMERS</span><h3>Gekoppelde resultaten</h3></div></div><div className="relation-list">{Array.from(creatorRows.entries()).map(([personId, row]) => <article key={personId}><Link href={`/app/community/${personId}`}>{row.name}</Link><span>{row.measured} gemeten · {row.measurements - row.measured} ontbrekend · opgetelde waarde {row.measured ? number(row.total) : "Ontbrekende meting"}</span></article>)}{!creatorRows.size && <div className="empty">Nog geen creator- of streamerresultaten gekoppeld.</div>}</div></section></div>
    </div>
  </AppShell>;
}
