import { createHash } from "node:crypto";
import { z } from "zod";

const uuid = z.string().uuid();
const snowflake = z.string().regex(/^[1-9]\d{16,19}$/);
const instant = z.string().datetime({ offset: true });
const text = (max: number) => z.string().trim().min(1).max(max)
  .refine(value => !/[\u0000-\u0008\u000b-\u001f\u007f]|@everyone|@here|<@[!&]?\d+>/i.test(value), "Use plain event text");
const sourceSchema = z.object({
  id: uuid, title: z.string(), status: z.string(), start_at: instant.nullable(),
  end_at: instant.nullable(), deleted_at: z.string().nullable(),
});
const releaseSchema = z.object({
  event_id: uuid, guild_id: snowflake, enabled: z.boolean(),
  public_title: text(100), public_description: text(1000), public_location: text(100),
}).strict();
export type EventDiscordRelease = z.infer<typeof releaseSchema>;
export type EventDiscordProjection = {
  guild_id: string; event_id: string; name: string; description: string;
  scheduled_start_time: string; scheduled_end_time: string;
  privacy_level: 2; entity_type: 3; channel_id: null; entity_metadata: { location: string };
};
export type EventDiscordDecision =
  | { kind: "disabled" | "unavailable" | "not_released" | "not_upcoming" | "invalid_public_fields" }
  | { kind: "ready"; projection: EventDiscordProjection; fingerprint: string };

// A public copy is a separate input. Never copy the private event description,
// attendee roster, expected count, crew, notes or provider credentials into Discord.
// Callers must derive canManageEvents from the current session, not form fields.
export function prepareEventDiscordProjection(source: unknown, release: unknown, context: {
  enabled: boolean; canManageEvents: boolean; guildId: string; now: number;
}): EventDiscordDecision {
  if (!context.enabled) return { kind: "disabled" };
  if (!context.canManageEvents || !Number.isFinite(context.now)) return { kind: "unavailable" };
  const event = sourceSchema.safeParse(source), config = releaseSchema.safeParse(release);
  if (!event.success || !config.success || !snowflake.safeParse(context.guildId).success) return { kind: "invalid_public_fields" };
  const e = event.data, r = config.data;
  if (r.guild_id !== context.guildId || r.event_id !== e.id) return { kind: "unavailable" };
  if (!r.enabled || e.deleted_at !== null || /test[\s_-]*fixture/i.test(e.title)) return { kind: "not_released" };
  if (!["confirmed", "production"].includes(e.status)) return { kind: "not_released" };
  if (!e.start_at || !e.end_at || Date.parse(e.start_at) <= context.now || Date.parse(e.end_at) <= Date.parse(e.start_at)) return { kind: "not_upcoming" };
  const projection: EventDiscordProjection = {
    guild_id: r.guild_id, event_id: e.id, name: r.public_title,
    description: r.public_description, scheduled_start_time: new Date(e.start_at).toISOString(),
    scheduled_end_time: new Date(e.end_at).toISOString(), privacy_level: 2, entity_type: 3,
    channel_id: null, entity_metadata: { location: r.public_location },
  };
  return { kind: "ready", projection, fingerprint: createHash("sha256").update(JSON.stringify(projection)).digest("hex") };
}

export type EventPresenceKind = "interested" | "coming" | "withdrawn" | "attended";
export type EventPresenceSource = "discord_interest" | "self_rsvp" | "staff_check_in";
// These are data semantics, not authentication. A later storage boundary must
// separately enforce self ownership and current staff authority.
export function validEventPresenceMeaning(kind: EventPresenceKind, source: EventPresenceSource): boolean {
  return source === "discord_interest" ? kind === "interested" || kind === "withdrawn"
    : source === "self_rsvp" ? kind === "coming" || kind === "withdrawn"
      : source === "staff_check_in" && kind === "attended";
}
