import { z } from 'zod';
export const eventSyncEnabled=()=>process.env.BESC_DISCORD_EVENTS_ENABLED==='true';
export const eventRsvpEnabled=()=>process.env.BESC_EVENT_RSVP_ENABLED==='true';
const uuid=z.string().uuid(),snow=z.string().regex(/^[1-9]\d{16,19}$/);
const settings=z.object({guild_id:snow,enabled:z.boolean(),rsvp_enabled:z.boolean(),version:z.number().int().positive()}).nullable();
const publication=z.object({id:uuid,enabled:z.boolean(),rsvp_enabled:z.boolean(),public_title:z.string(),public_description:z.string(),public_location:z.string(),revision:z.number().int().nonnegative(),discord_event_id:snow.nullable(),guild_id:snow,sync_state:z.string(),last_error:z.string().nullable(),interest_observed_at:z.string().nullable(),interested_count:z.number(),coming_count:z.number(),attended_count:z.number(),presence_count:z.number().int().nonnegative()}).nullable();
export const eventDiscordContextSchema=z.object({settings,publication,people:z.array(z.object({user_id:uuid,display_name:z.string().nullable(),status:z.enum(['coming','withdrawn']),audience:z.enum(['crew','participant','volunteer','visitor']),attended_at:z.string().nullable(),version:z.number().int().positive()})),servers:z.array(z.object({guild_id:snow,name:z.string()})),can_configure:z.boolean()});
export type EventDiscordContext=z.infer<typeof eventDiscordContextSchema>;
export const eventPublicInfoSchema=z.object({id:uuid,revision:z.number().int().positive(),title:z.string(),description:z.string(),location:z.string(),start_at:z.string(),end_at:z.string(),rsvp_open:z.boolean(),discord_url:z.string().regex(/^https:\/\/discord\.com\/events\/[1-9]\d{16,19}\/[1-9]\d{16,19}$/).nullable()}).nullable();
export const eventOwnPresenceSchema=z.object({status:z.enum(['coming','withdrawn']),version:z.number().int().positive(),attended_at:z.string().nullable()}).nullable();
export function eventAttendancePath(id:string){if(!uuid.safeParse(id).success)throw Error('invalid_event');return '/events/aanmelden/'+id;}
export function eventDiscordUrl(guild:string,id:string|null){return snow.safeParse(guild).success&&snow.safeParse(id).success?'https://discord.com/events/'+guild+'/'+id:null;}
export function eventSiteOrigin(){const u=new URL(process.env.NEXT_PUBLIC_SITE_URL??'');if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw Error('event_origin_unavailable');return u.origin;}
