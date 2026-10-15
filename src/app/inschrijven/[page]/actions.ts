"use server";
import {after} from "next/server";
import {withBotUpstream} from "@/lib/bot-api-upstream";
import {randomBytes} from "node:crypto";
import {headers} from "next/headers";
import {revalidatePath} from "next/cache";
import {z} from "zod";
import {createAdminClient} from "@/lib/supabase/admin";
import {createClient} from "@/lib/supabase/server";
import {discordIdentityDetails,findIdentity} from "@/lib/profile-identities";
import {slotContactSchema,slotError} from "@/lib/event-slot-bookings";
import {flushSlotEmails,slotMailReady,slotOrigin,slotRequestHash,slotTokenHash} from "@/lib/event-slot-server";
export type SlotActionResult={ok:boolean;message:string};
const empty={ok:false,message:""};
export async function startSlotRequest(_previous:SlotActionResult=empty,fd:FormData):Promise<SlotActionResult>{
 void _previous;
 const parsed=slotContactSchema.extend({page:z.string().uuid()}).safeParse(Object.fromEntries(fd));
 if(!parsed.success)return {ok:false,message:"Vul een naam en geldig e-mailadres in."};
 if(fd.get("website"))return {ok:true,message:"Controleer je mailbox voor de bevestigingslink."};
 if(!slotMailReady())return {ok:false,message:"Inschrijven is tijdelijk niet beschikbaar. De mailverzending is nog niet ingericht."};
 const {page,...values}=parsed.data;
 try{let identity:Record<string,string>={};
 if(values.channel==="discord"){
  if(process.env.BESC_SLOT_DISCORD_NOTIFICATIONS_ENABLED!=="true")return {ok:false,message:"Discordmeldingen zijn nog niet beschikbaar. Kies e-mail."};
  const {r,user,discord,profile}=await withBotUpstream(async fetcher=>{
  const db=await createClient(fetcher),r=await db.auth.getUser(),user=r.data.user;
  const discord=discordIdentityDetails(findIdentity(user?.identities,"discord"));
  const profile=user?await db.from("profiles").select("id,discord_user_id").eq("id",user.id).maybeSingle():null;
  return {r,user,discord,profile};});
  if(r.error||!user?.email_confirmed_at||user.email?.toLowerCase()!==values.email||!discord||profile?.error||profile?.data?.discord_user_id!==discord.userId)return {ok:false,message:"Log in met het account dat bij dit e-mailadres hoort en koppel je Discord-account, of kies e-mail."};
  identity={account_user_id:user.id,discord_user_id:discord.userId};
 }
 const token=randomBytes(32).toString("base64url"),head=await headers();
 // Caddy must overwrite X-Forwarded-For. Use the last trusted proxy hop; never store the raw address.
 const ip=head.get("x-forwarded-for")?.split(",").at(-1)?.trim()||"proxy-address-unavailable";
 const result=await withBotUpstream(async fetcher=>await createAdminClient(fetcher).rpc("event_slot_public",{pid:page,op:"request",d:{...values,...identity,hash:slotTokenHash(token),ip_hash:slotRequestHash(ip),verification_url:`${slotOrigin()}/inschrijven/${page}?aanvraag=${values.id}#code=${token}`}}));
 if(result.error)return {ok:false,message:slotError(result.error)};
 after(async()=>{try{await flushSlotEmails(values.id);}catch{}});
 return {ok:true,message:"Controleer je mailbox. Bij een nieuwe aanvraag ontvang je een bevestigingslink die 30 minuten geldig is. Pas na bevestiging wordt een plek voorlopig gereserveerd."};
 }catch{return {ok:false,message:"De aanvraag kon niet worden bevestigd. Probeer later opnieuw."};}
}
export async function verifySlotRequest(_previous:SlotActionResult=empty,fd:FormData):Promise<SlotActionResult>{
 void _previous;
 const p=z.object({page:z.string().uuid(),id:z.string().uuid(),token:z.string().regex(/^[A-Za-z0-9_-]{43}$/)}).safeParse(Object.fromEntries(fd));
 if(!p.success)return {ok:false,message:"Open de volledige bevestigingslink uit je e-mail."};
 try{const r=await withBotUpstream(async fetcher=>await createAdminClient(fetcher).rpc("event_slot_public",{pid:p.data.page,op:"verify",d:{id:p.data.id,hash:slotTokenHash(p.data.token)}}));if(r.error)return {ok:false,message:slotError(r.error)};
 revalidatePath("/app/events/[id]","page");after(async()=>{try{await flushSlotEmails(p.data.id);}catch{}});
 return {ok:true,message:r.data?.status==="confirmed"?"Deze boeking is al bevestigd.":"Je e-mailadres is bevestigd en je aanvraag is voorlopig gereserveerd. De eventeigenaar beslist over de definitieve bevestiging. Je ontvangt daarover bericht."};
 }catch{return {ok:false,message:"Bevestigen is tijdelijk niet beschikbaar. Probeer het opnieuw."};}
}
