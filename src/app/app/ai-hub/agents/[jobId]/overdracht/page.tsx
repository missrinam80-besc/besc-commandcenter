import Link from 'next/link';
import {AppShell} from '@/components/app-shell';
import {loadAgentDocument} from '@/lib/agent-document-store';
import {CONCEPT_DRIVE_FOLDER} from '@/lib/agent-document';
import {createAdminClient} from '@/lib/supabase/admin';
import {recordAgentHandoff} from './actions';

export const dynamic='force-dynamic';
export default async function Page({params,searchParams}:{params:Promise<{jobId:string}>;searchParams:Promise<Record<string,string|undefined>>}){
  const {jobId}=await params,q=await searchParams;
  let context:Awaited<ReturnType<typeof loadAgentDocument>>|null=null;
  try{context=await loadAgentDocument(jobId);}catch{/* Fail closed without exposing the underlying store. */}
  if(!context)return <AppShell active="AI Hub"><div className="module-body"><h1>Overdracht niet beschikbaar</h1><p>Controleer je toegang en of het eigen agentresultaat is geaccepteerd.</p><Link href="/app/ai-hub/agents">Terug naar opdrachten</Link></div></AppShell>;
  const {job,artifact,membership,stale}=context;
  const {data:handoffs,error}=await createAdminClient().from('agent_document_handoffs').select('id,kind,reference,period,evidence_layer,created_at').eq('organization_id',membership.organization_id).eq('job_id',jobId).order('created_at',{ascending:false}).limit(50);
  return <AppShell active="AI Hub"><div className="module-body agent-workflows">
    <h1>Conceptdocument en overdracht</h1><p>{job.source_snapshot.title} · Opdracht {job.id.slice(0,8)}</p><Link href={'/app/ai-hub/agents?job='+jobId}>Terug naar dit voorstel</Link>
    {q.fout&&<p role="alert">De overdracht is niet bevestigd. Controleer de actuele bron, documentlink en ingevulde velden.</p>}
    {q.succes&&<p role="status">De handmatige overdracht is geregistreerd. Er is niets automatisch naar Google of Assist Online verstuurd.</p>}
    {stale&&<p role="alert">Het brondossier is gewijzigd of niet meer beschikbaar. Download en nieuwe overdracht blijven geblokkeerd totdat de actuele gegevens zijn beoordeeld.</p>}
    <section className="panel"><h2>Conceptdocument voor Google Docs</h2><p>Het document bevat het geaccepteerde voorstel en de bronversie. Het blijft een concept; CC blijft de bron voor het dossier en de beoordeling.</p>
      {!stale&&<p><a className="primary" href={'/app/ai-hub/agents/'+jobId+'/document'}>Conceptdocument downloaden</a></p>}
      <p>Open de <a href={CONCEPT_DRIVE_FOLDER} target="_blank" rel="noopener noreferrer">afgesproken Drive-map</a>. Importeer het DOCX-bestand als Google-document en controleer titel, inhoud, map en bestaande deelrechten. De maptoegang en import zijn niet automatisch geverifieerd.</p>
      <details><summary>Bron en bestandscontrole</summary><p>Bronversie: {job.source_version}</p><p>Bestandskenmerk: <code>{artifact.sha256}</code></p></details>
      {!stale&&<form action={recordAgentHandoff}><input type="hidden" name="job_id" value={jobId}/><input type="hidden" name="sha256" value={artifact.sha256}/><input type="hidden" name="kind" value="google_document"/><label>Gecontroleerde Google-documentlink<input type="url" name="reference" placeholder="https://docs.google.com/document/d/.../edit" required maxLength={500}/></label><input type="hidden" name="period" value=""/><label><input name="confirmed" type="checkbox" required/> Ik heb het document, de doelmap en de bestaande deelrechten zelf gecontroleerd.</label><button className="secondary">Documentlink registreren</button></form>}
    </section>
    <section className="panel"><h2>Handmatige overdracht aan Assist Online</h2><p>Assist Online blijft de boekhoudkundige bron. Dit agentvoorstel is geen boeking of afrekening. Controleer eerst de originele financiële stukken, periode, volledigheid en bedragen in de bestaande administratie. Draag die daarna via de bestaande handmatige werkwijze over en controleer de ontvangst daar.</p><p>Hier registreer je uitsluitend een overdrachtsreferentie. CC maakt geen boekingen, bedragen of tweede boekhouding aan.</p>
      {!stale&&<form action={recordAgentHandoff}><input type="hidden" name="job_id" value={jobId}/><input type="hidden" name="sha256" value={artifact.sha256}/><input type="hidden" name="kind" value="assist_manual"/><label>Periode<input name="period" minLength={3} maxLength={80} required/></label><label>Ontvangstbevestiging en bronverwijzing (geen persoonsgegevens of bedragen)<input name="reference" minLength={5} maxLength={500} required/></label><label><input name="confirmed" type="checkbox" required/> Ik heb de originele stukken en de ontvangst handmatig gecontroleerd. Dit is geen bewijs dat de boekhouding of afrekening volledig is.</label><button className="secondary">Handmatige ontvangst registreren</button></form>}
    </section>
    <section className="panel"><h2>Geregistreerde overdrachten</h2>{error?<p role="alert">Overdrachtsregistraties konden niet worden gelezen.</p>:!handoffs?.length?<p>Nog geen overdrachten geregistreerd.</p>:<ul>{handoffs.map(h=><li key={h.id}>{h.kind==='google_document'?'Google-document':'Assist Online handmatig'} · {h.reference} {h.period&&`· ${h.period}`} · door gebruiker bevestigd, niet door een connector gecontroleerd</li>)}</ul>}</section>
  </div></AppShell>;
}
