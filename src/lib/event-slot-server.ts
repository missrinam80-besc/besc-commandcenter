import "server-only";
import {createHash,createHmac,timingSafeEqual,randomUUID} from "node:crypto";
import {createAdminClient} from "@/lib/supabase/admin";
import {googleGmailConfiguration,saveGmailDraft,sendGmailDraft} from "@/lib/google-gmail";
import {googleWorkspaceConfiguration} from "@/lib/google-workspace";
import {deliverSlotEmail,type SlotMessage} from "./event-slot-delivery";
export const slotTokenHash=(token:string)=>createHash("sha256").update(token).digest("hex");
export function slotMailReady(){return Boolean(process.env.SUPABASE_SECRET_KEY)&&googleGmailConfiguration().configured&&googleWorkspaceConfiguration().configured&&(process.env.CRON_SECRET?.length??0)>=32;}
export function slotOrigin(){const value=process.env.NEXT_PUBLIC_SITE_URL;const url=value?new URL(value):null;if(!url||url.protocol!=="https:")throw Error("slot_origin_not_configured");return url.origin;}
export function slotRequestHash(ip:string){if((process.env.CRON_SECRET?.length??0)<32)throw Error("slot_mail_not_configured");return createHmac("sha256",process.env.CRON_SECRET!).update(ip).digest("hex");}
export function slotCronAuthorized(header:string|null){const secret=process.env.CRON_SECRET;if(!secret||secret.length<32||!header)return false;return timingSafeEqual(createHash("sha256").update(header).digest(),createHash("sha256").update(`Bearer ${secret}`).digest());}
export async function flushSlotEmails(bookingId?:string,limit=1){
 if(!slotMailReady())return {sent:0,unconfirmed:0,configured:false};
 const admin=createAdminClient(),worker=`cc-slot-${randomUUID()}`;let sent=0,unconfirmed=0;
 async function operation(op:string,d:Record<string,unknown>){const r=await admin.rpc("event_slot_message",{op,d:{worker,...d}});if(r.error)throw Error("slot_mail_queue_unavailable");return r.data;}
 for(let i=0;i<limit;i++){const signal=AbortSignal.timeout(20000);const result=await deliverSlotEmail({claim:async()=>{const result=await operation("claim",{channel:"email",booking_id:bookingId??null});return result?.id?result as SlotMessage:null;},operation:async(op,m,extra)=>{await operation(op,{id:m.id,lease_token:m.lease_token,...extra});},draft:async m=>(await saveGmailDraft({to:[m.recipient],subject:m.subject,body:m.body},signal)).id,send:async id=>(await sendGmailDraft(id,signal)).id});if(result==="empty")break;if(result==="sent")sent++;else unconfirmed++;}
 return {sent,unconfirmed,configured:true};
}
