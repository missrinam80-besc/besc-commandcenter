import { randomUUID } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { parsePilotPostUrl } from '@/lib/campaign-pilot';
import { discoverF5Campaign,submitF5Discovery } from '@/app/app/campagnes/[id]/proef/f5-actions';
type Discovery={sources:{id:string;broadcaster:string}[];runs:{id:string;status:string;items:{external_id:string;url:string;title:string;kind:string}[]}[]};
export async function F5CampaignTools({org,campaign,synthetic}:{org:string;campaign:string;synthetic:boolean}){
 if(synthetic||process.env.BESC_CAMPAIGNS_ENABLED!=='true')return null;
 const searching=process.env.BESC_CAMPAIGN_DISCOVERY_ENABLED==='true',references=process.env.BESC_STREAMERBOT_REFERENCES_ENABLED==='true';if(!searching&&!references)return null;
 const supabase=await createClient(),discovery=searching?await supabase.rpc('f5_discovery_state',{p_org:org,p_campaign:campaign}):null;
 const ref=references?await supabase.rpc('f5_source_references',{p_org:org,p_campaign:campaign}):null;
 const data:Discovery=discovery?.error?{sources:[],runs:[]}:discovery?.data??{sources:[],runs:[]};
 const refs=Array.isArray(ref?.data)?ref.data as {id:string;kind:string;url:string;occurred_at:string}[]:[];
 const end=new Date().toISOString(),start=new Date(Date.parse(end)-7*86400000).toISOString();
 return <>
  {searching&&data.sources.length>0&&<section className="panel"><h2>Recente Twitch-bijdragen zoeken</h2><p>Een handmatige zoekopdracht voor de laatste zeven dagen. Maximaal twintig suggesties; dit is geen volledig bereikrapport. Indienen en onafhankelijke beoordeling blijven aparte stappen.</p>
   <form action={discoverF5Campaign}><input type="hidden" name="campaign" value={campaign}/><input type="hidden" name="request" value={randomUUID()}/><input type="hidden" name="start" value={start}/><input type="hidden" name="end" value={end}/>
    <label>Gekoppelde bron<select name="source" required>{data.sources.map(s=><option key={s.id} value={s.id}>Twitch-bron {s.broadcaster}</option>)}</select></label><button className="secondary">VOD’s en clips zoeken</button></form>
   {data.runs.map(r=><div key={r.id}><p>{r.status==='ready'?'Suggesties beschikbaar':r.status==='pending'?'Zoekopdracht geregistreerd':r.status==='revoked'?'Toegang of bron ingetrokken':'Zoekopdracht niet voltooid'}</p>{r.status==='ready'&&r.items.map((item,index)=>parsePilotPostUrl(item.url)?.canonicalUrl===item.url&&<article key={item.external_id}><p><a href={item.url} target="_blank" rel="noreferrer">{item.title||item.kind}</a></p><form action={submitF5Discovery}><input type="hidden" name="campaign" value={campaign}/><input type="hidden" name="run" value={r.id}/><input type="hidden" name="index" value={index}/><input type="hidden" name="request" value={randomUUID()}/><button className="secondary">Als kandidaatbijdrage indienen</button></form></article>)}</div>)}
  </section>}
  {references&&refs.length>0&&<section className="panel"><h2>Aangeleverde Streamer.bot-referenties</h2><p>Deze referenties zijn bronclaims, geen geverifieerde metingen of beloningen. Clips en VOD’s volgen de bestaande bijdragebeoordeling.</p>{refs.map(r=>parsePilotPostUrl(r.url)?.canonicalUrl===r.url&&<p key={r.id}><a href={r.url} target="_blank" rel="noreferrer">{r.kind==='stream'?'Streamreferentie':r.kind==='clip'?'Clipreferentie':'VOD-referentie'}</a> — niet geverifieerd</p>)}</section>}
 </>;
}
