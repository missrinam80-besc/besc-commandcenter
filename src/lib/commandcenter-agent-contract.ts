import { z } from "zod";

export const TECHNICAL_AGENT_ID = "agt_6ac27fb6af208191a789d9e3ba077ef6";
export const agentJobInput = z.object({ jobId: z.string().uuid() }).strict();
export const agentResultPayload = z.object({
  kind: z.enum(["evaluation", "proposal", "draft"]),
  summary: z.string().min(1).max(2000),
  sourceVersion: z.iso.datetime({ offset: true }),
  findings: z.array(z.object({ statement: z.string().min(1).max(2000),
    classification: z.enum(["confirmed", "uncertain", "proposal"]) }).strict()).max(30),
}).strict();
export const agentResultInput = agentJobInput.extend({
  idempotencyKey: z.string().uuid(), payload: agentResultPayload,
}).strict();
export type AgentIdentity = { userId: string; organizationId: string; grantId: string };
export type AgentTools = {
  readJob: (input: z.infer<typeof agentJobInput>) => Promise<Record<string, unknown>>;
  submitResult: (input: z.infer<typeof agentResultInput>) => Promise<Record<string, unknown>>;
};
