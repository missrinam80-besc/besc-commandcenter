import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { canReadMcpCommandCenter } from "@/lib/commandcenter-mcp-store";
import { AGENT_COMBINED_SCOPE } from "@/lib/commandcenter-mcp-oauth";
import { type AgentIdentity, type AgentTools } from "@/lib/commandcenter-agent-contract";
import { getMcpConfig } from "@/lib/commandcenter-mcp-runtime";

export async function assertAgentAccess(identity: AgentIdentity) {
  const config=getMcpConfig();
  if(!config || identity.organizationId!==config.organizationId)throw Error("agent_resource_denied");
  if (process.env.COMMANDCENTER_AGENT_RESULTS_ENABLED !== "true" || process.env.COMMANDCENTER_MCP_DATA_STATE !== "ready") throw Error("agent_not_enabled");
  if (!await canReadMcpCommandCenter(identity.userId, identity.organizationId)) throw Error("agent_access_denied");
  const { data, error } = await createAdminClient().from("commandcenter_mcp_oauth_grants").select("id")
    .eq("id", identity.grantId).eq("user_id", identity.userId).eq("organization_id", identity.organizationId)
    .eq("scope", AGENT_COMBINED_SCOPE).eq("resource",config.resource).is("revoked_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (error || !data) throw Error("agent_grant_denied");
}
export function createAgentTools(identity: AgentIdentity): AgentTools {
  return {
    async readJob({ jobId }) {
      await assertAgentAccess(identity);
      const { data, error } = await createAdminClient().from("agent_jobs")
        .select("id,agent_id,request,source_snapshot,expires_at,result_received_at")
        .eq("id",jobId).eq("organization_id",identity.organizationId).eq("created_by",identity.userId)
        .eq("grant_id",identity.grantId).gt("expires_at",new Date().toISOString()).maybeSingle();
      if (error || !data) throw Error("agent_job_denied");
      return { ...data, coverage:"header_metadata_only", rules:["Geen formele dossierwijzigingen.","Ontbrekende inhoud als onzeker melden.","Schrijf het resultaat terug via submit_commandcenter_agent_result."] };
    },
    async submitResult({ jobId, idempotencyKey, payload }) {
      await assertAgentAccess(identity);
      const { data, error } = await createAdminClient().rpc("submit_commandcenter_agent_result", {
        p_actor:identity.userId,p_org:identity.organizationId,p_grant:identity.grantId,
        p_job:jobId,p_key:idempotencyKey,p_payload:payload,
      });
      if (error || !data) throw Error("agent_result_rejected");
      return { resultId:data.id, jobId:data.job_id, receivedAt:data.created_at, review:"pending", dossierChanged:false };
    },
  };
}
