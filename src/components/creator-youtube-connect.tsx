'use client';

import {useRef,useState} from 'react';
import type {CreatorYouTubeConsent} from '@/lib/creator-youtube-kernel';

export type CreatorYouTubeFlowReply={status:string;provider?:string;link?:string;authorizationUrl?:string;exchangeNotStarted?:boolean};
type Props={
 configured?:boolean;
 connected:boolean;
 pending:boolean;
 link:string|null;
 consent:Omit<CreatorYouTubeConsent,'accepted'>;
 action:(input:Record<string,unknown>)=>Promise<CreatorYouTubeFlowReply>;
 navigate:(url:string)=>void;
};

// Reusable local UI, not mounted on an account page. The host supplies an authenticated
// own-link read and same-origin actions; a callback query string is never proof of connection.
export function CreatorYouTubeConnect({configured=false,connected:initialConnected,pending:initialPending,link:initialLink,consent,action,navigate}:Props){
 const [accepted,setAccepted]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[connected,setConnected]=useState(initialConnected),[pending,setPending]=useState(initialPending),[link,setLink]=useState(initialLink);
 const working=useRef(false);
 const [uncertain,setUncertain]=useState(false);
 const [revocationPending,setRevocationPending]=useState(false);
 async function run(command:'start'|'refresh'|'collect'|'disconnect'|'cancel'|'recover'){
  if(!configured||working.current||command==='start'&&!accepted)return;
  working.current=true;setBusy(true);setMessage('Bezig met je YouTube-koppeling…');
  try{
   let result:CreatorYouTubeFlowReply;
   if(command==='start'){
    setPending(true);
    result=await action({action:'start',consent:{...consent,accepted:true}});
    if(result.status!=='prepared'||!result.authorizationUrl)throw Error('Unconfirmed');
    const url=new URL(result.authorizationUrl);
    if(url.origin!=='https://accounts.google.com'||url.pathname!=='/o/oauth2/v2/auth'||url.username||url.password||url.hash)throw Error('Invalid destination');
    setPending(true);if(result.link)setLink(result.link);navigate(url.href);setMessage('Ga verder bij Google. Je koppeling is pas actief na bevestigde terugkeer.');
   }else{
    if(command==='refresh'){
     setPending(true);
     const prepared=await action({action:'prepare-refresh',link});
     if(prepared.status!=='prepared')throw Error('Unconfirmed');setPending(true);
    }
    result=await action({action:command,...(['collect','disconnect'].includes(command)?{link}:{})});
    if(result.status==='not_confirmed'||result.status==='unavailable')throw Error('Unconfirmed');
    if(command==='disconnect'&&result.status==='disconnected'){
     setConnected(false);setRevocationPending(!['complete','none'].includes(result.provider??''));setMessage(result.provider==='none'?'Geen Google-intrekking nodig: er is geen tokenwisseling gestart.':result.provider==='complete'?'Koppeling ingetrokken.':'Toegang lokaal ingetrokken. De intrekking bij Google is nog niet bevestigd.');
    }else if(command==='collect'&&result.status==='collected')setMessage('De geselecteerde statistieken zijn opgeslagen.');
    else if(result.status==='completed'&&command==='refresh'){setPending(false);setMessage('Toegang veilig vernieuwd.');}
    else if(['cancelled','expired','recovered','completed','cleanup_pending'].includes(result.status)){
     const done=result.provider==='complete'||result.provider==='none';setPending(!done);
     if(result.provider!=='none')setConnected(false);
     setMessage(result.exchangeNotStarted&&result.provider==='none'?'De aanvraag is afgesloten zonder tokenwisseling. Er was geen Google-intrekking nodig.':result.exchangeNotStarted&&result.provider!=='complete'?'De aanvraag is gestopt vóór tokenwisseling. De serveropvolging is nog niet bevestigd.':done?'De aanvraag is afgehandeld.':'Toegang is geblokkeerd; opruiming is nog niet bevestigd.');
    }else throw Error('Unconfirmed');
   }
  }catch{
   // No automatic request replay, provider error text or credentials in the UI.
   setUncertain(true);
   setMessage('Niet bevestigd. Probeer de koppeling niet opnieuw te starten; controleer de aanvraag via herstel.');
  }finally{working.current=false;setBusy(false);}
 }
 return <section aria-labelledby="creator-youtube-title" className="space-y-4 rounded-lg border p-4">
  <h2 id="creator-youtube-title" className="text-lg font-semibold">Jouw YouTube-statistieken</h2>
  <p>Koppel vrijwillig je eigen kanaal. BESC vraagt alleen leestoegang; er wordt niets gepubliceerd.</p>
  <dl className="space-y-1 text-sm">
   <div><dt className="font-medium">Doel</dt><dd>{consent.purpose}</dd></div>
   <div><dt className="font-medium">Kanaal</dt><dd>{consent.channel_id}</dd></div>
   <div><dt className="font-medium">Geselecteerde video’s</dt><dd>{consent.video_ids.join(', ')}</dd></div>
   <div><dt className="font-medium">Meetperiode</dt><dd>{consent.start_date} tot {consent.end_date}</dd></div>
   <div><dt className="font-medium">Toestemming tot</dt><dd>{consent.valid_until}</dd></div>
   <div><dt className="font-medium">Bewaren tot</dt><dd>{consent.retain_until}</dd></div>
  </dl>
  <p className="text-sm">Metingen: weergaven, kijktijd in minuten en gemiddelde kijkduur. Deze persoonlijke koppeling geeft geen toestemming om je cijfers te publiceren of met een campagne te delen.</p>
  {!configured&&<p>Deze koppeling is nog niet beschikbaar.</p>}
  <p>{uncertain?'De actuele koppelingsstatus is niet bevestigd. Herlaad na herstel.':connected?'Je kanaal is gekoppeld.':'Je kanaal is nog niet gekoppeld.'}</p>
  {!connected&&!pending&&!revocationPending&&<label className="flex gap-2"><input type="checkbox" checked={accepted} disabled={busy||!configured} onChange={event=>setAccepted(event.target.checked)}/>Ik geef toestemming voor het bovenstaande doel, de geselecteerde video’s en de vermelde termijnen.</label>}
  <div className="flex flex-wrap gap-2">
   {!connected&&!pending&&!revocationPending&&<button type="button" disabled={!configured||!accepted||busy||uncertain} onClick={()=>void run('start')}>Toestemming geven en naar Google</button>}
   {revocationPending&&<button type="button" disabled={!configured||busy} onClick={()=>void run('disconnect')}>Intrekking opnieuw controleren</button>}
   {connected&&<>
    <button type="button" disabled={!configured||busy||pending||uncertain} onClick={()=>void run('collect')}>Statistieken ophalen</button>
    <button type="button" disabled={!configured||busy||pending||uncertain} onClick={()=>void run('refresh')}>Toegang vernieuwen</button>
    <button type="button" disabled={!configured||busy||pending} onClick={()=>void run('disconnect')}>Koppeling intrekken</button>
   </>}
   {pending&&<>
    <button type="button" disabled={!configured||busy} onClick={()=>void run('recover')}>Aanvraag herstellen</button>
    <button type="button" disabled={!configured||busy} onClick={()=>void run('cancel')}>Aanvraag annuleren</button>
   </>}
  </div>
  {pending&&<p className="text-sm">Annuleren of herstellen van een gestarte of onzekere aanvraag kan je persoonlijke koppeling intrekken. Een niet bevestigde vernieuwing wordt niet automatisch herhaald.</p>}
  <p role="status" aria-live="polite">{message}</p>
 </section>;
}
