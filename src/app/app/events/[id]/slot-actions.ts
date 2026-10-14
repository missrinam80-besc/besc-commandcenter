"use server";
import {z} from "zod";
import {revalidatePath} from "next/cache";
import {requireActiveMembership} from "@/lib/auth-context";
import {slotSchema,slotContactSchema,slotError} from "@/lib/event-slot-bookings";
import {flushSlotEmails,slotMailReady,slotOrigin} from "@/lib/event-slot-server";
import type {SlotActionResult} from "@/app/inschrijven/[page]/actions";
async function ownerOperation(fd:FormData,op:string,data:Record<string,unknown>):Promise<SlotActionResult>{
 const event=z.string().uuid().safeParse(fd.get("event_id"));if(!event.success)return {ok:false,message:"Ongeldig event."};
 const {supabase,membership}=await requireActiveMembership();
 const r=await supabase.rpc("event_slot_owner",{o:membership.organization_id,eid:event.data,op,d:data});
 if(r.error)return {ok:false,message:slotError(r.error)};
 revalidatePath(`/app/events/${event.data}`);if(["book","decide","retry_message"].includes(op)&&r.data?.id){try{await flushSlotEmails(r.data.id,2);}catch{}}
 return {ok:true,message:"Opgeslagen."};
}
export async function saveEventTimeSlot(_state:SlotActionResult,fd:FormData):Promise<SlotActionResult>{const p=slotSchema.safeParse({...Object.fromEntries(fd),is_open:fd.get("is_open")==="on"});if(!p.success)return {ok:false,message:p.error.issues[0]?.message??"Controleer de slotgegevens."};return ownerOperation(fd,"save_slot",p.data);}
export async function publishEventSlots(_state:SlotActionResult,fd:FormData):Promise<SlotActionResult>{const published=fd.get("published")==="true";if(published){try{if(!slotMailReady())throw Error();slotOrigin();}catch{return {ok:false,message:"Configureer eerst de mailverzending, de HTTPS-site-URL en de beveiligde berichtenworker."};}}return ownerOperation(fd,"page",{published});}
export async function bookEventSlotForPerson(_state:SlotActionResult,fd:FormData):Promise<SlotActionResult>{const p=slotContactSchema.safeParse(Object.fromEntries(fd));if(!p.success)return {ok:false,message:"Vul een naam en geldig e-mailadres in."};return ownerOperation(fd,"book",p.data);}
export async function decideEventSlotBooking(_state:SlotActionResult,fd:FormData):Promise<SlotActionResult>{const p=z.object({id:z.string().uuid(),slot_id:z.string().uuid(),status:z.enum(["confirmed","rejected","cancelled"])}).safeParse(Object.fromEntries(fd));if(!p.success)return {ok:false,message:"Ongeldige boeking of beslissing."};return ownerOperation(fd,"decide",p.data);}

export async function retryEventSlotMessage(_state:SlotActionResult,fd:FormData):Promise<SlotActionResult>{const id=z.string().uuid().safeParse(fd.get("id"));if(!id.success)return {ok:false,message:"Ongeldig bericht."};return ownerOperation(fd,"retry_message",{id:id.data});}
