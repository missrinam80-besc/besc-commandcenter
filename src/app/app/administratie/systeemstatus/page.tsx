import Link from 'next/link';
import {AppShell} from '@/components/app-shell';
import {requireActiveMembership} from '@/lib/auth-context';
import {operationsSchema,currentStatus,targetLabels,statusLabels,checkLabels} from '@/lib/operations-status';
import {OperationsRefresh} from '@/components/operations-refresh';
import './status.css';
export const dynamic='force-dynamic';
const time=(s:string|null)=>s?new Date(s).toLocaleString('nl-BE',{timeZone:'Europe/Brussels'}):'Nog geen meting';
export default async function Page(){
 const {supabase,membership}=await requireActiveMembership();
 if(membership.role!=='admin')return <AppShell active="Systeemstatus"><div className="module-body permission-note">Systeemstatus is alleen beschikbaar voor actieve beheerders.</div></AppShell>;
 const result=await supabase.rpc('ops_read_status',{p_organization_id:membership.organization_id});const parsed=operationsSchema.safeParse(result.data);
 return <AppShell active="Systeemstatus"><header className="topbar module-top ops-topbar"><div><p>BEHEER</p><h1>Systeemstatus</h1></div><Link href="/app/administratie/systeemstatus" className="button">Nu vernieuwen</Link></header><div className="module-body ops-status"><OperationsRefresh/>
 <p>Metingen volgen elke vijf minuten. Deze pagina vernieuwt elke minuut. Een meting ouder dan vijftien minuten bevestigt geen actuele gezondheid.</p>
 {result.error||!parsed.success?<div className="error-note" role="alert">De bewaking is momenteel niet beschikbaar. Er wordt geen gezonde toestand verondersteld.</div>:<div className="ops-grid">{parsed.data.map(row=>{const state=currentStatus(row);return <section className={'ops-card ops-'+state} key={row.target}><div className="ops-card-head"><h2>{targetLabels[row.target]}</h2><strong>{statusLabels[state]}</strong></div><p>Laatste meting: {time(row.observed_at)}</p>
 {state==='pending'&&<p>Dit onderdeel is nog niet aangesloten op de bewaking.</p>}{state==='stale'&&<p role="alert">Er komt geen actuele meting binnen. Controleer de verbinding en de bewaking.</p>}
 {row.checks.length>0&&<h3>Controles bij de laatste meting</h3>}<ul>{row.checks.map(c=><li key={c.code}><span>{checkLabels[c.code]}</span><strong className={'ops-level-'+c.level}>{statusLabels[c.level]}</strong></li>)}</ul>
 <dl>{row.metrics.disk_free_kib!==undefined&&<><dt>Vrije schijfruimte</dt><dd>{(row.metrics.disk_free_kib/1024/1024).toFixed(2)} GiB</dd></>}{row.metrics.disk_used_pct!==undefined&&<><dt>Schijf gebruikt</dt><dd>{row.metrics.disk_used_pct.toFixed(1)}%</dd></>}{row.metrics.mem_available_kib!==undefined&&<><dt>Beschikbaar geheugen</dt><dd>{Math.round(row.metrics.mem_available_kib/1024)} MiB</dd></>}{row.metrics.db_bytes!==undefined&&<><dt>Databaseomvang</dt><dd>{(row.metrics.db_bytes/1024/1024).toFixed(1)} MiB</dd></>}{row.metrics.connections!==undefined&&<><dt>Databaseverbindingen</dt><dd>{row.metrics.connections}</dd></>}</dl>
 {row.transitions.length>0&&<details><summary>Laatste statuswijzigingen</summary><ol>{row.transitions.slice(-5).reverse().map((t,i)=><li key={i}>{time(t.at)} â€” {statusLabels[t.status]}{t.checks.some(c=>c.level!=='ok')&&': '+t.checks.filter(c=>c.level!=='ok').map(c=>checkLabels[c.code]).join(', ')}</li>)}</ol></details>}
 </section>;})}</div>}
 <section className="ops-notes"><h2>Beheer en herstel</h2><p>Bij een waarschuwing: controleer de laatste meting, bepaal de oorzaak en voer alleen een gerichte ingreep uit. Herstarten, opschonen en terugzetten gebeuren niet automatisch door deze bewaking.</p><p>Een vervanger voor technisch beheer en mailbox is nog niet afgesproken. Back-ups blijven handmatig; er is geen dagelijkse back-uptaak ingesteld.</p><p>De webbewaking deelt de server met Command Center. Bij volledige uitval is deze pagina niet bereikbaar. Onafhankelijke externe bewaking blijft een apart open punt.</p></section>
 </div></AppShell>;
}
