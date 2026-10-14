import {randomUUID} from "node:crypto";
import {notFound} from "next/navigation";
import {z} from "zod";
import {createAdminClient} from "@/lib/supabase/admin";
import {slotKinds,type EventTimeSlot} from "@/lib/event-slot-bookings";
import {slotMailReady} from "@/lib/event-slot-server";
import {formatDateTime} from "@/lib/format";
import {SlotPublicForm,SlotVerificationForm} from "@/components/event-slot-public-form";
import "@/components/event-slot-bookings.css";
export const dynamic="force-dynamic";
export const metadata={title:"Tijdslot aanvragen · BESC",robots:{index:false,follow:false},referrer:"no-referrer" as const};
export default async function SlotRegistration({params,searchParams}:{params:Promise<{page:string}>;searchParams:Promise<{aanvraag?:string}>}){
 const {page}=await params,q=await searchParams;if(!z.string().uuid().safeParse(page).success)notFound();
 let data:{title:string;slots:EventTimeSlot[]}|null=null;try{const result=await createAdminClient().rpc("event_slot_public",{pid:page,op:"list",d:{}});if(!result.error)data=result.data;}catch{}
 if(!data)return <main className="slot-public-page"><h1>Inschrijven niet beschikbaar</h1><p>De inschrijfpagina is gesloten of kan tijdelijk niet worden geladen. Neem contact op met de eventeigenaar.</p></main>;
 return <main className="slot-public-page"><header><p className="eyebrow">BESC · CREW & STREAMERS</p><h1>{data.title}</h1><p>Kies een tijdslot. Voorlopige aanvragen tellen mee voor de beschikbare plaatsen. Alle tijden zijn Belgische tijd.</p></header>
 {q.aanvraag&&z.string().uuid().safeParse(q.aanvraag).success&&<SlotVerificationForm page={page} requestId={q.aanvraag}/>}
 {!slotMailReady()&&<p role="alert">De mailverzending is nog niet ingericht. Nieuwe aanvragen zijn tijdelijk niet beschikbaar.</p>}
 <div className="slot-public-grid">{data.slots.map(slot=><section className="slot-public-card" key={slot.id}><span className="badge">{slotKinds[slot.kind]}</span><h2>{slot.title}</h2><p>{formatDateTime(slot.starts_at)} – {formatDateTime(slot.ends_at)}</p>{slot.location&&<p>{slot.location}</p>}{slot.description&&<p className="slot-description">{slot.description}</p>}<p><strong>{slot.available} van {slot.capacity} plaatsen beschikbaar</strong></p>{(slot.available??0)>0&&slotMailReady()?<details><summary>Plek aanvragen</summary><SlotPublicForm page={page} slotId={slot.id} requestId={randomUUID()} canDiscord={process.env.BESC_SLOT_DISCORD_NOTIFICATIONS_ENABLED==="true"}/></details>:<p>Dit slot kan momenteel niet geboekt worden.</p>}</section>)}</div>
 {!data.slots.length&&<p>Er zijn momenteel geen open tijdslots.</p>}</main>;
}
