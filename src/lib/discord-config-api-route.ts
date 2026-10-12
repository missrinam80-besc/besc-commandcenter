import {parseBotClients} from "@/lib/bot-api";
import {withBotUpstream} from "@/lib/bot-api-upstream";
import {createAdminClient} from "@/lib/supabase/admin";
import {createBotStore} from "@/lib/bot-api-store";
import {handleDiscordConfigRequest} from "@/lib/discord-config-api";
export async function discordConfigRoute(request:Request){try{return await withBotUpstream(fetcher=>{const db=createAdminClient(fetcher);return handleDiscordConfigRequest(request,{clients:parseBotClients(process.env.BESC_BOT_CLIENTS_JSON),identity:createBotStore(db),store:{async operation(org,client,guild,operation,data){const r=await db.rpc("discord_bot_operation",{p_org:org,p_client:client,p_guild:guild,p_op:operation,p_data:data});if(r.error||!r.data)throw Error("config_store_unavailable");return r.data;}}});},{signal:request.signal});}catch{return Response.json({error:{code:"upstream_unavailable"}},{status:503,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}})}}
