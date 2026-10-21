import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { F1Form } from '@/components/f1-form';
import '@/app/app/administratie/werkstromen/workflows.css';
type Purpose={id:string;title:string;body:string;text_version:number;allowed_scope:Record<string,unknown>;retention_policy:string};
type Declaration={id:string;purpose_title:string;purpose_body:string;text_version:number;scope:Record<string,unknown>;method:string;recorded_at:string;valid:boolean};
function scopeText(scope:Record<string,unknown>){return Object.entries(scope).map(([k,v])=>`${k}: ${Array.isArray(v)?v.join(', '):String(v)}`).join(' · ');}
export async function F1OwnConsent({query,returnTo}:{query:Record<string,string|undefined>;returnTo:'/app/account/toestemming'|'/portal/toestemming'}){
 const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)redirect('/login');
 const [internal,portal]=await Promise.all([supabase.from('organization_members').select('organization_id').eq('user_id',user.id).eq('status','active'),supabase.from('portal_access').select('organization_id').eq('user_id',user.id).eq('status','active')]);
 const orgs=[...new Set([...(internal.data??[]),...(portal.data??[])].map(r=>r.organization_id))].sort();
 const org=query.organisatie??orgs[0];if(!org||!orgs.includes(org))return <p className="permission-note">Je hebt geen actieve toegang voor deze organisatie.</p>;
 const {data,error}=await supabase.rpc('f1_own_consent',{p_organization_id:org});
 if(error)return <p className="permission-note">Doelgerichte toestemmingen zijn in deze omgeving nog niet beschikbaar.</p>;
 const state=data as {purposes:Purpose[];records:Declaration[]};
 return <div className="f1-workspace"><nav aria-label="Organisatie">{orgs.length>1&&orgs.map((id,index)=><Link key={id} href={`${returnTo}?organisatie=${id}`}>Organisatie {index+1}</Link>)}</nav>
 {query.succes&&<p className="success" role="status">Je verklaring is bijgewerkt.</p>}{(query.fout||query.melding)&&<p className="error-note" role="alert">{query.melding??'Controleer de velden en bevestig de gekozen verklaring.'}</p>}
 <p>Je beslist per doel. Intrekken stopt toekomstig gebruik waarvoor deze verklaring nodig is. Historische administratie wordt volgens de vastgestelde bewaarbehandeling behandeld.</p>
 <section><h2>Beschikbare doelteksten</h2>{!state.purposes.length&&<p>Er zijn nog geen vastgestelde doelen waarvoor je een verklaring kunt afleggen.</p>}{state.purposes.map(p=><article key={p.id}><h3>{p.title}</h3><p>Tekstversie {p.text_version}</p><p style={{whiteSpace:'pre-wrap'}}>{p.body}</p><p>Gegevens: {scopeText(p.allowed_scope)}</p><p>Bewaarbehandeling: {p.retention_policy}</p><F1Form title="Voor dit doel een verklaring afleggen" operation="consent.give" organization={org} returnTo={returnTo} hidden={{data_purpose_id:p.id,data_scope:JSON.stringify(p.allowed_scope)}} fields={[{name:'data_accepted',label:'Ik heb deze specifieke tekst en gegevensscope gelezen en stem ermee in',type:'checkbox',required:true}]} button="Verklaring vastleggen"/></article>)}</section>
 <section><h2>Mijn verklaringen</h2>{!state.records.length&&<p>Je hebt nog geen doelverklaringen vastgelegd.</p>}{state.records.map(r=><article key={r.id}><h3>{r.purpose_title}</h3><p>Tekstversie {r.text_version} · {r.method==='self'?'Zelf vastgelegd':'Met extern bewijs geregistreerd'} · {r.valid?'Actueel geldig':'Niet meer geldig'}</p><details><summary>Vastgelegde tekst en scope</summary><p style={{whiteSpace:'pre-wrap'}}>{r.purpose_body}</p><p>{scopeText(r.scope)}</p></details>{r.valid&&<F1Form title="Deze verklaring intrekken" operation="consent.withdraw" organization={org} returnTo={returnTo} hidden={{data_id:r.id}} fields={[{name:'data_reason',label:'Reden (optioneel)',required:false}]} button="Intrekken"/>}</article>)}</section></div>;
}
