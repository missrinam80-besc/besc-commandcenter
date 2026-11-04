import Link from "next/link";
import { randomUUID } from "node:crypto";
import { AppShell } from "@/components/app-shell";
import { requireActiveMembership } from "@/lib/auth-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { canReadMcpCommandCenter } from "@/lib/commandcenter-mcp-store";
import { AGENT_COMBINED_SCOPE } from "@/lib/commandcenter-mcp-oauth";
import { createAgentJob, reviewAgentResult, dispatchAgentJob, manageAgentWorkflow } from "./actions";
import {agentCatalog,agentKeys,configuredAgent,dispatchFeedback,type DispatchErrorCode} from '@/lib/agent-workflows';
import { technicalChannelConfig } from "@/lib/commandcenter-agent-trigger";

export const dynamic="force-dynamic";
type Result={payload:{summary:string;kind:string;findings:{statement:string;classification:string}[]}};
type Job={id:string;request:string;created_at:string;source_entity:string;source_id:string;source_version:string;
  expires_at:string;source_snapshot:{title?:string;selectedSections?:string[];selectedContext?:Record<string,unknown>};
  agent_key?:keyof typeof agentCatalog;input_version?:number;dispatch_attempts?:number;max_attempts?:number;budget_credits?:number|null;actual_credits?:number|null;
  cancelled_at?:string|null;last_dispatch_error?:DispatchErrorCode|null;provider_status?:string|null;provider_run_id?:string|null;provider_status_checked_at?:string|null;
  created_by:string;dispatch_state:string;dispatch_lease_until:string|null;conversation_url:string|null;result_received_at:string|null;review:string;agent_results:Result|Result[]|null};
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}) {
  const renderedAt=new Date().getTime();
  const q=await searchParams;
  const {user,membership}=await requireActiveMembership();
  const enabled=process.env.COMMANDCENTER_AGENT_RESULTS_ENABLED==="true";
  const ready=process.env.COMMANDCENTER_MCP_DATA_STATE==="ready";
  const expanded=process.env.BESC_AGENT_WORKFLOWS_ENABLED==='true';
  const availableAgents=agentKeys.filter(key=>configuredAgent(key,process.env));
  const channelReady=expanded?availableAgents.length>0:Boolean(technicalChannelConfig(process.env));
  const manager=await canReadMcpCommandCenter(user.id,membership.organization_id);
  const base=<><h1>BESC-agentopdrachten</h1><p>Opdrachten en antwoorden van je bestaande agents. {expanded?'De bestaande BESC-agents; iedere uitvoering blijft een afzonderlijke opdracht.':'Eerste proef: BESC Technical Agent v1.'}</p><Link href="/app/ai-hub">Terug naar AI Hub</Link></>;
  if(!enabled || !manager)return <AppShell active="AI Hub"><div className="module-body">{base}<p>{!manager?"Alleen actieve beheerders en bestuursleden hebben toegang.":"De tweewegkoppeling is nog niet geactiveerd."}</p></div></AppShell>;
  const admin=createAdminClient();
  const entity=q.entity==="events"?"events":"projects";
  const choices=ready?await admin.from(entity).select("id,title").eq("organization_id",membership.organization_id).is("deleted_at",null).order("title").limit(100):null;
  let jobQuery=admin.from("agent_jobs").select("id,request,created_at,created_by,expires_at,source_snapshot,source_entity,source_id,source_version,dispatch_state,dispatch_lease_until,conversation_url,result_received_at,review,agent_results(payload)"+(expanded?",agent_key,input_version,dispatch_attempts,max_attempts,budget_credits,actual_credits,cancelled_at,last_dispatch_error,provider_status,provider_run_id,provider_status_checked_at":"")).eq("organization_id",membership.organization_id);
  if(/^[0-9a-f-]{36}$/i.test(q.job??''))jobQuery=jobQuery.eq('id',q.job!);
  const [jobs,grants]=await Promise.all([
    jobQuery.order("created_at",{ascending:false}).limit(30),
    admin.from("commandcenter_mcp_oauth_grants").select("id,created_at").eq("user_id",user.id).eq("organization_id",membership.organization_id).eq("scope",AGENT_COMBINED_SCOPE).is("revoked_at",null).gt("expires_at",new Date().toISOString()).limit(30),
  ]);
  const {data:caps}=expanded?await (await import('@/lib/supabase/server')).createClient().then(db=>db.rpc('f1_capabilities',{p_organization_id:membership.organization_id})):{data:null};
  const chair=Boolean(caps?.chair);
  const controls=expanded?await admin.from('agent_execution_controls').select('paused').eq('organization_id',membership.organization_id).maybeSingle():null;
  const paused=expanded&&(controls?.error||controls?.data?.paused!==false);
  type Source={id:string;title:string;updated_at:string;description?:string;start_at?:string;end_at?:string;location?:string;is_online?:boolean;start_date?:string;due_date?:string};
  let source:Source|null=null;
  if(ready && /^[0-9a-f-]{36}$/i.test(q.source??"")){
    const {data,error}=await admin.from(entity).select(expanded?entity==='events'?'id,title,updated_at,description,start_at,end_at,location,is_online':'id,title,updated_at,description,start_date,due_date':'id,title,updated_at').eq("organization_id",membership.organization_id).eq("id",q.source!).is("deleted_at",null).maybeSingle();
    if(!error)source=data as unknown as Source;
  }
  const rows=(jobs.data??[]) as unknown as Job[];
  const sections=[...(q.description==='1'?['description']:[]),...(q.schedule==='1'?['schedule']:[])];
  const focused=q.job&&/^[0-9a-f-]{36}$/i.test(q.job)?rows.find(j=>j.id===q.job):null;
  const visible=focused?[focused]:rows;
  return <AppShell active="AI Hub"><div className="module-body agent-workflows">{base}
    <p>{expanded?'Je kiest per opdracht welke dossieronderdelen meegaan. Bestuurs-, persoons- en financiële registraties worden niet automatisch opgehaald. Controleer geselecteerde tekst zelf op gevoelige gegevens.':'We delen uitsluitend de titel, status en versie van het geselecteerde dossier. Inhoud en documenten ontbreken.'} Resultaten zijn voorstellen; accepteren wijzigt geen dossier.</p>
    {q.melding&&<p role="alert" className="error-note">{q.melding.slice(0,500)}</p>}
    {expanded&&<section className="panel"><h2>Uitvoering en kosten</h2><p>{paused?'Nieuwe verzendingen zijn gepauzeerd.':'Handmatige verzending is beschikbaar na jouw akkoord per opdracht.'}</p><p>Maximale toewijzing: 5 credits per opdracht. Het werkelijke verbruik is niet via de API beschikbaar; CC kan geen hard providerplafond afdwingen. Controleer de externe kostenlimiet en registreer het werkelijke verbruik achteraf. Een overschrijding pauzeert nieuwe verzendingen.</p>
      {chair&&<form action={manageAgentWorkflow}><input type="hidden" name="operation" value={paused?'resume':'pause'}/>{paused&&<label><input type="checkbox" name="confirmed" required/> Ik heb de externe kostenlimiet gecontroleerd en wil handmatige verzending beschikbaar maken.</label>}<button className="secondary" type="submit">{paused?'Handmatige verzending beschikbaar maken':'Nieuwe verzendingen pauzeren'}</button></form>}
      <details><summary>Bestaande agents en kanaalconfiguratie</summary><ul>{agentKeys.map(k=><li key={k}>{agentCatalog[k]}: {availableAgents.includes(k)?'geconfigureerd; actuele toegang apart verifiëren':'nog niet geconfigureerd; er wordt geen vervangende agent aangemaakt'}</li>)}</ul></details>
    </section>}
    {(jobs.error || grants.error) && <p role="alert">De opslag kon niet worden gelezen. Controleer de database-inrichting.</p>}
    {q.fout && <p role="alert">De actie is geweigerd. Controleer toegang, bronversie en ingevulde velden; probeer bij bronwijziging met een nieuwe opdracht.</p>}
    {q.succes && <p role="status">{q.succes==='hergebruikt'?'Dezelfde actuele opdracht bestaat al en is hergebruikt. Er is niets dubbel aangemaakt.':q.succes==='beheer'?'De beheerhandeling is opgeslagen. Er is geen dossier gewijzigd.':q.succes==="opdracht"?"Opdracht opgeslagen. Zij is nog niet naar de agent verstuurd.":q.succes==="verzonden"?"De agentdienst heeft de opdracht ontvangen. Het inhoudelijke resultaat wordt afzonderlijk teruggeschreven.":"Review opgeslagen. Het dossier is niet gewijzigd."}</p>}
    {!channelReady && <p>Het API-kanaal van de bestaande Technical Agent is nog niet aangesloten. Opdrachten kunnen worden voorbereid; verzenden blijft uitgeschakeld.</p>}
    {!ready && <p role="alert">Dossiercontext en nieuwe opdrachten blijven geblokkeerd zolang de gegevens niet zijn vrijgegeven.</p>}
    {!grants.data?.length && <p>Er is nog geen verbinding met toestemming voor resultaatopslag. <Link href="/mcp/commandcenter/authorize">Bekijk je verbindingen</Link>. Verbind opnieuw vanuit ChatGPT met de aanvullende toestemming.</p>}
    {ready && !jobs.error && !grants.error && <section className="panel"><h2>Nieuwe opdracht voorbereiden</h2>
      <form method="get"><label>Dossiertype<select name="entity" defaultValue={entity}><option value="projects">Project</option><option value="events">Event</option></select></label><button type="submit">Dossiers tonen</button></form>
      {choices?.error?<p role="alert">De dossiers konden niet worden geladen.</p>:<form method="get"><input type="hidden" name="entity" value={entity}/><label>Dossier<select name="source" defaultValue={q.source??""} required><option value="">Kies een dossier</option>{choices?.data?.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select></label><button type="submit">Bron controleren</button></form>}
      {choices?.data?.length===100 && <p>De eerste 100 dossiers worden getoond.</p>}
      {source&&expanded&&<form method="get" className="agent-context"><input type="hidden" name="entity" value={entity}/><input type="hidden" name="source" value={source.id}/><h3>Context selecteren en bekijken</h3><label><input name="description" value="1" type="checkbox" defaultChecked={sections.includes('description')}/> Beschrijving (maximaal eerste 6000 tekens)</label><label><input name="schedule" value="1" type="checkbox" defaultChecked={sections.includes('schedule')}/> Planning en locatie</label><button type="submit" className="secondary">Geselecteerde context bekijken</button><div className="agent-preview">{!sections.length?<p>Alleen titel, status en bronversie worden gedeeld.</p>:<>{sections.includes('description')&&<><strong>Beschrijving</strong><p>{source.description?.slice(0,6000)||'Geen beschrijving ingevuld.'}</p></>}{sections.includes('schedule')&&<><strong>Planning en locatie</strong><p>{entity==='events'?`${source.start_at??'Begintijd onbekend'} – ${source.end_at??'Eindtijd onbekend'} · ${source.location??'Locatie onbekend'}${source.is_online?' · Online':''}`:`${source.start_date??'Startdatum onbekend'} – ${source.due_date??'Einddatum onbekend'}`}</p></>}</>}</div></form>}
      {source && grants.data?.length ? <form action={createAgentJob}>
        <p>Geselecteerd: {source.title} · bronversie {source.updated_at}</p>
        <input type="hidden" name="source_entity" value={entity}/><input type="hidden" name="source_id" value={source.id}/><input type="hidden" name="source_version" value={source.updated_at}/><input type="hidden" name="idempotency_key" value={randomUUID()}/>
        <label>Verbinding<select name="grant_id">{grants.data.map(g=><option key={g.id} value={g.id}>{new Date(g.created_at).toLocaleString("nl-BE")}</option>)}</select></label>
        {expanded&&<><label>Bestaande agent<select name="agent_key" required><option value="">Kies een geconfigureerde agent</option>{availableAgents.map(k=><option key={k} value={k}>{agentCatalog[k]}</option>)}</select></label>{sections.map(s=><input key={s} type="hidden" name="context_sections" value={s}/>)}<label>Geselecteerd documentfragment (optioneel, maximaal 6000 tekens)<textarea name="context_excerpt" maxLength={6000}/></label><label>Bronverwijzing van het fragment<input name="context_reference" maxLength={300} placeholder="Documenttitel en versie; geen geheime link"/></label><label><input type="checkbox" name="context_confirmed" required={sections.length>0}/> Ik heb de geselecteerde context gecontroleerd en wil deze met de agent delen. Ik voeg geen onnodige gevoelige gegevens of geheime links toe.</label></>}
        <label>Opdracht<textarea name="request" minLength={5} maxLength={4000} required placeholder="Welke technische controle wil je laten uitvoeren?"/></label><button type="submit">Opdracht opslaan</button>
      </form>:q.source?<p>Geen beschikbare bron of schrijftoestemming. Er is niets aangemaakt.</p>:null}
    </section>}
    <h2>Opdrachten en ontvangen resultaten</h2>
    {!jobs.error && !rows.length && <p>Nog geen opdrachten.</p>}
    {focused&&<p><Link href="/app/ai-hub/agents">Alle opdrachten tonen</Link></p>}
    {visible.map(j=>{
      const title=j.source_snapshot?.title??'Dossier';
      const expired=Date.parse(j.expires_at)<=renderedAt;
      const result=Array.isArray(j.agent_results)?j.agent_results[0]:j.agent_results;
      const needsBudget=expanded&&!j.budget_credits&&!j.result_received_at&&!j.cancelled_at&&!expired;
      const available=expanded?Boolean(configuredAgent(j.agent_key??'technical',process.env)):channelReady;
      return <section className="panel agent-job" key={j.id} id={'job-'+j.id}>
      <h3>{title} · {agentCatalog[j.agent_key??'technical']}</h3>
      <p><strong>Opdracht {j.id.slice(0,8)}</strong> · {new Date(j.created_at).toLocaleString('nl-BE',{timeZone:'Europe/Brussels'})} · {j.source_entity==='events'?'Event':'Project'}</p>
      <p>{j.result_received_at?'Resultaat ontvangen':j.cancelled_at?'Ingetrokken':expired?'Opdracht verlopen':'Wacht op resultaat'} · Beoordeling: {({pending:'Nog te beoordelen',accepted:'Geaccepteerd',rejected:'Afgewezen'} as Record<string,string>)[j.review]}</p>
      <details><summary>Opdrachttekst en gedeelde brongegevens</summary><p className="agent-request">{j.request}</p><p>Volledig opdrachtnummer: <code>{j.id}</code></p><p>Bronversie: {j.source_version} · Geldig tot: {new Date(j.expires_at).toLocaleString('nl-BE',{timeZone:'Europe/Brussels'})}</p><pre className="agent-preview">{JSON.stringify(j.source_snapshot,null,2)}</pre></details>
      <p>{({prepared:'Nog niet verstuurd',dispatching:'Verzending wordt gecontroleerd',accepted:'Ontvangen door agentdienst',unknown:'Geen ontvangstbevestiging vastgelegd; bekijk de foutmelding en het bestaande agentgesprek'} as Record<string,string>)[j.dispatch_state]}</p>
      {j.last_dispatch_error&&<p role="alert">{dispatchFeedback[j.last_dispatch_error]}</p>}
      {j.conversation_url&&/^https:\/\/chatgpt\.com\/c\/[A-Za-z0-9_-]+$/.test(j.conversation_url)&&<p><a href={j.conversation_url} target="_blank" rel="noopener noreferrer">Open bestaand agentgesprek</a></p>}
      {expanded&&<><p>Pogingen: {j.dispatch_attempts??0} / {j.max_attempts??1} · Toewijzing: {j.budget_credits??'nog niet goedgekeurd'} credits · Werkelijk verbruik: {j.actual_credits??'onbekend'}</p>
        {j.provider_status&&<p>Agentstatus: {({queued:'In wachtrij',in_progress:'Bezig',suspended:'Wacht op een handeling of tool',completed:'Agent klaar; CC-resultaat afzonderlijk controleren',failed:'Agentuitvoering mislukt'} as Record<string,string>)[j.provider_status]} · gecontroleerd {j.provider_status_checked_at&&new Date(j.provider_status_checked_at).toLocaleString('nl-BE',{timeZone:'Europe/Brussels'})}</p>}
        {j.provider_run_id&&j.created_by===user.id&&!expired&&<form action={manageAgentWorkflow}><input type="hidden" name="operation" value="status"/><input type="hidden" name="job_id" value={j.id}/><button className="secondary">Agentstatus lezen (geen nieuwe verzending)</button></form>}
        {chair&&!j.result_received_at&&!j.cancelled_at&&!expired&&j.dispatch_state!=='accepted'&&j.dispatch_state!=='dispatching'&&<details><summary>{needsBudget?'Kosten en pogingen goedkeuren':'Goedkeuring en pogingen bijstellen'}</summary><form action={manageAgentWorkflow}><input type="hidden" name="operation" value="budget"/><input type="hidden" name="job_id" value={j.id}/><p>Maximaal 5 credits toegewezen. Het providerverbruik wordt hiermee niet automatisch begrensd.</p><label>Controle externe kostenlimiet (datum en verwijzing; geen geheimen)<input name="provider_limit_reference" minLength={5} maxLength={300} required/></label><label>Maximaal verzendpogingen voor dezelfde opdracht<select name="max_attempts" defaultValue="1"><option>1</option><option>2</option><option>3</option></select></label><label><input name="confirmed" type="checkbox" required/> Ik keur deze inzet goed en heb de externe kostenlimiet gecontroleerd.</label><button className="secondary">Goedkeuring vastleggen</button></form></details>}
      </>}
      {available&&ready&&j.created_by===user.id&&!j.result_received_at&&!j.cancelled_at&&!expired&&j.dispatch_state!=='accepted'&&(j.dispatch_state!=='dispatching'||!j.dispatch_lease_until||Date.parse(j.dispatch_lease_until)<=renderedAt)&&(!expanded||(!paused&&Boolean(j.budget_credits)&&(j.dispatch_attempts??0)<(j.max_attempts??1)))&&<form action={dispatchAgentJob}><input type="hidden" name="job_id" value={j.id}/><p>Deze agentuitvoering kan betaalde credits verbruiken. Bij onzekerheid gebruik je deze bestaande opdracht, niet een nieuwe opdracht.</p><button className="primary" type="submit">{j.dispatch_state==='prepared'?'Deze opdracht naar agent sturen':'Dezelfde verzending opnieuw aanbieden'}</button></form>}
      {expanded&&j.created_by===user.id&&!j.result_received_at&&!j.cancelled_at&&<details><summary>Opdracht intrekken</summary><p>Dit blokkeert nieuwe verzendingen en resultaatopslag in CC. Het stopt geen al lopende agentuitvoering bij ChatGPT; beëindig die zo nodig ook daar.</p><form action={manageAgentWorkflow}><input type="hidden" name="operation" value="cancel"/><input type="hidden" name="job_id" value={j.id}/><button className="secondary">Deze opdracht in CC intrekken</button></form></details>}
      {result&&<div><h4>Ontvangen voorstel</h4><p>{result.payload.summary}</p><ol>{result.payload.findings.map((f,i)=><li key={i}>{({confirmed:'Bevestigd door agent',uncertain:'Onzeker',proposal:'Voorstel'} as Record<string,string>)[f.classification]}: {f.statement}</li>)}</ol></div>}
      {j.result_received_at&&j.review==='pending'&&(!expanded||chair)&&<form action={reviewAgentResult}><input type="hidden" name="job_id" value={j.id}/><button className="primary" name="review" value="accepted">Resultaat accepteren</button><button className="secondary" name="review" value="rejected">Resultaat afwijzen</button></form>}
      {expanded&&chair&&j.budget_credits&&<details><summary>Werkelijke kosten registreren</summary><p>Neem uitsluitend het gecontroleerde verbruik uit ChatGPT over. Onbekend blijft onbekend. Boven 5 credits worden nieuwe verzendingen gepauzeerd.</p><form action={manageAgentWorkflow}><input type="hidden" name="operation" value="cost"/><input type="hidden" name="job_id" value={j.id}/><label>Werkelijk verbruik in credits<input name="actual_credits" type="number" min="0" max="99999999" step="0.01" required/></label><button className="secondary">Kosten vastleggen</button></form></details>}
      {expanded&&result&&j.review==='accepted'&&<p><Link href={'/app/ai-hub/agents/'+j.id+'/overdracht'}>Conceptdocument en handmatige overdracht voorbereiden</Link></p>}
    </section>})}
  </div></AppShell>;
}
