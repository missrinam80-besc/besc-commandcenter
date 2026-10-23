import Link from 'next/link';
import {randomUUID} from 'node:crypto';
import {AppShell} from '@/components/app-shell';
import {requireActiveMembership} from '@/lib/auth-context';
import {formatDateTime} from '@/lib/format';
import {runF2,uploadF2Media} from './actions';
import '../werkstromen/workflows.css';
type Row=Record<string,unknown>;
const rows=(v:unknown)=>Array.isArray(v)?v as Row[]:[];
const s=(r:Row,k:string)=>String(r[k]??'');
function Form({title,op,org,hidden={},children,button='Opslaan'}:{title:string;op:string;org:string;hidden?:Record<string,string>;children?:React.ReactNode;button?:string}){return <details className="f1-form"><summary>{title}</summary><form action={runF2}><input type="hidden" name="organization_id" value={org}/><input type="hidden" name="request_id" value={randomUUID()}/><input type="hidden" name="operation" value={op}/>{Object.entries(hidden).map(([k,v])=><input key={k} type="hidden" name={'data_'+k} value={v}/>)}{children}<button>{button}</button></form></details>;}
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 const query=await searchParams,{supabase:db,membership}=await requireActiveMembership(),org=membership.organization_id;
 const {data:caps}=await db.rpc('f1_capabilities',{p_organization_id:org});
 const enabled=process.env.BESC_PUBLICATION_STAGING_ENABLED==='true';
 const results=await Promise.all(['publication_sites','publication_entries','publication_site_viewers','publication_media','publication_revisions'].map(t=>db.from(t).select('*').eq('organization_id',org).limit(100)));
 const [sites,entries,viewers,media,revisions]=results.map(r=>rows(r.data));
 const {data:members}=await db.from('organization_members').select('user_id,role,profiles(display_name)').eq('organization_id',org).eq('status','active').limit(100);
 const {data:documents}=await db.from('document_registry').select('id,label').eq('organization_id',org).is('media_rights_revoked_at',null).limit(100);
 const reviewer=caps?.publication_reviewer===true,editor=caps?.publication_editor===true,chair=caps?.chair===true;
 const name=(id:unknown)=>{const m=rows(members).find(m=>m.user_id===id);const p=m?.profiles;return String((Array.isArray(p)?p[0]:p)?.display_name??'Bestaand account');};
 return <AppShell active="VZW-administratie"><header className="topbar module-top"><div><p>AFGESCHERMDE WEBSITE · DEV</p><h1>Websitepublicatie</h1></div></header><div className="module-body f1-workspace">
 <nav>{process.env.BESC_VACANCY_PLATFORM_ENABLED==='true'&&<Link href="/app/administratie/vacatures">Vacatures beheren</Link>}{process.env.BESC_PARTNER_PLATFORM_ENABLED==='true'&&<Link href="/app/administratie/partners-publicatie">Partnerpublicatie beheren</Link>}{process.env.BESC_PLATFORM_INTAKE_ENABLED==='true'&&<Link href="/app/administratie/aanvragen">Private aanvragen beheren</Link>}{process.env.BESC_CREATOR_PLATFORM_ENABLED==='true'&&<Link href="/app/administratie/platform">Creatorprofielen beheren</Link>}<Link href="/app/administratie/werkstromen#publicatie">Concepten en beoordeling</Link><a href="https://website-dev.belgianstreamerscommunity.be" target="_blank" rel="noopener noreferrer">Stagingwebsite</a></nav>
 <p>Alleen exact goedgekeurde versies worden hier bewust vrijgegeven. De bestaande publieke website blijft staan.</p>
 {query.succes&&<p role="status">De handeling is opgeslagen. Hieronder staan de actuele gegevens.</p>}{query.melding&&<p role="alert">{query.melding}</p>}
 {!enabled&&<p role="status">Websitebediening staat nog uit. Vrijgeven wordt pas mogelijk na de gecontroleerde DEV-inrichting.</p>}
 {results.some(r=>r.error)&&<p role="alert">De websitegegevens konden niet volledig worden geladen. Er wordt geen geslaagde inrichting verondersteld.</p>}
 {!(chair||editor||reviewer)&&<p>Je hebt geen actuele taakrol voor websitebeheer.</p>}
 {enabled&&chair&&<section><h2>Staging en testtoegang</h2>
 {!sites.length&&<Form title="Afgeschermde stagingsite registreren" op="site.create" org={org} hidden={{host:'website-dev.belgianstreamerscommunity.be'}}><p>De site begint uitgeschakeld, zonder testers. De afzonderlijke serversleutel wordt vanuit de beveiligde configuratie gebonden.</p></Form>}
 {sites.map(site=><article key={s(site,'id')}><h3>{s(site,'host')}</h3><p>{site.active?'Actief voor toegelaten testers':'Uitgeschakeld'}</p>
 <Form title={site.active?'Stagingtoegang sluiten':'Stagingtoegang openen'} op="site.state" org={org} hidden={{site_id:s(site,'id'),active:String(!site.active)}}/>
 <Form title="Geconfigureerde serversleutel opnieuw binden" op="site.key" org={org} hidden={{site_id:s(site,'id')}}/>
 <Form title="Aangewezen crew of vrijwilliger toelaten" op="viewer.add" org={org} hidden={{site_id:s(site,'id')}}>
 <label>Bestaand actief account<select name="data_user_id" required><option value="">Maak een keuze</option>{rows(members).map(m=><option key={s(m,'user_id')} value={s(m,'user_id')}>{name(m.user_id)}</option>)}</select></label>
 <label>Bevestigde testgroep<select name="data_eligibility" required><option value="crew">Crew</option><option value="volunteer">Vrijwilliger</option></select></label>
 <label>Onderbouwing van de aanwijzing<textarea name="data_basis" required minLength={2} maxLength={2000}/></label>
 <label>Toegang eindigt (Belgische tijd, maximaal 90 dagen)<input type="datetime-local" name="data_valid_until" required/></label></Form>
 {viewers.filter(v=>v.site_id===site.id&&!v.revoked_at).map(v=><div key={s(v,'id')}><p>{name(v.user_id)} · tot {formatDateTime(s(v,'valid_until'))}</p><Form title="Testtoegang beëindigen" op="viewer.withdraw" org={org} hidden={{id:s(v,'id')}}><label>Reden<textarea name="data_reason" required minLength={2}/></label></Form></div>)}
 </article>)}</section>}
 {enabled&&(editor||reviewer)&&<section><h2>Websiteversies</h2>{revisions.filter(r=>r.status==='approved_for_publication').map(r=>{const p=r.payload as Row;return <article key={s(r,'id')}><h3>{s(p,'title')} · revisie {s(r,'revision')}</h3><p>De beoordeling is gebonden aan deze exacte snapshot. Nieuwe concepten worden niet automatisch vrijgegeven.</p>
 {reviewer&&sites.filter(site=>site.active).map(site=>{const entry=entries.find(e=>e.site_id===site.id&&e.source_type===r.source_type&&e.source_id===r.source_id&&e.locale===p.locale);return <Form key={s(site,'id')} title={`Deze versie op ${site.host} vrijgeven`} op="release" org={org} hidden={{site_id:s(site,'id'),revision_id:s(r,'id'),expected_hash:s(r,'payload_sha256'),expected_epoch:entry?s(entry,'epoch'):'0'}}><label>Begin (Belgische tijd; leeg = nu)<input name="data_published_at" type="datetime-local"/></label><label>Einde (optioneel)<input name="data_valid_until" type="datetime-local"/></label><label>Reden van vrijgave<textarea name="data_reason" required minLength={2}/></label></Form>;})}</article>;})}
 {entries.map(e=><article key={s(e,'public_id')}><h3>{s(e,'slug')}</h3><p>{e.withdrawn_at?'Ingetrokken':`Vrijgave vanaf ${formatDateTime(s(e,'published_at'))}`} · versie {s(e,'epoch')}</p>{!e.withdrawn_at&&<Form title="Websitevrijgave intrekken" op="withdraw" org={org} hidden={{entry_id:s(e,'public_id'),expected_epoch:s(e,'epoch')}}><label>Reden<textarea name="data_reason" required minLength={2}/></label></Form>}</article>)}</section>}
 {enabled&&(editor||reviewer)&&<section><h2>Beheerde websiteafbeeldingen</h2><p>Afbeeldingen blijven afgeschermd en worden alleen bij een geldige vrijgave getoond.</p><form action={uploadF2Media}><input type="hidden" name="organization_id" value={org}/><label>Site<select name="site_id" required>{sites.map(v=><option key={s(v,'id')} value={s(v,'id')}>{s(v,'host')}</option>)}</select></label><label>Bewijs van mediarechten<select name="document_id" required><option value="">Maak een keuze</option>{rows(documents).map(v=><option key={s(v,'id')} value={s(v,'id')}>{s(v,'label')}</option>)}</select></label><label>PNG of WebP, maximaal 2 MB<input type="file" name="media" accept="image/png,image/webp" required/></label><label><input type="checkbox" name="rights_confirmed" required/>Ik heb het rechtenbewijs en deze afbeelding gecontroleerd.</label><button>Afbeelding veilig voorbereiden</button></form>
 {media.map(m=><article key={s(m,'public_media_id')}><p>Medialink voor de publicatierevisie: <code>{`https://website-dev.belgianstreamerscommunity.be/media/${m.public_media_id}`}</code></p><p>{m.revoked_at?'Ingetrokken':'Geregistreerd; nog geen websitevrijgave'}</p>{!m.revoked_at&&<Form title="Afbeelding intrekken" op="media.withdraw" org={org} hidden={{public_media_id:s(m,'public_media_id')}}><label>Reden<textarea name="data_reason" required minLength={2}/></label></Form>}</article>)}</section>}
 </div></AppShell>;
}
