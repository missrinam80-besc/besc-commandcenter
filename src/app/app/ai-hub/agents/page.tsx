import Link from "next/link";
import { randomUUID } from "node:crypto";
import { AppShell } from "@/components/app-shell";
import { requireActiveMembership } from "@/lib/auth-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { canReadMcpCommandCenter } from "@/lib/commandcenter-mcp-store";
import { AGENT_COMBINED_SCOPE } from "@/lib/commandcenter-mcp-oauth";
import { createAgentJob, reviewAgentResult, dispatchAgentJob } from "./actions";
import { technicalChannelConfig } from "@/lib/commandcenter-agent-trigger";

export const dynamic="force-dynamic";
type Result={payload:{summary:string;kind:string;findings:{statement:string;classification:string}[]}};
type Job={id:string;request:string;created_at:string;source_entity:string;source_id:string;source_version:string;
  created_by:string;dispatch_state:string;conversation_url:string|null;result_received_at:string|null;review:string;agent_results:Result|Result[]|null};
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}) {
  const q=await searchParams;
  const {user,membership}=await requireActiveMembership();
  const enabled=process.env.COMMANDCENTER_AGENT_RESULTS_ENABLED==="true";
  const ready=process.env.COMMANDCENTER_MCP_DATA_STATE==="ready";
  const channelReady=Boolean(technicalChannelConfig(process.env));
  const manager=await canReadMcpCommandCenter(user.id,membership.organization_id);
  const base=<><h1>BESC-agentopdrachten</h1><p>Opdrachten en antwoorden van je bestaande agents. Eerste proef: BESC Technical Agent v1.</p><Link href="/app/ai-hub">Terug naar AI Hub</Link></>;
  if(!enabled || !manager)return <AppShell active="AI Hub"><div className="module-body">{base}<p>{!manager?"Alleen actieve beheerders en bestuursleden hebben toegang.":"De tweewegkoppeling is nog niet geactiveerd."}</p></div></AppShell>;
  const admin=createAdminClient();
  const entity=q.entity==="events"?"events":"projects";
  const choices=ready?await admin.from(entity).select("id,title").eq("organization_id",membership.organization_id).is("deleted_at",null).order("title").limit(100):null;
  const [jobs,grants]=await Promise.all([
    admin.from("agent_jobs").select("id,request,created_at,created_by,source_entity,source_id,source_version,dispatch_state,conversation_url,result_received_at,review,agent_results(payload)").eq("organization_id",membership.organization_id).order("created_at",{ascending:false}).limit(30),
    admin.from("commandcenter_mcp_oauth_grants").select("id,created_at").eq("user_id",user.id).eq("organization_id",membership.organization_id).eq("scope",AGENT_COMBINED_SCOPE).is("revoked_at",null).gt("expires_at",new Date().toISOString()).limit(30),
  ]);
  let source:{id:string;title:string;updated_at:string}|null=null;
  if(ready && /^[0-9a-f-]{36}$/i.test(q.source??"")){
    const {data,error}=await admin.from(entity).select("id,title,updated_at").eq("organization_id",membership.organization_id).eq("id",q.source!).is("deleted_at",null).maybeSingle();
    if(!error)source=data;
  }
  const rows=(jobs.data??[]) as unknown as Job[];
  return <AppShell active="AI Hub"><div className="module-body">{base}
    <p>We delen uitsluitend de titel, status en versie van het geselecteerde dossier. Inhoud en documenten ontbreken. Resultaten zijn voorstellen; accepteren wijzigt geen dossier.</p>
    {(jobs.error || grants.error) && <p role="alert">De opslag kon niet worden gelezen. Controleer de database-inrichting.</p>}
    {q.fout && <p role="alert">De actie is geweigerd. Controleer toegang, bronversie en ingevulde velden; probeer bij bronwijziging met een nieuwe opdracht.</p>}
    {q.succes && <p role="status">{q.succes==="opdracht"?"Opdracht opgeslagen. Zij is nog niet naar de agent verstuurd.":q.succes==="verzonden"?"De agentdienst heeft de opdracht ontvangen. Het inhoudelijke resultaat wordt afzonderlijk teruggeschreven.":"Review opgeslagen. Het dossier is niet gewijzigd."}</p>}
    {!channelReady && <p>Het API-kanaal van de bestaande Technical Agent is nog niet aangesloten. Opdrachten kunnen worden voorbereid; verzenden blijft uitgeschakeld.</p>}
    {!ready && <p role="alert">Dossiercontext en nieuwe opdrachten blijven geblokkeerd zolang de gegevens niet zijn vrijgegeven.</p>}
    {!grants.data?.length && <p>Er is nog geen verbinding met toestemming voor resultaatopslag. <Link href="/mcp/commandcenter/authorize">Bekijk je verbindingen</Link>. Verbind opnieuw vanuit ChatGPT met de aanvullende toestemming.</p>}
    {ready && !jobs.error && !grants.error && <section><h2>Nieuwe opdracht voorbereiden</h2>
      <form method="get"><label>Dossiertype<select name="entity" defaultValue={entity}><option value="projects">Project</option><option value="events">Event</option></select></label><button type="submit">Dossiers tonen</button></form>
      {choices?.error?<p role="alert">De dossiers konden niet worden geladen.</p>:<form method="get"><input type="hidden" name="entity" value={entity}/><label>Dossier<select name="source" defaultValue={q.source??""} required><option value="">Kies een dossier</option>{choices?.data?.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select></label><button type="submit">Bron controleren</button></form>}
      {choices?.data?.length===100 && <p>De eerste 100 dossiers worden getoond.</p>}
      {source && grants.data?.length ? <form action={createAgentJob}>
        <p>Geselecteerd: {source.title} · bronversie {source.updated_at}</p>
        <input type="hidden" name="source_entity" value={entity}/><input type="hidden" name="source_id" value={source.id}/><input type="hidden" name="source_version" value={source.updated_at}/><input type="hidden" name="idempotency_key" value={randomUUID()}/>
        <label>Verbinding<select name="grant_id">{grants.data.map(g=><option key={g.id} value={g.id}>{new Date(g.created_at).toLocaleString("nl-BE")}</option>)}</select></label>
        <label>Opdracht<textarea name="request" minLength={5} maxLength={4000} required placeholder="Welke technische controle wil je laten uitvoeren?"/></label><button type="submit">Opdracht opslaan</button>
      </form>:q.source?<p>Geen beschikbare bron of schrijftoestemming. Er is niets aangemaakt.</p>:null}
    </section>}
    <h2>Opdrachten en ontvangen resultaten</h2>
    {!jobs.error && !rows.length && <p>Nog geen opdrachten.</p>}
    {rows.map(j=><section key={j.id}><h3>{j.request}</h3><p>{j.result_received_at?"Resultaat ontvangen":"Wacht op resultaat"} · Beoordeling: {({pending:"Nog te beoordelen",accepted:"Geaccepteerd",rejected:"Afgewezen"} as Record<string,string>)[j.review]}</p><details><summary>Bron en opdrachtgegevens</summary><p>Opdrachtkenmerk: <code>{j.id}</code> · Bronversie: {j.source_version}</p></details>
      <p>{({prepared:"Nog niet verstuurd",dispatching:"Verzending wordt gecontroleerd",accepted:"Ontvangen door agentdienst",unknown:"Ontvangst onzeker; opnieuw versturen gebruikt dezelfde opdracht"} as Record<string,string>)[j.dispatch_state]}</p>
      {j.conversation_url && /^https:\/\/chatgpt\.com\/c\/[A-Za-z0-9_-]+$/.test(j.conversation_url) && <p><a href={j.conversation_url} target="_blank" rel="noopener noreferrer">Open agentgesprek</a></p>}
      {channelReady && ready && j.created_by===user.id && !j.result_received_at && j.dispatch_state!=="accepted" && <form action={dispatchAgentJob}><input type="hidden" name="job_id" value={j.id}/><p>Deze agentuitvoering kan betaalde werkruimtecredits verbruiken en extra kosten bovenop het Business-abonnement geven. Het actuele tegoed en de kostenlimieten staan in ChatGPT bij Facturering. Het Command Center controleert die niet automatisch.</p><button type="submit">{j.dispatch_state==="prepared"?"Naar Technical Agent sturen":"Verzending opnieuw controleren"}</button></form>}
      {(Array.isArray(j.agent_results)?j.agent_results:j.agent_results?[j.agent_results]:[]).map((r,index)=><div key={index}><p>{r.payload.summary}</p><ul>{r.payload.findings.map((f,i)=><li key={i}>{({confirmed:"Bevestigd door agent",uncertain:"Onzeker",proposal:"Voorstel"} as Record<string,string>)[f.classification]}: {f.statement}</li>)}</ul></div>)}
      {j.result_received_at && j.review==="pending" && <form action={reviewAgentResult}><input type="hidden" name="job_id" value={j.id}/><button name="review" value="accepted" type="submit">Resultaat accepteren</button><button name="review" value="rejected" type="submit">Resultaat afwijzen</button></form>}
    </section>)}
  </div></AppShell>;
}
