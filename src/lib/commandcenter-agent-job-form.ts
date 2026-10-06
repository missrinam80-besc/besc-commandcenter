import { z } from "zod";

export const createAgentJobForm = z.object({
  // Existing OAuth grants used arbitrary 128-bit IDs stored as PostgreSQL UUIDs.
  // Keep those connections usable; ownership, scope and expiry are checked separately.
  grant_id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
  idempotency_key: z.string().uuid(),
  request: z.string().trim().min(5).max(4000),
  source_entity: z.enum(["projects", "events"]),
  source_id: z.string().uuid(),
  source_version: z.iso.datetime({ offset: true }),
});
