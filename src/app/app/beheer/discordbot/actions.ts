"use server";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {z} from "zod";
import {requirePermission} from "@/lib/auth-context";
import {typeDraftSchema,panelDraftSchema,snowflakeSchema,botConfigErrors} from "@/lib/discord-ticket-config";
const path="/app/beheer/discordbot";
export async function changeDiscordBot(form:FormData){
 const {supabase,membership}=await requirePermission("manageDiscordBot");
 const op=String(form.get("operation")??""),server=String(form.get("server_id")??"");
 if(!["server_create","server_save","activate","pause","verify","check_channel","type_save","type_duplicate","type_archive","panel_save","publish","disable","recover"].includes(op))redirect(path+"?fout=invalid_config");
 const serverId=z.string().uuid().safeParse(server);if(op!=="server_create"&&!serverId.success)redirect(path+"?fout=invalid_config");
 const data:Record<string,unknown>={version:Number(form.get("version")??0)};
 if(form.get("id"))data.id=String(form.get("id"));
 if(["type_save","panel_save"].includes(op)){try{data.draft=(op==="type_save"?typeDraftSchema:panelDraftSchema).parse(JSON.parse(String(form.get("draft")??"")))}catch{redirect(path+"?server="+server+"&fout=invalid_config")}}
 if(["server_create","server_save"].includes(op)){const parsed=z.object({name:z.string().trim().min(1).max(80),applicationId:snowflakeSchema,guildId:snowflakeSchema.optional()}).safeParse({name:form.get("name"),applicationId:form.get("application_id"),...(op==="server_create"?{guildId:form.get("guild_id")}: {})});if(!parsed.success)redirect(path+"?fout=invalid_config");Object.assign(data,parsed.data);}
 if(op==="check_channel"){const c=snowflakeSchema.safeParse(form.get("channel_id"));if(!c.success)redirect(path+"?server="+server+"&fout=channel_required");data.channelId=c.data;}
 if(["publish","disable"].includes(op)&&form.get("confirmation")!=="BEVESTIG")redirect(path+"?server="+server+"&fout=invalid_config");
 const result=await supabase.rpc("discord_bot_staff_action",{p_org:membership.organization_id,p_server:serverId.success?serverId.data:null,p_op:op,p_data:data});
 const code=result.error?"upstream_unavailable":String(result.data?.error??"");
 if(code)redirect(path+"?server="+server+"&fout="+(Object.hasOwn(botConfigErrors,code)?code:"upstream_unavailable"));
 const tab=op.startsWith("type_")?"types":["panel_save","publish","disable","recover"].includes(op)?"panels":"servers";
 const selected=result.data?.id??data.id;const selectedQuery=selected&&op!=="type_archive"?"&"+(tab==="types"?"type":"panel")+"="+String(selected):"";
 revalidatePath(path);redirect(path+"?server="+String(result.data?.serverId??server)+"&tab="+tab+selectedQuery+"&opgeslagen="+encodeURIComponent(op));
}
