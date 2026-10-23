import {z} from 'zod';
export const creatorFields=['display_name','bio','platform_links','disciplines','languages','avatar'] as const;
const uuid=z.string().uuid(),instant=z.string().datetime({offset:true}),slug=z.string().max(160).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
export function safeCreatorLink(platform:string,value:string){
 if(value.length>2048||/[\u0000-\u0020\\]/.test(value))return false;
 const patterns:Record<string,RegExp>={twitch:/^https:\/\/(?:www\.)?twitch\.tv\/[A-Za-z0-9_]{1,25}\/?$/,youtube:/^https:\/\/(?:www\.)?youtube\.com\/(?:@[A-Za-z0-9_.-]{1,100}|channel\/[A-Za-z0-9_-]{1,100})\/?$/,kick:/^https:\/\/(?:www\.)?kick\.com\/[A-Za-z0-9_-]{1,60}\/?$/,tiktok:/^https:\/\/(?:www\.)?tiktok\.com\/@[A-Za-z0-9_.]{1,60}\/?$/};
 if(!patterns[platform]?.test(value))return false;
 return platform!=='twitch'||!['login','signup','directory','settings','videos','downloads','search','inventory','wallet','subscriptions'].includes(new URL(value).pathname.replaceAll('/','').toLowerCase());
}
export const creatorLinkSchema=z.object({platform:z.enum(['twitch','youtube','kick','tiktok']),url:z.string().max(2048)}).strict().refine(x=>safeCreatorLink(x.platform,x.url),'Gebruik een directe https-profielpagina van het gekozen platform, zonder trackingparameters.');
const avatar=z.object({public_media_id:uuid,alt:z.string().trim().min(2).max(500),credit:z.string().max(500)}).strict();
export const creatorPayloadSchema=z.object({slug,locale:z.enum(['nl-BE','fr-BE','en']),display_name:z.string().trim().min(2).max(120),bio:z.string().max(2000).optional(),platform_links:z.array(creatorLinkSchema).max(8).optional(),disciplines:z.array(z.string().trim().min(1).max(60)).max(12).optional(),languages:z.array(z.string().trim().min(1).max(30)).max(8).optional(),avatar:avatar.nullable().optional()}).strict();
export const creatorPublicationSchema=creatorPayloadSchema.extend({schema_version:z.literal('besc-platform-publication-v1'),type:z.literal('creator'),public_id:uuid,revision:z.number().int().positive(),published_at:instant,valid_until:instant.nullable()}).strict();
export type CreatorPayload=z.infer<typeof creatorPayloadSchema>;
export type CreatorPublication=z.infer<typeof creatorPublicationSchema>;
export const creatorListSchema=z.object({schema_version:z.literal('besc-platform-publication-v1'),items:z.array(creatorPublicationSchema).max(50),next_cursor:z.string().max(2048).nullable()}).strict();
const reason=z.string().trim().min(2).max(2000),hash=z.string().regex(/^[a-f0-9]{64}$/);
const scope=z.object({fields:z.array(z.enum(creatorFields)).min(1).max(6).refine(a=>a.includes('display_name')&&new Set(a).size===a.length)}).strict();
export const creatorOperations={
 'site.configure':z.object({own_enabled:z.boolean(),read_enabled:z.boolean(),reason}).strict(),
 'access.assign':z.object({person_id:uuid,valid_until:instant,may_view:z.boolean(),proof_document_id:uuid}).strict(),
 'access.revoke':z.object({id:uuid,reason}).strict(),
 'profile.save':z.object({expected_revision:z.number().int().nonnegative(),payload:creatorPayloadSchema}).strict(),
 'profile.submit':z.object({id:uuid,expected_hash:hash,consent_id:uuid}).strict(),
 'consent.give':z.object({purpose_id:uuid,scope,accepted:z.literal(true)}).strict(),
 'consent.withdraw':z.object({id:uuid,reason}).strict(),
 'profile.review':z.object({id:uuid,expected_hash:hash,decision:z.enum(['approved','changes_requested']),reason,rights_confirmed:z.literal(true)}).strict(),
 'profile.release':z.object({id:uuid,expected_hash:hash,expected_epoch:z.number().int().nonnegative(),reason,published_at:instant.nullable().optional(),valid_until:instant.nullable().optional()}).strict(),
 'profile.withdraw':z.object({profile_id:uuid,reason}).strict(),
};
export type CreatorOperation=keyof typeof creatorOperations;
export function parseCreatorOperation(op:string,data:unknown){if(!Object.hasOwn(creatorOperations,op))return {success:false as const};return creatorOperations[op as CreatorOperation].safeParse(data);}
export const creatorOwnSchema=z.object({lease_id:uuid,profile_id:uuid.nullable(),revision:z.number().int().nonnegative(),may_view:z.boolean(),purposes:z.array(z.object({id:uuid,text_version:z.number().int().positive(),title:z.string().max(180),body:z.string().max(10000),allowed_scope:scope,retention_policy:z.string().max(4000)}).strict()).max(100),consents:z.array(z.object({id:uuid,purpose_id:uuid,scope,recorded_at:instant,valid:z.boolean()}).strict()).max(200),revisions:z.array(z.object({id:uuid,revision:z.number().int().positive(),payload:creatorPayloadSchema,payload_sha256:hash,status:z.enum(['draft','submitted','changes_requested','approved','withdrawn']),created_at:instant,current_access:z.boolean()}).strict()).max(200),entries:z.array(z.object({public_id:uuid,slug,revision_id:uuid,epoch:z.number().int().positive(),available:z.boolean()}).strict()).max(3)}).strict();
export type CreatorOwnState=z.infer<typeof creatorOwnSchema>;
export function creatorFeedback(message?:string){if(/rate_limited/.test(message??''))return 'Je hebt te snel meerdere verzoeken gedaan. Wacht even en controleer de actuele toestand.';if(/conflict/.test(message??''))return 'De versie is gewijzigd of dit verzoek werd anders gebruikt. Vernieuw en controleer je voorstel.';if(/independent/.test(message??''))return 'Een andere bevoegde persoon moet dit voorstel beoordelen.';if(/consent|confirmation/.test(message??''))return 'Controleer de actuele doeltekst en je persoonlijke veldkeuze.';return 'De handeling kon niet worden bevestigd. Controleer toegang, rechten en actuele gegevens voordat je opnieuw probeert.';}
