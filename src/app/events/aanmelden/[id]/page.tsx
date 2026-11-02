import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { eventSyncEnabled,eventRsvpEnabled,eventPublicInfoSchema,eventOwnPresenceSchema } from '@/lib/event-discord';
import { saveOwnEventPresence,eventSignIn } from './actions';
export const dynamic='force-dynamic';
export const revalidate=0;
export const metadata={title:'BESC · Aanmelden voor een event',robots:{index:false,follow:false}};
export default async function EventAttendance({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|undefined>>}){
 const {id}=await params;if(!z.string().uuid().safeParse(id).success||!eventSyncEnabled())notFound();
 const q=await searchParams,db=await createClient(),r=await db.rpc('event_public_info',{i:id}),parsed=eventPublicInfoSchema.safeParse(r.data);
 if(r.error||!parsed.success)return <main className="card" style={{maxWidth:800,margin:'2rem auto',padding:'1.5rem'}}><h1>Even niet beschikbaar</h1><p>De actuele eventgegevens konden niet worden bevestigd. Probeer later opnieuw.</p></main>;
 const info=parsed.data,user=(await db.auth.getUser()).data.user;
 const ownResult=user?await db.rpc('event_presence_own',{i:id,op:'read',d:{}}):null;
 const ownParsed=eventOwnPresenceSchema.safeParse(ownResult?.data??null),own=ownParsed.success&&!ownResult?.error?ownParsed.data:null;
 if(!info&&!own)notFound();
 const open=Boolean(info?.rsvp_open&&eventRsvpEnabled());
 const date=(value:string)=>new Date(value).toLocaleString('nl-BE',{timeZone:'Europe/Brussels',dateStyle:'full',timeStyle:'short'});
 return <main className="card" style={{maxWidth:800,margin:'2rem auto',padding:'1.5rem'}}><p>BESC · Evenement</p><h1>{info?.title??'Deze aanmeldpagina is gesloten'}</h1>
 {q.opgeslagen&&<p role="status">Je keuze is opgeslagen.</p>}{q.fout&&<p role="alert">{q.fout==='aanmelden'?'Aanmelden is niet gelukt. Gebruik je persoonlijke BESC-account.':'De wijziging kon niet worden bevestigd. Bekijk de actuele gegevens voordat je opnieuw probeert.'}</p>}
 {info&&<><p style={{whiteSpace:'pre-wrap'}}>{info.description}</p><p>{date(info.start_at)} – {date(info.end_at)} (Belgische tijd)</p><p>Locatie: {info.location}</p>{info.discord_url&&<p><a href={info.discord_url} target="_blank" rel="noreferrer">Bekijk het Discord-event</a></p>}</>}
 <p>Discord ‘Interested’ geeft interesse aan. ‘Ik kom’ is je eigen aanmelding. Werkelijke aanwezigheid wordt afzonderlijk door een eventbeheerder bevestigd.</p>
 <p>Je aanmelding is gekoppeld aan je BESC-account en zichtbaar voor eventbeheerders. Je kunt ‘ik kom’ weer intrekken. Eerder bevestigde werkelijke aanwezigheid blijft apart geregistreerd.</p>
 {user?<><p>Mijn aanmelding: {own?.status==='coming'?'Ik kom':own?.status==='withdrawn'?'Ingetrokken':'Nog niet aangemeld'}</p>{own?.attended_at&&<p>Werkelijke aanwezigheid is bevestigd.</p>}{ownResult?.error&&<p>Je account kan momenteel geen persoonlijke aanmelding vastleggen. Gebruik een bevestigd persoonlijk BESC-account.</p>}
 {open&&own?.status!=='coming'&&!ownResult?.error&&<form action={saveOwnEventPresence}><input type="hidden" name="publication_id" value={id}/><input type="hidden" name="operation" value="coming"/><input type="hidden" name="expected_version" value={own?.version??0}/><input type="hidden" name="expected_revision" value={info?.revision??0}/><button className="primary">Ik kom</button></form>}
 {own?.status==='coming'&&<form action={saveOwnEventPresence}><input type="hidden" name="publication_id" value={id}/><input type="hidden" name="operation" value="withdraw"/><input type="hidden" name="expected_version" value={own.version}/><input type="hidden" name="expected_revision" value={info?.revision??0}/><button>Mijn aanmelding intrekken</button></form>}</>:open?<><h2>Aanmelden met je BESC-account</h2><form action={eventSignIn}><input type="hidden" name="publication_id" value={id}/><label>E-mailadres<input type="email" name="email" required autoComplete="email"/></label><label>Wachtwoord<input type="password" name="password" required autoComplete="current-password"/></label><button className="primary">Inloggen en terugkeren naar dit event</button></form><form action={eventSignIn}><input type="hidden" name="publication_id" value={id}/><input type="hidden" name="provider" value="discord"/><button>Doorgaan met Discord</button></form><p>Nog geen account? <Link href="/login#registreren">Vraag een BESC-account aan</Link>, bevestig je e-mailadres en keer daarna terug naar deze eventlink. Interne CC-toegang is voor deze aanmelding niet nodig.</p></>:null}
 {!open&&<p>Aanmelden voor dit event is gesloten.</p>}
 </main>;
}
