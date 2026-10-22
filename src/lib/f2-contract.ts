import {z} from 'zod';
import sanitizeHtml from 'sanitize-html';
const instant=z.string().datetime({offset:true});
const uuid=z.string().uuid();
export const f2MediaSchema=z.object({public_media_id:uuid,alt:z.string().trim().min(2).max(500),credit:z.string().max(500)}).strict();
export const f2BodySchema=z.object({format:z.literal('sanitized_html'),value:z.string().max(32000).refine(v=>safePublicationHtml(v)===v,'Onveilige publicatietekst')}).strict();
export function safePublicationHtml(value:string){const clean=sanitizeHtml(value,{allowedTags:['p','strong','em','ul','ol','li','br'],allowedAttributes:{},allowedSchemes:[],disallowedTagsMode:'discard'}).replaceAll('<br />','<br>');return clean===value.replaceAll('&#39;',"'").replaceAll('&quot;','"')?value:clean;}
export function safeRegistrationUrl(value:string){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&!u.search&&u.port===''&&u.hostname.includes('.')&&!u.hostname.endsWith('.local')&&!u.hostname.endsWith('.internal')&&!/^(localhost|\d+[.]|\[)/.test(u.hostname)&&!/\/(private|sign|token)(\/|$)/i.test(u.pathname);}catch{return false;}}
const common={schema_version:z.literal('besc-website-publication-v1'),public_id:uuid,revision:z.number().int().positive(),slug:z.string().max(160).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),locale:z.enum(['nl-BE','fr-BE','en']),title:z.string().min(2).max(240),summary:z.string().max(2000),body:f2BodySchema,media:z.array(f2MediaSchema).max(10),published_at:instant};
export const f2PublicationSchema=z.discriminatedUnion('type',[
 z.object({...common,type:z.literal('news')}).strict(),
 z.object({...common,type:z.literal('event'),starts_at:instant,ends_at:instant,timezone:z.literal('Europe/Brussels'),location_label:z.string().trim().min(1).max(1000),registration_url:z.string().max(2000).refine(safeRegistrationUrl).nullable()}).strict().refine(v=>Date.parse(v.ends_at)>Date.parse(v.starts_at),'Ongeldige eventtijd')
]);
export type F2Publication=z.infer<typeof f2PublicationSchema>;
export const f2ListSchema=z.object({schema_version:z.literal('besc-website-publication-v1'),items:z.array(f2PublicationSchema).max(50),next_cursor:z.string().max(2048).nullable()}).strict();
const text=z.string().trim().min(2).max(2000),hash=z.string().regex(/^[a-f0-9]{64}$/);
export const f2Operations={
 'site.create':z.object({host:z.literal('website-dev.belgianstreamerscommunity.be'),key_sha256:hash}).strict(),
 'site.state':z.object({site_id:uuid,active:z.boolean()}).strict(),
 'site.key':z.object({site_id:uuid,key_sha256:hash}).strict(),
 'viewer.add':z.object({site_id:uuid,user_id:uuid,eligibility:z.enum(['crew','volunteer']),basis:text,valid_until:instant}).strict(),
 'viewer.withdraw':z.object({id:uuid,reason:text}).strict(),
 'release':z.object({site_id:uuid,revision_id:uuid,expected_hash:hash,expected_epoch:z.number().int().nonnegative(),reason:text,published_at:instant.nullable().optional(),valid_until:instant.nullable().optional()}).strict(),
 'withdraw':z.object({entry_id:uuid,expected_epoch:z.number().int().positive(),reason:text}).strict(),
 'media.withdraw':z.object({public_media_id:uuid,reason:text}).strict()
};
export function f2Feedback(error:{message?:string;code?:string}){if(/conflict/.test(error.message??''))return 'De vrijgave is ondertussen gewijzigd. Vernieuw en beoordeel de actuele versie.';if(error.code==='42501')return 'Je hebt voor deze handeling geen actuele bevoegdheid.';if(/media/.test(error.message??''))return 'De media of mediarechten zijn niet beschikbaar voor deze website.';if(/window|expiry/.test(error.message??''))return 'Controleer de begin- en eindtijd.';return 'De wijziging kon niet worden bevestigd. Controleer de actuele gegevens voordat je opnieuw probeert.';}
