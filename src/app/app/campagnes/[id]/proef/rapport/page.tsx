import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { requireActiveMembership } from '@/lib/auth-context';
import { pilotReport, type PilotState } from '@/lib/campaign-pilot';
import { pilotSelectionFromQuery } from '@/lib/campaign-pilot-selection';
import '@/app/app/administratie/werkstromen/workflows.css';
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params, query = await searchParams;
  const { supabase, membership } = await requireActiveMembership();
  if (process.env.BESC_CAMPAIGNS_PILOT_ENABLED !== 'true') return <p>De campagneproef is uitgeschakeld.</p>;
  const result = query.revisie ? await supabase.rpc('f3_report_revision', { p_organization_id: membership.organization_id, p_campaign_id: id, p_report_id: query.revisie }) : await supabase.rpc('f3_campaign_state', { p_organization_id: membership.organization_id, p_campaign_id: id });
  if (result.error || !result.data?.reader) return <p>Dit rapport is niet beschikbaar of je actuele toegang ontbreekt.</p>;
  const state = result.data as PilotState & { as_of: string };
  const selection = pilotSelectionFromQuery(query, state.as_of);
  const report = selection ? pilotReport(state, selection) : null;
  const exportQuery = new URLSearchParams(Object.entries(query).filter((x): x is [string, string] => typeof x[1] === 'string'));
  return <AppShell active="Campagnes"><header className="topbar"><h1>Intern campagnetestrapport</h1></header><div className="module-body f1-workspace"><p>TESTFIXTURE — NIET PUBLICEREN. Geen officiële accountmetingen. Dit rapport vervangt Metricool niet.</p><Link href={`/app/campagnes/${id}/proef`}>Naar de campagneproef</Link>
    <section><h2>Meetplan voor twee vensters</h2><form method="get" className="f1-form">
      {query.revisie && <input type="hidden" name="revisie" value={query.revisie}/>}
      <label>Metric<select name="metric" defaultValue={query.metric} required><option value="">Maak een keuze</option>{['views', 'likes', 'comments', 'reach', 'impressions'].map(v => <option key={v}>{v}</option>)}</select></label>
      <label>Exacte meetdefinitie<input name="definition" defaultValue={query.definition} required maxLength={240}/></label>
      <label>Soort waarde<select name="semantics" defaultValue={query.semantics ?? 'period'}><option value="period">Periodewaarde</option><option value="cumulative">Cumulatieve teller; geen periodeoptelsom</option></select></label>
      {['first_start', 'first_end', 'second_start', 'second_end'].map((key, index) => <label key={key}>{['Eerste begin', 'Eerste einde', 'Tweede begin', 'Tweede einde'][index]} (Brussel)<input name={key} type="datetime-local" required defaultValue={query[key]}/></label>)}
      <label>Maximale ouderdom in uren<input name="freshness" type="number" min="1" max="8760" required defaultValue={query.freshness}/></label><button>Rapport bekijken</button>
    </form>{!selection && <p>Kies een definitie en twee niet-overlappende vensters die vóór de peildatum eindigen.</p>}</section>
    {report && <><section><h2>Bron en dekking</h2><p>Peildatum: {selection!.asOf}. {query.revisie ? 'Vastgelegde invoerrevisie' : 'Actuele invoer'}.</p><p>{report.excluded} bijdragen uitgesloten door ongeldige deelname. Cumulatieve tellers en bereik worden niet tot campagnebereik opgeteld.</p>
      {(['first', 'second'] as const).map((key, index) => { const window = report[key]; return <article key={key}><h3>Venster {index + 1}</h3><p>{window.measured} van {window.total} geverifieerde bijdragen gemeten · {window.missing} ontbrekend · {window.stale} verouderd · {window.conflicted} tegenstrijdig · {window.partial} gedeeltelijk.</p><p>Periodewaarde: {window.value === null ? 'Niet berekenbaar' : window.value.toLocaleString('nl-BE')}{!window.complete && window.value !== null ? ' (gedeeltelijke dekking)' : ''}</p>{window.rows.map(row => <p key={row.postId}>{row.url}: {row.value ?? 'Onbekend'} · {row.quality} · {row.source ?? 'Geen bron'} · {row.reference ?? 'Geen referentie'}</p>)}</article>; })}
      <p>Verschil bij vergelijkbare volledige dekking: {report.comparison.delta ?? 'Onbekend'}. Procentueel: {report.comparison.percent === null ? 'Niet berekenbaar' : report.comparison.percent.toFixed(2) + '%'}.</p>
    </section><section><h2>Interne export</h2><p>Dezelfde bronselectie en rechten worden bij downloaden opnieuw gecontroleerd. Een gedownload bestand kan niet op afstand worden ingetrokken.</p><a href={`/app/campagnes/${id}/proef/rapport/export?${exportQuery}`}>CSV downloaden</a></section></>}
  </div></AppShell>;
}
