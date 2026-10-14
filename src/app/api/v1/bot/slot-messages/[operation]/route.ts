import {withBotUpstream} from "@/lib/bot-api-upstream";
import {createAdminClient} from "@/lib/supabase/admin";
import {createBotStore} from "@/lib/bot-api-store";
import {parseBotClients} from "@/lib/bot-api";
import {handleSlotBotRequest} from "@/lib/event-slot-bot-api";
export const runtime="nodejs";
export async function POST(request:Request){try{return await withBotUpstream(fetcher=>{const db=createAdminClient(fetcher);return handleSlotBotRequest(request,{clients:parseBotClients(process.env.BESC_BOT_CLIENTS_JSON),identity:createBotStore(db),store:{async operation(op,d){const r=await db.rpc("event_slot_message",{op,d});if(r.error)throw Error("slot_delivery_unavailable");return r.data??{};}}});},{signal:request.signal});}catch{return Response.json({error:{code:"upstream_unavailable"}},{status:503,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});}}
