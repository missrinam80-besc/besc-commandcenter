import {z} from 'zod';
const uuid=z.string().uuid(),at=z.string().datetime({offset:true}),hash=z.string().regex(/^[a-f0-9]{64}$/),text=(n:number)=>z.string().trim().min(1).max(n);
export const contentLocales=['nl-BE','fr-BE','en'] as const;
export const reservedPageSlugs=['api','auth','login','logout','events','nieuws','creators','samenwerkingen','esports','vrijwilligers','mijn-besc','media','creator-media','partner-media','page-media','robots','favicon','_next'];
const slug=text(160).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).refine(s=>!reservedPageSlugs.includes(s));
export function safeContentTarget(p:string){return p.length<=600&&/^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*)?(?:\?locale=(?:nl-BE|fr-BE|en))?$/.test(p)&&!/^\/(api|auth|login|logout|media|creator-media|partner-media|page-media|_next)(\/|\?|$)/.test(p);}
export function safeLegacyPath(p:string){return p.length<=2000&&p.startsWith('/')&&!p.startsWith('//')&&!/[\\?#\u0000-\u0020]/.test(p)&&!/%(?:2e|2f|5c|25)/i.test(p)&&!/(?:^|\/)\.{1,2}(?:\/|$)/.test(p)&&!/%(?![a-f0-9]{2})/i.test(p);}
export function safeLegacyQuery(q:string){return q.length<=2000&&(q===''||q.split('&').every(x=>/^(?:max-results|updated-max|start|m)=[A-Za-z0-9%:.,_+-]*$/.test(x)&&!/%(?![a-f0-9]{2})/i.test(x)));}
export const legacyHosts=['www.belgianstreamerscommunity.be','belgianstreamerscommunity.be','blog.belgianstreamerscommunity.be'] as const;
export const pagePayloadSchema=z.object({slug,locale:z.enum(contentLocales),title:text(240),summary:text(2000),body:z.object({format:z.literal('plain_text'),value:text(16000)}).strict(),navigation:z.boolean(),links:z.array(z.object({label:text(120),href:text(600).refine(safeContentTarget)}).strict()).max(12),hero:z.object({public_media_id:uuid,alt:text(500).min(2),credit:z.string().max(500)}).strict().nullable()}).strict();
export const redirectPayloadSchema=z.object({old_host:z.enum(legacyHosts),old_path:z.string().refine(safeLegacyPath),old_query:z.string().refine(safeLegacyQuery),mode:z.enum(['redirect','gone']),target_path:z.string().refine(safeContentTarget).nullable()}).strict().refine(p=>p.mode==='gone'?p.target_path===null:!!p.target_path&&p.target_path!==p.old_path+(p.old_query?'?'+p.old_query:''));
export const pagePublicationSchema=pagePayloadSchema.extend({schema_version:z.literal('besc-platform-publication-v1'),type:z.literal('page'),public_id:uuid,revision:z.number().int().positive(),published_at:at,valid_until:at.nullable()}).strict();
export const pageListSchema=z.object({schema_version:z.literal('besc-platform-publication-v1'),items:z.array(pagePublicationSchema).max(50),next_cursor:z.string().max(2048).nullable()}).strict();
export const redirectResolutionSchema=z.object({schema_version:z.literal('besc-legacy-resolution-v1'),public_id:uuid,revision:z.number().int().positive(),status:z.union([z.literal(307),z.literal(410)]),target_path:z.string().refine(safeContentTarget).nullable()}).strict().refine(x=>x.status===410?x.target_path===null:x.target_path!==null);
export const migrationRecordSchema=z.object({batch_id:hash,record_id:z.string().regex(/^URL-[0-9]{3}$/),source_url:text(4000),source_sha256:hash,snapshot_date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),classification:text(60),source_title:z.string().max(500),source_excerpt:z.string().max(6000),proposed_destination:z.string().max(2000).nullable(),source_file:text(300),blockers:z.array(text(300)).max(15)}).strict();
export const contentOperations={
 'site.configure':z.object({pages_enabled:z.boolean(),redirects_enabled:z.boolean(),reason:text(2000).min(2)}).strict(),
 'migration.stage':z.object({record:migrationRecordSchema}).strict(),
 'migration.resolve':z.object({id:uuid,expected_reviews:z.number().int().nonnegative(),decision:z.enum(['mapped','retain_reference','archive','needs_review']),reason:text(2000).min(2),proof_document_id:uuid}).strict(),
 'content.draft':z.object({kind:z.enum(['page','redirect']),dossier_id:uuid.nullable(),expected_revision:z.number().int().nonnegative(),payload:z.union([pagePayloadSchema,redirectPayloadSchema]),proof_document_id:uuid,migration_record_id:uuid.nullable()}).strict().refine(x=>x.kind==='page'?pagePayloadSchema.safeParse(x.payload).success:redirectPayloadSchema.safeParse(x.payload).success),
 'content.submit':z.object({id:uuid,expected_hash:hash}).strict(),
 'content.review':z.object({id:uuid,expected_hash:hash,decision:z.enum(['approved','changes_requested']),reason:text(2000).min(2),rights_confirmed:z.literal(true),facts_confirmed:z.literal(true)}).strict(),
 'content.release':z.object({id:uuid,expected_hash:hash,expected_epoch:z.number().int().nonnegative(),reason:text(2000).min(2),published_at:at.nullable(),valid_until:at.nullable()}).strict(),
 'content.withdraw':z.object({dossier_id:uuid,reason:text(2000).min(2)}).strict(),
};
export function parseContentOperation(op:string,data:unknown){if(!Object.hasOwn(contentOperations,op))return {success:false as const};return contentOperations[op as keyof typeof contentOperations].safeParse(data);}
export type PagePublication=z.infer<typeof pagePublicationSchema>;
export type PagePayload=z.infer<typeof pagePayloadSchema>;
export type RedirectPayload=z.infer<typeof redirectPayloadSchema>;

export const pageNavigationSchema=z.object({schema_version:z.literal('besc-page-navigation-v1'),items:z.array(z.object({public_id:uuid,slug,locale:z.enum(contentLocales),title:text(240),revision:z.number().int().positive()}).strict()).max(50)}).strict();
export function legacyRuntimePath(p:string){return safeLegacyPath(p)&&p!=='/'&&!/^\/(api|auth|login|logout|contact|events|nieuws|creators|samenwerkingen|esports|vrijwilligers|mijn-besc|media|creator-media|partner-media|page-media|assets|robots\.txt|favicon\.ico|_next)(\/|$)/.test(p);}
