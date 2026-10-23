import {z} from 'zod';
export const partnerRoles=['sponsor','esports','community','event','education','social_impact'] as const;
export const partnerRoleLabels={sponsor:'Sponsor',esports:'Esportsorganisatie',community:'Communitypartner',event:'Eventpartner',education:'Educatieve partner',social_impact:'Maatschappelijke partner'};
const uuid=z.string().uuid(),at=z.string().datetime({offset:true}),text=(max:number)=>z.string().trim().min(2).max(max),hash=z.string().regex(/^[a-f0-9]{64}$/);
export function safePartnerWebsite(value:string){
 if(value.length>2048||/[\u0000-\u0020\\]/.test(value)||!/^https:\/\/[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.[A-Za-z]{2,63}(\/[^\s?#\\]*)?$/.test(value))return false;
 try{const u=new URL(value);return !/\.(local|localhost|internal)$/i.test(u.hostname)&&!/(?:^|\/)(private|sign|token)(?:\/|$)/i.test(u.pathname)&&u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash&&!u.port;}catch{return false;}
}
export const partnerPayloadSchema=z.object({slug:z.string().max(160).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),locale:z.enum(['nl-BE','fr-BE','en']),name:text(180),description:z.string().trim().min(1).max(4000),roles:z.array(z.enum(partnerRoles)).min(1).max(6).refine(a=>new Set(a).size===a.length),website_url:z.string().max(2048).refine(safePartnerWebsite).nullable(),logo:z.object({public_media_id:uuid,alt:text(500),credit:z.string().max(500)}).strict().nullable()}).strict();
export const partnerPublicationSchema=partnerPayloadSchema.extend({schema_version:z.literal('besc-platform-publication-v1'),type:z.literal('partner'),public_id:uuid,revision:z.number().int().positive(),published_at:at,valid_until:at.nullable()}).strict();
export const partnerListSchema=z.object({schema_version:z.literal('besc-platform-publication-v1'),items:z.array(partnerPublicationSchema).max(50),next_cursor:z.string().max(2048).nullable()}).strict();
export type PartnerPublication=z.infer<typeof partnerPublicationSchema>;
export type PartnerPayload=z.infer<typeof partnerPayloadSchema>;
export const partnerOperations={
 'site.configure':z.object({enabled:z.boolean(),reason:text(2000)}).strict(),
 'partner.draft':z.object({partner_id:uuid,expected_revision:z.number().int().nonnegative(),payload:partnerPayloadSchema,role_ids:z.array(uuid).min(1).max(6).refine(a=>new Set(a).size===a.length),proof_document_id:uuid}).strict(),
 'partner.submit':z.object({id:uuid,expected_hash:hash}).strict(),
 'partner.review':z.object({id:uuid,expected_hash:hash,decision:z.enum(['approved','changes_requested']),reason:text(2000),rights_confirmed:z.literal(true)}).strict(),
 'partner.release':z.object({id:uuid,expected_hash:hash,expected_epoch:z.number().int().nonnegative(),reason:text(2000),published_at:at.nullable(),valid_until:at.nullable()}).strict(),
 'partner.withdraw':z.object({partner_id:uuid,reason:text(2000)}).strict(),
};
export function parsePartnerOperation(op:string,data:unknown){if(!Object.hasOwn(partnerOperations,op))return {success:false as const};return partnerOperations[op as keyof typeof partnerOperations].safeParse(data);}
