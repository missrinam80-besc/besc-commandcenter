import {z} from 'zod';
const uuid=z.string().uuid(),at=z.string().datetime({offset:true}),text=(n:number)=>z.string().trim().min(1).max(n),hash=z.string().regex(/^[a-f0-9]{64}$/);
export const vacancyPayloadSchema=z.object({slug:text(160).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),locale:z.enum(['nl-BE','fr-BE','en']),title:text(240).min(2),role_label:text(120).min(2),summary:text(2000),body:z.object({format:z.literal('plain_text'),value:text(12000)}).strict(),location_label:text(250),availability_label:text(500),closes_at:at}).strict();
export const vacancyPublicationSchema=vacancyPayloadSchema.extend({schema_version:z.literal('besc-platform-publication-v1'),type:z.literal('vacancy'),public_id:uuid,revision:z.number().int().positive(),published_at:at,valid_until:at.nullable()}).strict();
export const vacancyListSchema=z.object({schema_version:z.literal('besc-platform-publication-v1'),items:z.array(vacancyPublicationSchema).max(50),next_cursor:z.string().max(2048).nullable()}).strict();
export type Vacancy=z.infer<typeof vacancyPublicationSchema>;
export type VacancyPayload=z.infer<typeof vacancyPayloadSchema>;
export const vacancyOperations={
 'site.configure':z.object({enabled:z.boolean(),reason:text(2000).min(2)}).strict(),
 'vacancy.draft':z.object({dossier_id:uuid.nullable(),form_id:uuid,expected_revision:z.number().int().nonnegative(),payload:vacancyPayloadSchema,proof_document_id:uuid}).strict(),
 'vacancy.submit':z.object({id:uuid,expected_hash:hash}).strict(),
 'vacancy.review':z.object({id:uuid,expected_hash:hash,decision:z.enum(['approved','changes_requested']),reason:text(2000).min(2),rights_confirmed:z.literal(true)}).strict(),
 'vacancy.release':z.object({id:uuid,expected_hash:hash,expected_epoch:z.number().int().nonnegative(),reason:text(2000).min(2),published_at:at.nullable(),valid_until:at.nullable()}).strict(),
 'vacancy.close':z.object({dossier_id:uuid,reason:text(2000).min(2)}).strict(),
};
export function parseVacancyOperation(op:string,data:unknown){if(!Object.hasOwn(vacancyOperations,op))return {success:false as const};return vacancyOperations[op as keyof typeof vacancyOperations].safeParse(data);}
