import { getMcpConfig, mcpRequestLimit, oauthReply } from "@/lib/commandcenter-mcp-runtime";
import { clientRedirects, mcpChallenge, tokenHash, allowedMcpScope, AGENT_COMBINED_SCOPE } from "@/lib/commandcenter-mcp-oauth";
import { createAgentTools } from "@/lib/commandcenter-agent-store";
import { createMcpStore, canReadMcpCommandCenter } from "@/lib/commandcenter-mcp-store";
import { handleCommandCenterMcp } from "@/lib/commandcenter-mcp-server";
import { createAdminClient } from "@/lib/supabase/admin";
export const runtime="nodejs";
export const dynamic="force-dynamic";
async function handle(request:Request) {
  const config=getMcpConfig(); if(!config)return oauthReply({error:"mcp_not_configured"},503);
  return handleCommandCenterMcp(request,{
    origin:config.origin,challenge:mcpChallenge(config),allowRequest:mcpRequestLimit,
    authenticate:async token=>{
      const grant=await createMcpStore().findAccess(tokenHash(token));
      if(!grant || grant.revoked_at || Date.parse(grant.expires_at)<=Date.now() || grant.organization_id!==config.organizationId
        || grant.resource!==config.resource || !allowedMcpScope(grant.scope,config))return null;
      try{clientRedirects(grant.client_id,config);}catch{return null;}
      return await canReadMcpCommandCenter(grant.user_id,config.organizationId)?{userId:grant.user_id,grantId:grant.id,agentResultsWrite:grant.scope===AGENT_COMBINED_SCOPE}:null;
    },
    agentTools:(userId,grantId)=>createAgentTools({userId,grantId,organizationId:config.organizationId}),
    reader:userId=>({organizationId:config.organizationId,userId,origin:config.origin,signingKey:config.signingKey,
      dataState:process.env.COMMANDCENTER_MCP_DATA_STATE??"test",
      readPage:async q=>{
        // Active admin/board is rechecked above. Fixed tenant and column allowlist only.
        let query=createAdminClient().from(q.entity).select(q.fields).eq("organization_id",q.organizationId)
          .is("deleted_at",null).lte("created_at",q.asOf).lte("updated_at",q.asOf).order("id",{ascending:true}).limit(q.limit);
        if(q.after)query=query.gt("id",q.after);
        if(q.id)query=query.eq("id",q.id);
        if(q.query)query=query.ilike(q.titleField,`%${q.query}%`);
        const {data,error}=await query;if(error)throw Error("read_unavailable");
        return (data??[]) as unknown as Record<string,unknown>[];
      }}),
  });
}
export {handle as POST,handle as GET,handle as DELETE};
