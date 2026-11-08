import Link from 'next/link';
import {inboxStatuses,inboxOperations,inboxDetail,inboxRow} from '@/lib/social-inbox';
import type {z} from 'zod';
import {manageSocialInbox} from '@/app/app/social/inbox/actions';

type Detail=z.infer<typeof inboxDetail>;
type Row=z.infer<typeof inboxRow>;
type Filters={status?:string;platform?:string;mine?:string;before?:string};
const href=(values:Record<string,string|undefined>)=>'/app/social/inbox?'+new URLSearchParams(Object.entries(values).filter((p):p is [string,string]=>Boolean(p[1]))).toString();
const date=(v:string)=>new Date(v).toLocaleString('nl-BE',{timeZone:'Europe/Brussels'});
export function SocialInboxView({rows,detail,members,filters,error,success}:{rows:Row[];detail:Detail|null;members:{id:string;name:string}[];filters:Filters;error?:string;success?:boolean}){
 const names=new Map(members.map(m=>[m.id,m.name]));
 const person=(id:unknown)=>typeof id==='string'?(names.get(id)??'Voormalige of andere beheerder'):'Niet toegewezen';
 const base=detail?{thread:detail.id,revision:String(detail.revision)}:null;
 const hidden=(action:string)=><><input type="hidden" name="thread" value={base!.thread}/><input type="hidden" name="revision" value={base!.revision}/><input type="hidden" name="action" value={action}/></>;
 return <div className="social-inbox-view">
  <header className="topbar module-top"><div><p>OPVOLGING & COMMUNICATIE</p><h1>Socialinbox</h1></div><Link href="/app/social">Social planning</Link></header>
  <div className="module-body">
   <p className="lead">Volg reacties en privéberichten intern op. Intern afhandelen verstuurt geen antwoord en wijzigt niets bij Meta.</p>
   {error&&<p role="alert">{error==='gewijzigd'?'Dit gesprek is intussen gewijzigd. Herlaad en controleer de nieuwe berichten en historie.':'De socialinbox kon niet worden gecontroleerd. Probeer opnieuw; er is geen bevestigde wijziging.'}</p>}
   {success&&<p role="status">De interne wijziging is opgeslagen.</p>}
   <form className="toolbar module-filters" method="get">
    <label>Status<select name="status" defaultValue={filters.status??''}><option value="">Alle statussen</option>{Object.entries(inboxStatuses).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
    <label>Platform<select name="platform" defaultValue={filters.platform??''}><option value="">Alle platformen</option><option value="facebook">Facebook</option><option value="instagram">Instagram</option></select></label>
    <label><input type="checkbox" name="mine" value="true" defaultChecked={filters.mine==='true'}/>Aan mij toegewezen</label><button>Filteren</button>
   </form>
   {!error&&rows.length===0&&<p>Geen gesprekken gevonden voor deze filters.</p>}
   <ul className="social-inbox-list">{rows.slice(0,25).map(row=><li key={row.id}><Link href={href({...filters,thread:row.id})}>{row.account_name} · {row.platform==='instagram'?'Instagram':'Facebook'} · {row.kind==='direct'?'Privébericht':'Reactie'}</Link><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{row.preview}</p><p>{inboxStatuses[row.status]} · {person(row.assignee_id)} · {date(row.last_message_at)}</p></li>)}</ul>
   {rows.length>25&&<Link href={href({...filters,before:rows[24].id})}>Oudere gesprekken</Link>}
   {filters.before&&<Link href={href({...filters,before:undefined})}>Nieuwste gesprekken</Link>}
   {detail&&<section aria-label="Gesprek"><h2>{detail.account_name} · {detail.kind==='direct'?'Privébericht':'Reactie'}</h2><p>{inboxStatuses[detail.status]} · {person(detail.assignee_id)}</p>
    <h3>Ontvangen berichten</h3><ol>{detail.messages.slice(-50).map(m=><li key={m.id}><strong>{m.sender}</strong> · <time>{date(m.occurred_at)}</time><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{m.body}</p></li>)}</ol>
    {detail.messages.length>50&&<Link href={href({thread:detail.id,messages_before:detail.messages[1].id})}>Eerdere berichten</Link>}
    <form action={manageSocialInbox}>{hidden('assign')}<label>Toewijzen aan<select name="assignee" defaultValue={detail.assignee_id??''}><option value="">Niet toegewezen</option>{detail.assignee_id&&!names.has(detail.assignee_id)&&<option value={detail.assignee_id}>Voormalige beheerder</option>}{members.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label><button>Toewijzing opslaan</button></form>
    <form action={manageSocialInbox}>{hidden('status')}<label>Interne status<select name="status" defaultValue={detail.status}>{Object.entries(inboxStatuses).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><button>Status opslaan</button></form>
    <form action={manageSocialInbox}>{hidden('note')}<label>Interne notitie<textarea name="note" required maxLength={2000}/></label><button>Notitie opslaan</button></form>
    <h3>Historie</h3><ol>{detail.events.slice(-50).map(e=><li key={e.id}><time>{date(e.created_at)}</time> · {inboxOperations[e.operation]} · {e.actor_id?person(e.actor_id):'Ontvangst'}
     {e.operation==='note'?<p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{typeof e.detail.note==='string'?e.detail.note:''}</p>:e.operation==='assigned'?<p>{person(e.detail.from)} → {person(e.detail.to)}</p>:['status','reopened'].includes(e.operation)?<p>{inboxStatuses[e.detail.from as keyof typeof inboxStatuses]} → {inboxStatuses[e.detail.to as keyof typeof inboxStatuses]}</p>:null}
    </li>)}</ol>{detail.events.length>50&&<Link href={href({thread:detail.id,events_before:String(detail.events[1].id)})}>Eerdere historie</Link>}
   </section>}
  </div>
 </div>;
}
