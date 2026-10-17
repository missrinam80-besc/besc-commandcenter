import { z } from "zod";

const uuid = z.string().uuid();
const snow = z.string().regex(/^[1-9]\d{16,19}$/);
const amount = z.number().int().min(0).max(1_000_000);
const version = z.number().int().min(1);
const reason = z.string().trim().min(1).max(1000);
export const rewardSchemas = {
  grant: z.object({ user_id: uuid, xp: amount, bucks: amount, reason }).strict()
    .refine(d => d.xp + d.bucks > 0, { message: "Vul XP of Bucks in", path: ["xp"] }),
  correct: z.object({ user_id: uuid, entry_id: uuid, reason }).strict(),
  catalog_save: z.object({ id: uuid.optional(), version: version.optional(), title: z.string().trim().min(1).max(120),
    description: z.string().max(2000), price: amount.min(1), stock: amount.nullable(), active: z.boolean() }).strict(),
  rule_save: z.object({ guild_id: snow, kind: z.enum(["text", "voice"]), channel_ids: z.array(snow).max(100),
    xp: amount.max(100_000), bucks: amount.max(100_000), cooldown_seconds: z.number().int().min(60).max(86400),
    daily_xp: amount, daily_bucks: amount, enabled: z.boolean(), version: z.number().int().min(0),
    voice_min_participants: z.number().int().min(1).max(1000).default(2), exclude_muted: z.boolean().default(true),
    exclude_deafened: z.boolean().default(true), exclude_afk: z.boolean().default(true) }).strict()
    .refine(d => d.xp + d.bucks > 0, { path: ["xp"], message: "Vul XP of Bucks in" })
    .refine(d => d.daily_xp >= d.xp && d.daily_bucks >= d.bucks, { path: ["daily_xp"], message: "Daglimieten zijn lager dan de toekenning" })
    .refine(d => !d.enabled || d.channel_ids.length > 0, { path: ["channel_ids"], message: "Kies minstens één kanaal" }),
  levels_save: z.object({ version: z.number().int().min(0), thresholds: z.array(z.number().int().positive().max(9_000_000_000_000)).max(100) }).strict()
    .refine(d => d.thresholds.every((x, i) => i === 0 || x > d.thresholds[i - 1]), { path: ["thresholds"], message: "Levelgrenzen moeten oplopen" }),
  request: z.object({ reward_id: uuid, version }).strict(),
  cancel: z.object({ id: uuid, version }).strict(),
  decide: z.object({ id: uuid, version, decision: z.enum(["approved", "rejected"]), reason: z.string().trim().max(1000) }).strict()
    .refine(d => d.decision !== "rejected" || Boolean(d.reason), { path: ["reason"], message: "Geef een reden voor afwijzen" }),
  fulfill: z.object({ id: uuid, version }).strict(),
  activity: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("text"), channel_id: snow, occurred_at: z.iso.datetime({ offset: true }) }).strict(),
    z.object({ kind: z.literal("voice"), channel_id: snow, occurred_at: z.iso.datetime({ offset: true }),
      started_at: z.iso.datetime({ offset: true }), eligible_participants: z.number().int().min(1).max(1000),
      muted: z.boolean(), deafened: z.boolean(), afk: z.boolean() }).strict(),
  ]),
};
export type RewardOperation = keyof typeof rewardSchemas;
export const rewardStatusLabels: Record<string, string> = {
  pending: "Aangevraagd", approved: "Goedgekeurd", rejected: "Afgewezen", cancelled: "Geannuleerd", fulfilled: "Afgehandeld",
};
export const rewardKindLabels: Record<string, string> = {
  manual: "Handmatige toekenning", correction: "Correctie", activity: "Discordactiviteit", reserve: "Gereserveerd",
  spend: "Besteed", release: "Vrijgegeven", fulfill: "Afgehandeld",
};
export const rewardErrors: Record<string, string> = {
  invalid_fields: "Een veld bevat een ongeldige waarde.", reason_required: "Vul een reden in (maximaal 1000 tekens).",
  linked_membership_required: "Een actief lidmaatschap met actuele Discordkoppeling is vereist.",
  insufficient_bucks: "Er zijn onvoldoende beschikbare Bucks. Houd rekening met bestaande reserveringen.",
  out_of_stock: "Deze beloning is niet meer beschikbaar.", reward_unavailable: "Deze beloning is niet beschikbaar voor aanvragen.",
  stale_version: "Deze gegevens zijn intussen gewijzigd. Controleer de actuele waarden en probeer opnieuw.",
  self_approval_forbidden: "Laat je eigen aanvraag door een andere bevoegde beheerder behandelen.",
  invalid_state: "Deze aanvraag is al behandeld of kan niet meer worden gewijzigd.", stock_reserved: "De voorraad kan niet lager zijn dan het aantal gereserveerde of bestede beloningen.",
  correction_unavailable: "Deze boeking kan niet worden gecorrigeerd of is al gecorrigeerd.",
  idempotency_conflict: "Deze inzending is al met andere gegevens verwerkt. Controleer de historiek.",
  not_found: "De gevraagde beloning, boeking of aanvraag is niet gevonden.", channels_required: "Kies minstens één kanaal.",
  rewards_forbidden: "Je hebt geen toegang tot deze actie.", unavailable: "De Bucks- en XP-module kon niet worden bereikt. Er is geen succes bevestigd.",
  server_unavailable: "Deze Discordserver is niet ingericht binnen je organisatie.",
};
export const rewardFieldLabels: Record<string, string> = {
  user_id: "Deelnemer", entry_id: "Boeking", reason: "Reden", title: "Naam", description: "Uitleg", price: "Prijs", stock: "Voorraad",
  xp: "XP", bucks: "Bucks", daily_xp: "Daglimiet XP", daily_bucks: "Daglimiet Bucks", cooldown_seconds: "Wachttijd",
  guild_id: "Discordserver", channel_ids: "Kanalen", thresholds: "Levelgrenzen", version: "Versie", kind: "Activiteit",
};
