'use client';

import {useEffect,useRef,useState} from 'react';
import {CreatorYouTubeConnect,type CreatorYouTubeFlowReply} from './creator-youtube-connect';
import type {CreatorYouTubeConsent} from '@/lib/creator-youtube-kernel';
import type {CreatorYouTubeAccountPage,CreatorYouTubeOwnLink} from '@/lib/creator-youtube-session';

type Pending={link:string;kind:string;status:string;expires:number;provider:string|null};
type Status={status:string;account?:CreatorYouTubeAccountPage;link?:CreatorYouTubeOwnLink;pending:Pending|null};
type Transport=(url:string,init:RequestInit)=>Promise<Response>;
const labels={views:'Weergaven',estimatedMinutesWatched:'Kijktijd',averageViewDuration:'Gemiddelde kijkduur'};
const units={count:'aantal',minutes:'minuten',seconds:'seconden'};

export function CreatorYouTubeAccount({transport=fetch,navigate=(url:string)=>window.location.assign(url)}:{transport?:Transport;navigate?:(url:string)=>void}){
 const [account,setAccount]=useState<CreatorYouTubeAccountPage|null>(null),[selected,setSelected]=useState(''),[detail,setDetail]=useState<CreatorYouTubeOwnLink|null>(null),[pending,setPending]=useState<Pending|null>(null),[draft,setDraft]=useState<Omit<CreatorYouTubeConsent,'accepted'>|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[revision,setRevision]=useState(0),[changed,setChanged]=useState(false);
 const generation=useRef(0);
 const [mutating,setMutating]=useState(false);
 const [now,setNow]=useState(Date.now);
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
 async function read(url:string){const response=await transport(url,{method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error'});const result=await response.json() as Status;if(!response.ok||result.status!=='ready')throw Error('Status unavailable');return result;}
 async function reload(after:string|null=null){
  const own=++generation.current;setLoading(true);setError('');setDetail(null);setDraft(null);
  try{
   const result=await read('/api/creator-youtube'+(after?'?after='+encodeURIComponent(after):''));if(own!==generation.current)return;
   if(!result.account||!Array.isArray(result.account.links))throw Error('Missing account');
   const links=after?[...(account?.links??[]),...result.account.links]:result.account.links;
   setAccount({...result.account,links});setPending(result.pending);setChanged(false);
   const next=result.pending?.link??(links.some(l=>l.id===selected)?selected:links[0]?.id??'');setSelected(next);
   if(next){const value=await read('/api/creator-youtube?link='+encodeURIComponent(next));if(own!==generation.current)return;if(!value.link||value.link.id!==next)throw Error('Wrong link');setDetail(value.link);setPending(value.pending);}
   setRevision(v=>v+1);
  }catch{if(own===generation.current){setError('Je actuele YouTube-status kon niet worden bevestigd. Er worden geen acties vrijgegeven.');setDetail(null);setAccount(null);}}
  finally{if(own===generation.current)setLoading(false);}
 }
 useEffect(()=>{let active=true;void Promise.resolve().then(()=>{if(active)void reload();});return()=>{active=false;generation.current++;};},[]); // eslint-disable-line react-hooks/exhaustive-deps
 async function select(value:string){
  const own=++generation.current;setSelected(value);setDetail(null);setDraft(null);setLoading(true);setError('');
  try{const result=await read('/api/creator-youtube?link='+encodeURIComponent(value));if(own!==generation.current)return;if(!result.link||result.link.id!==value)throw Error('Wrong link');setDetail(result.link);setPending(result.pending);setRevision(v=>v+1);}catch{if(own===generation.current)setError('Deze persoonlijke koppeling kon niet worden bevestigd.');}finally{if(own===generation.current)setLoading(false);}
 }
 const action=async(input:Record<string,unknown>)=>{
  setMutating(true);setChanged(true);
  try{const response=await transport('/api/creator-youtube',{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
  const value=await response.json() as CreatorYouTubeFlowReply;if(!response.ok)throw Error('Action unconfirmed');return value;}finally{setMutating(false);}
 };
 function prepare(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();const data=new FormData(event.currentTarget);try{
   const value={purpose:String(data.get('purpose')).trim(),channel_id:String(data.get('channel')).trim(),video_ids:String(data.get('videos')).split(/[\s,]+/).filter(Boolean),start_date:String(data.get('start')),end_date:String(data.get('end')),valid_until:new Date(String(data.get('valid'))).toISOString(),retain_until:new Date(String(data.get('retain'))).toISOString()};
   if(value.purpose.length<2||value.purpose.length>2000||!/^UC[A-Za-z0-9_-]{22}$/.test(value.channel_id)||value.video_ids.length<1||value.video_ids.length>25||new Set(value.video_ids).size!==value.video_ids.length||value.video_ids.some(id=>!/^[A-Za-z0-9_-]{11}$/.test(id))||!value.start_date||value.end_date<value.start_date||value.end_date>new Date().toISOString().slice(0,10)||Date.parse(value.valid_until)<=Date.now()||Date.parse(value.retain_until)<Date.parse(value.valid_until))throw Error('Invalid scope');
   setDraft(value);setDetail(null);setSelected('');setError('');setRevision(v=>v+1);
  }catch{setError('Controleer kanaal, video-ID’s, doel, meetperiode en toekomstige toestemmings- en bewaartermijn.');}
 }
 const current=detail?.consent??draft;
 const connected=Boolean(detail?.status==='active'&&detail.access_available!==false&&Date.parse(detail.consent.valid_until)>now&&Date.parse(detail.consent.retain_until)>now);
 const revoked=Boolean(detail?.status==='revoked'&&['pending','failed'].includes(detail.provider_revocation));
 const ownPending=Boolean(pending&&(!detail||pending.link===detail.id));
 const missingTicket=detail?.status==='pending'&&!ownPending;
 return <section className="form-card space-y-4" aria-labelledby="creator-account-heading">
  <h2 id="creator-account-heading">Persoonlijke YouTube-inzichten</h2>
  <p>Je ziet hier alleen je eigen toestemmingen en metingen. Dit staat los van de organisatiekanalen en geeft geen toestemming voor publicatie of campagnedeling.</p>
  <button type="button" disabled={loading||mutating} onClick={()=>void reload()}>Status opnieuw laden</button>
  {loading&&<p role="status">Je eigen koppelingsstatus wordt gecontroleerd…</p>}
  {error&&<p role="alert">{error}</p>}
  {!loading&&account&&<>
   {account.links.length>0&&<label>Eigen koppeling<select aria-label="Eigen YouTube-koppeling" value={selected} disabled={Boolean(pending)||mutating||changed} onChange={event=>void select(event.target.value)}>{!selected&&<option value="">Nieuwe aanvraag</option>}{account.links.map(link=><option key={link.id} value={link.id}>{link.channel_id} — {link.status}</option>)}</select></label>}
   {account.next_after&&<button type="button" disabled={mutating} onClick={()=>void reload(account.next_after)}>Meer eigen koppelingen</button>}
   {!pending&&!changed&&!account.links.some(link=>link.status==='pending'||['pending','failed'].includes(link.provider_revocation))&&<form onSubmit={prepare} className="space-y-2">
    <h3>Nieuwe persoonlijke toestemming voorbereiden</h3>
    <label>Doel<textarea name="purpose" required minLength={2} maxLength={2000}/></label>
    <label>YouTube-kanaal-ID<input name="channel" required pattern="UC[A-Za-z0-9_-]{22}"/></label>
    <label>Video-ID’s (maximaal 25)<textarea name="videos" required/></label>
    <label>Meetperiode vanaf<input name="start" type="date" required/></label>
    <label>Meetperiode tot<input name="end" type="date" required/></label>
    <label>Toestemming tot (jouw lokale tijd)<input name="valid" type="datetime-local" required/></label>
    <label>Bewaren tot (jouw lokale tijd)<input name="retain" type="datetime-local" required/></label>
    <button type="submit">Toestemming controleren</button>
   </form>}
   {missingTicket&&<p>Deze aanvraag heeft geen herstelbewijs in deze browser. Gebruik de oorspronkelijke browser en sessie; er wordt niets automatisch overgenomen of herhaald.</p>}
   {detail?.access_available===false&&<p>De proefperiode is verstreken. Je kunt de koppeling nog intrekken.</p>}
   {detail?.status==='active'&&!connected&&detail.access_available!==false&&<p>De toestemmings- of bewaartermijn is verstreken. Er worden geen metingen getoond of opgehaald.</p>}
   {current&&<CreatorYouTubeConnect key={revision+':'+(detail?.id??'new')} configured={!missingTicket&&Boolean(draft||connected||ownPending||revoked||detail?.status==='active')} connected={connected} pending={ownPending} revocationPending={revoked||Boolean(detail?.status==='active'&&!connected)} link={detail?.id??null} consent={current} action={action} navigate={navigate}/>}
   {detail&&connected&&!changed&&<div><h3>Eigen opgeslagen metingen</h3><p>Ontbrekende waarden betekenen niet nul. Controleer meetperiode en meettijd; deze cijfers worden niet gepubliceerd.</p>
    <table><thead><tr><th>Video</th><th>Meting</th><th>Waarde</th><th>Eenheid</th><th>Meetperiode</th><th>Gemeten op</th></tr></thead><tbody>{detail.samples.map((s,i)=><tr key={i}><td>{s.video_id}</td><td>{labels[s.metric]}</td><td>{s.quality==='missing'||s.value===null?'Ontbreekt':s.value.toLocaleString('nl-BE')}</td><td>{units[s.unit]}</td><td>{s.start_date} – {s.end_date}</td><td>{s.measured_at}</td></tr>)}</tbody></table>{!detail.samples.length&&<p>Er zijn nog geen metingen opgeslagen.</p>}</div>}
   {changed&&<p>Status of metingen kunnen gewijzigd zijn. Kies ‘Status opnieuw laden’ voor de bevestigde databaseweergave.</p>}
  </>}
 </section>;
}
