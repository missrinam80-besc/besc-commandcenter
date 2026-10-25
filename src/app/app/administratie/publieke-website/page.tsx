import {randomUUID} from 'node:crypto';
import {AppShell} from '@/components/app-shell';
import {requireActiveMembership} from '@/lib/auth-context';
import {runPublicWebsite} from './actions';
import '../werkstromen/workflows.css';
type Row=Record<string,unknown>;
const rows=(value:unknown)=>Array.isArray(value)?value as Row[]:[];
const str=(value:unknown)=>String(value??'');
function Form({title,op,fields={},children}:{title:string;op:string;fields?:Record<string,string>;children?:React.ReactNode}){
 return <details className="f1-form"><summary>{title}</summary><form action={runPublicWebsite}><input type="hidden" name="request_id" value={randomUUID()}/><input type="hidden" name="operation" value={op}/>{Object.entries(fields).map(([name,value])=><input key={name} type="hidden" name={'data_'+name} value={value}/>)}{children}<label>Onderbouwing<textarea name="data_reason" minLength={2} maxLength={2000} required/></label><button>Opslaan</button></form></details>;
}
function Workspace({children}:{children:React.ReactNode}){return <AppShell active="VZW-administratie"><header className="topbar module-top"><div><p>WEBSITE · VOORBEREIDING</p><h1>Publieke website voorbereiden</h1></div></header><div className="module-body f1-workspace">{children}</div></AppShell>;}
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 const query=await searchParams,{supabase,membership}=await requireActiveMembership();
 if(process.env.BESC_PUBLIC_WEBSITE_ADMIN_ENABLED!=='true')return <Workspace><p>Deze bediening staat in deze omgeving uit.</p></Workspace>;
 const {data,error}=await supabase.rpc('f6_public_status',{p_organization_id:membership.organization_id});
 if(error||!data)return <Workspace><p>Geen actuele bevoegdheid of de gegevens zijn niet beschikbaar.</p></Workspace>;
 const {data:sites}=await supabase.from('publication_sites').select('id,host').eq('organization_id',membership.organization_id).limit(100);
 const channels=rows(data.channels),grants=rows(data.grants),candidates=rows(data.candidates);
 return <Workspace><p>{process.env.BESC_PUBLIC_WEBSITE_READ_ENABLED==='true'?'De afzonderlijke serverleesroute is ingeschakeld.':'De afzonderlijke serverleesroute staat uit.'} Een kanaal en elke inhoudsversie vereisen hun eigen expliciete vrijgave. De afgeschermde website wordt hiermee niet automatisch publiek.</p>
 {query.melding&&<p role="alert">{query.melding}</p>}{query.succes&&<p role="status">De handeling is opgeslagen. Hieronder staan de actuele gegevens.</p>}
 <Form title="Gesloten kanaal voorbereiden" op="channel.create"><label>Bronsite<select name="data_site_id" required><option value="">Maak een keuze</option>{rows(sites).map(s=><option key={str(s.id)} value={str(s.id)}>{str(s.host)}</option>)}</select></label><label>Exacte publieke origin<input name="data_origin" type="url" placeholder="https://www.example.invalid" required/></label><p>Het kanaal begint gesloten en krijgt de hash van de afzonderlijk geconfigureerde serversleutel. De bronsite geeft geen algemene publicatietoestemming.</p></Form>
 {channels.map(c=>{const fields={channel_id:str(c.id),expected_version:str(c.version)};return <section key={str(c.id)}><h2>{str(c.origin)}</h2><p>{c.enabled?'Kanaal ingeschakeld':'Kanaal gesloten'} · versie {str(c.version)}</p>
 <Form title={c.enabled?'Kanaal sluiten':'Kanaal inschakelen'} op="channel.state" fields={{...fields,enabled:String(!c.enabled)}}/>
 <Form title="Afzonderlijke serversleutel opnieuw binden" op="channel.key" fields={fields}/>
 <Form title="Eén exacte vrijgegeven bronversie toelaten" op="grant.add" fields={fields}><label>Actuele versie<select name="candidate" required><option value="">Maak een keuze</option>{candidates.filter(x=>x.site_id===c.site_id).map(x=><option key={str(x.entry_id)} value={JSON.stringify({kind:x.kind,entry_id:x.entry_id,revision_id:x.revision_id,entry_epoch:x.entry_epoch})}>{str(x.kind)} · {str(x.title)} · {str(x.revision_id)}</option>)}</select></label></Form>
 {grants.filter(g=>g.channel_id===c.id).map(g=><article key={str(g.id)}><p>{str(g.kind)} · {str(g.entry_id)} · {g.revoked_at?'Ingetrokken':g.available?'Bronversie actueel':'Bronversie niet beschikbaar'}</p>{!g.revoked_at&&<Form title="Deze toelating intrekken" op="grant.withdraw" fields={{...fields,grant_id:str(g.id)}}/>}</article>)}
 </section>;})}<p>Overzicht: maximaal 100 kanalen, 100 toelatingen en 100 kandidaten per inhoudstype.</p></Workspace>;
}
