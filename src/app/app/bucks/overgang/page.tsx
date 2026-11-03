import Link from 'next/link';
import '../rewards.css';
import {randomUUID} from 'node:crypto';
import {redirect} from 'next/navigation';
import {z} from 'zod';
import {AppShell} from '@/components/app-shell';
import {requireActiveMembership} from '@/lib/auth-context';
import {hasPermission} from '@/lib/permissions';
import {saveTransfer} from './actions';
export const dynamic='force-dynamic';
const row=z.object({twitch_user_id:z.string(),user_id:z.uuid(),before:z.string(),target:z.string(),difference:z.string(),xp:z.string(),reserved:z.string()});
const batch=z.object({id:z.uuid(),status:z.enum(['prepared','cancelled','completed']),plan_sha256:z.string(),export_sha256:z.string(),original_sha256:z.string(),broadcaster_id:z.string(),cutoff:z.string(),plan:z.array(row)});
export default async function Transfer({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 const {supabase,membership}=await requireActiveMembership();if(!hasPermission(membership,'manageRewards'))redirect('/app/bucks?fout=rewards_forbidden');
 const params=await searchParams,enabled=process.env.BESC_REWARDS_TRANSFER_ENABLED==='true';
 const state=enabled?await supabase.rpc('re03_transfer',{o:membership.organization_id,op:'state'}):null;
 const list=z.object({batches:z.array(z.object({id:z.uuid(),status:z.string(),created_at:z.string()}))}).safeParse(state?.data);
 const detail=enabled&&z.uuid().safeParse(params.batch).success?await supabase.rpc('re03_transfer',{o:membership.organization_id,op:'read',d:{id:params.batch}}):null;
 const current=batch.safeParse(detail?.data);
 return <AppShell active="BESC Bucks en XP"><header className="topbar"><h1>StreamElements-saldo-overgang</h1></header><div className="module-body"><Link href="/app/bucks/reconciliatie">Alleen saldi vergelijken</Link>
 <p>We stellen het goedgekeurde doelsaldo in. Alleen het verschil wordt geboekt; XP en reserveringen blijven behouden. Een bronkanaal kan eenmaal worden overgezet. Een gewijzigde saldostand of accountkoppeling blokkeert de uitvoering.</p>
 {params.fout&&<p role="alert">Niet bevestigd. Controleer bestanden, koppelingen, reserveringen en de actuele saldostand. Bereid bij gewijzigde gegevens een nieuw overzicht voor.</p>}{params.opgeslagen&&<p role="status">De handeling is bevestigd. Hieronder staan de actuele gegevens.</p>}
 {!enabled?<p>De saldo-overgang staat uit.</p>:<>
 <details><summary>Nieuw overgangsoverzicht voorbereiden</summary><p>Bewaar de oorspronkelijke StreamElements-export afgeschermd. Lever daarnaast de gecontroleerde omzetting aan als UTF-8 CSV met kop <code>external_id,bucks</code> en rijen zoals <code>twitch:123,100</code>. Het aparte mappingbestand heeft kop <code>external_id,cc_user_id</code>. Gebruik numerieke Twitch-ID’s en bestaande CC-account-ID’s; namen leveren geen bewezen mapping. Maximaal 256 KB per bestand en 5000 accounts.</p>
 <form className="reward-form" action={saveTransfer}><input type="hidden" name="op" value="prepare"/><input type="hidden" name="id" value={randomUUID()}/>
 <label>Numeriek Twitch-kanaal-ID<input name="broadcaster_id" required pattern="[1-9][0-9]{0,19}"/></label>
 <label>Stopmoment bron, met tijdzone (bijvoorbeeld 2026-11-03T18:00:00+01:00)<input name="cutoff" required/></label>
 <label>Gecontroleerd totaal doelsaldo<input name="declared_total" required pattern="[0-9]{1,20}"/></label>
 <label>Oorspronkelijke StreamElements-export<input name="original" type="file" required/></label><label>Gecontroleerde omzetting<input name="export" type="file" accept=".csv" required/></label><label>Expliciete accountmapping<input name="mapping" type="file" accept=".csv" required/></label>
 <label><input name="conversion_verified" type="checkbox" required/>Ik heb de omzetting en het totaal tegen de oorspronkelijke export gecontroleerd.</label><button className="secondary">Overzicht vastzetten zonder saldi te wijzigen</button></form></details>
 {list.success?<section className="panel"><h2>Opgeslagen overzichten</h2>{list.data.batches.map(b=><p key={b.id}><Link href={'?batch='+b.id}>{b.id}</Link> · {b.status} · {b.created_at}</p>)}</section>:<p>De overzichten konden niet worden geladen.</p>}
 {current.success&&<section className="panel"><h2>Vastgezet overzicht · {current.data.status}</h2><p>Kanaal {current.data.broadcaster_id} · stopmoment {current.data.cutoff}</p><p>Oorspronkelijke export: {current.data.original_sha256}</p><p>Gecontroleerde omzetting: {current.data.export_sha256}</p><p>Overzicht: {current.data.plan_sha256}</p>
 <div className="table-wrap"><table><thead><tr><th>Twitch / CC</th><th>Huidig</th><th>Doel</th><th>Verschil</th><th>XP</th><th>Gereserveerd</th></tr></thead><tbody>{current.data.plan.map(r=><tr key={r.user_id}><td>{r.twitch_user_id}<br/>{r.user_id}</td><td>{r.before}</td><td>{r.target}</td><td>{r.difference}</td><td>{r.xp}</td><td>{r.reserved}</td></tr>)}</tbody></table></div>
 {current.data.status==='prepared'&&(['execute','cancel'] as const).map(op=><form className="reward-form" key={op} action={saveTransfer}><input type="hidden" name="op" value={op}/><input type="hidden" name="id" value={current.data.id}/><input type="hidden" name="plan_sha256" value={current.data.plan_sha256}/><label>Reden / goedkeuringsbron<input name="reason" maxLength={1000} required/></label>
 {op==='execute'&&<><label><input name="source_stopped" type="checkbox" required/>Verdienen bij de bron is gestopt.</label><label><input name="cutoff_confirmed" type="checkbox" required/>De export hoort bij het vastgelegde stopmoment.</label><label><input name="confirmed" type="checkbox" required/>Ik keur precies deze doelsaldi en verschillen goed voor een eenmalige boeking.</label></>}
 <button className="secondary">{op==='execute'?'Goedgekeurde verschillen eenmaal boeken':'Overzicht annuleren'}</button></form>)}</section>}
 </>}
 </div></AppShell>;
}
