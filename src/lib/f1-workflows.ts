import { z } from 'zod';

const uuid=z.string().uuid();
const text=z.string().trim().min(2).max(4000);
const optionalId=uuid.nullable().optional();
const source={source_type:z.enum(['deadline','meeting']),source_id:uuid,expected_revision:z.number().int().positive()};
const hash=z.string().regex(/^[0-9a-f]{64}$/);
const https=z.string().url().refine(v=>v.startsWith('https://'),'Gebruik een https-link.');
export const f1RoleLabels={governance_editor:'Governancedossiers behandelen',consent_registrar:'Doelen en verklaringen beheren',publication_editor:'Publieke concepten voorbereiden',publication_reviewer:'Publieke revisies beoordelen',partner_editor:'Partnerrollen beheren'} as const;
export const partnerRoleLabels={sponsor:'Sponsor',esports:'Esportsorganisatie',community:'Communitypartner',event:'Eventpartner',education:'Educatieve partner',social_impact:'Maatschappelijke partner'} as const;
export const f1OperationSchemas={
 'identity.verify':z.object({member_id:uuid,person_id:uuid,account_user_id:uuid,proof_document_id:uuid,expected_revision:z.number().int().positive()}).strict(),
 'identity.revoke':z.object({id:uuid,reason:text}).strict(),
 'identity.assign':z.object({user_id:uuid,role:z.enum(Object.keys(f1RoleLabels) as [keyof typeof f1RoleLabels,...(keyof typeof f1RoleLabels)[]])}).strict(),
 'identity.unassign':z.object({id:uuid}).strict(),
 'governance.evidence':z.object({document_id:uuid,source_version:text.max(500),preserved_reference:https,evidence_type:z.enum(['official_rule','execution','appointment','meeting_decision','other']),content_sha256:hash.nullable().optional()}).strict(),
 'governance.evidence_check':z.object({id:uuid,reason:text}).strict(),
 'governance.evidence_withdraw':z.object({id:uuid,reason:text}).strict(),
 'governance.review':z.object({...source,dimension:z.enum(['rule','applicability','execution']),outcome:z.enum(['verified','applicable','not_applicable','uncertain','demonstrated']),evidence_id:optionalId,reason:text,conflict_declared:z.boolean()}).strict().refine(v=>v.dimension==='rule'?['verified','uncertain'].includes(v.outcome):v.dimension==='applicability'?['applicable','not_applicable','uncertain'].includes(v.outcome):['demonstrated','uncertain'].includes(v.outcome),'Kies een beoordeling die bij dit onderdeel past.'),
 'governance.decide':z.object({...source,rule_review_id:uuid,applicability_review_id:uuid,execution_review_id:optionalId,body:text.max(10000),authority_basis:text.max(2000),governing_body:text.max(200),task_id:optionalId,conflict_declared:z.boolean()}).strict(),
 'consent.purpose':z.object({purpose_code:z.enum(['public_profile','campaign_participation','private_platform_insights']),text_version:z.number().int().positive(),title:text.max(180),body:text.min(10).max(10000),allowed_scope:z.record(z.string(),z.unknown()),legal_basis:text.max(2000),retention_policy:text,policy_document_id:uuid}).strict(),
 'consent.activate_purpose':z.object({id:uuid,policy_confirmed:z.literal(true)}).strict(),
 'consent.withdraw_purpose':z.object({id:uuid,policy_confirmed:z.literal(true)}).strict(),
 'consent.give':z.object({purpose_id:uuid,scope:z.record(z.string(),z.unknown()),accepted:z.literal(true),expires_at:z.string().datetime().nullable().optional()}).strict(),
 'consent.record_external':z.object({purpose_id:uuid,scope:z.record(z.string(),z.unknown()),person_id:uuid,external_evidence_id:uuid,expires_at:z.string().datetime().nullable().optional()}).strict(),
 'consent.withdraw':z.object({id:uuid,reason:z.string().max(2000).nullable().optional()}).strict(),
 'partner.role':z.object({partner_id:uuid,role:z.enum(Object.keys(partnerRoleLabels) as [keyof typeof partnerRoleLabels,...(keyof typeof partnerRoleLabels)[]]),valid_from:z.string().date().nullable().optional(),valid_until:z.string().date().nullable().optional(),proof_document_id:optionalId}).strict(),
 'partner.revoke':z.object({id:uuid}).strict(),
 'partner.relate':z.object({partner_id:uuid,source_type:z.enum(['campaign','event']),source_id:uuid,contribution_role:z.enum(Object.keys(partnerRoleLabels) as [keyof typeof partnerRoleLabels,...(keyof typeof partnerRoleLabels)[]])}).strict(),
 'partner.campaign':z.object({values:z.record(z.string(),z.unknown()),deliverables:z.array(z.string().trim().min(2).max(240)).max(100),contribution_role:z.enum(Object.keys(partnerRoleLabels) as [keyof typeof partnerRoleLabels,...(keyof typeof partnerRoleLabels)[]])}).strict(),
 'publication.draft':z.object({source_type:z.enum(['event','news']),source_id:uuid,expected_revision:z.number().int().positive(),payload:z.record(z.string(),z.unknown()),consent_id:optionalId,media_rights_document_id:optionalId}).strict(),
 'publication.submit':z.object({id:uuid,expected_hash:hash}).strict(),
 'publication.withdraw':z.object({id:uuid,expected_hash:hash}).strict(),
 'publication.revoke_media':z.object({document_id:uuid,reason:text.max(2000)}).strict(),
 'publication.review':z.object({id:uuid,expected_hash:hash,decision:z.enum(['approved_for_publication','changes_requested']),reason:text,rights_confirmed:z.literal(true)}).strict(),
};
export type F1Operation=keyof typeof f1OperationSchemas;
export function parseF1Operation(operation:string,data:unknown){
 if(!Object.hasOwn(f1OperationSchemas,operation))return {success:false as const,message:'Deze handeling is niet beschikbaar.'};
 const parsed=f1OperationSchemas[operation as F1Operation].safeParse(data);
 return parsed.success?{success:true as const,operation:operation as F1Operation,data:parsed.data}:{success:false as const,message:parsed.error.issues[0]?.message??'Controleer de ingevulde velden.'};
}
export function f1Feedback(error: {code?:string;message?:string}|null|undefined){
 const message=error?.message??'';
 if(/conflict_requires/.test(message))return 'Een aangegeven persoonlijk belang vraagt eerst een expliciete bestuursbeslissing.';
 if(/f1_official_rule_required/.test(message))return 'Voor deze regelbeoordeling is een gecontroleerde officiële regelbron vereist.';
 if(/revision|request_conflict/.test(message)||error?.code==='40001')return 'De gegevens zijn ondertussen gewijzigd. Vernieuw de pagina en beoordeel de actuele versie.';
 if(/chair|authorized|access_required|not_allowed|editor_required/.test(message)||error?.code==='42501')return 'Je hebt voor deze handeling geen actuele bevoegdheid.';
 if(/evidence|proof|reviews_required|execution_required/.test(message))return 'Het vereiste bewijs of de beoordeling ontbreekt of is niet meer geldig.';
 if(/purpose|consent|policy|scope/.test(message))return 'Het doel, de verklaring of het beleidsbesluit is niet beschikbaar of niet geldig.';
 if(/partner|contribution/.test(message))return 'Kies een actuele partnerrol en een expliciete bijdrage.';
 if(/functional_account/.test(message))return 'Een functioneel account kan niet als persoon worden gekoppeld. Controleer eerst de bestaande persoonsdossiers.';
 if(/unknown_deadline/.test(message))return 'Vermeld waarom de termijn nog onbekend is.';
 if(/public_|media_|source_event_time|event_source_time/.test(message))return 'Controleer de publieke inhoud, brongegevens, tijden en mediarechten.';
 if(/23505/.test(error?.code??''))return 'Deze actuele koppeling of versie bestaat al.';
 return 'De wijziging kon niet worden bevestigd. Controleer de actuele gegevens voordat je opnieuw probeert.';
}
export const escapeF1Text=(value:string)=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
export function f1BodyFromText(value:string){return value.split(/\r?\n\s*\r?\n/).map(p=>`<p>${escapeF1Text(p).replaceAll('\n','<br>')}</p>`).join('');}
export function safeF1Preview(value:unknown){if(typeof value!=='string')return '';return /[<>]/.test(value.replace(/<\/?(?:p|strong|em|ul|ol|li|br)\s*\/?>/gi,''))?escapeF1Text(value):value;}
export function f1PublicPayloadValid(value:unknown,type:'event'|'news'){
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const p=value as Record<string,unknown>;const allowed=['title','summary','body','slug','locale','media',...(type==='event'?['starts_at','ends_at','timezone','location_label','registration_url']:[])];
 if(Object.keys(p).some(k=>!allowed.includes(k))||typeof p.title!=='string'||p.title.trim().length<2||typeof p.slug!=='string'||!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.slug)||!['nl-BE','fr-BE','en'].includes(String(p.locale)))return false;
 if(p.title.length>240||p.slug.length>160||('summary'in p&&(typeof p.summary!=='string'||p.summary.length>2000)))return false;
 const body=p.body as {format?:string;value?:unknown}|undefined;if(body?.format!=='sanitized_html'||typeof body.value!=='string'||body.value.length>32000||Object.keys(body).some(k=>!['format','value'].includes(k))||safeF1Preview(body.value)!==body.value)return false;
 if(type==='event'&&(typeof p.starts_at!=='string'||typeof p.ends_at!=='string'||!Number.isFinite(Date.parse(p.starts_at))||!Number.isFinite(Date.parse(p.ends_at))||Date.parse(p.ends_at)<=Date.parse(p.starts_at)||p.timezone!=='Europe/Brussels'))return false;
 if('registration_url'in p&&p.registration_url!==''&&(typeof p.registration_url!=='string'||!/^https:\/\/[^\s]+$/.test(p.registration_url)||/(localhost|127\.|\/sign\/|\/private\/)/i.test(p.registration_url)))return false;
 return Array.isArray(p.media)&&p.media.length<=10&&p.media.every(m=>m&&typeof m==='object'&&Object.keys(m).every(k=>['url','alt','credit'].includes(k))&&typeof m.url==='string'&&/^https:\/\/[^\s?#]+$/.test(m.url)&&!/(localhost|127\.|\/sign\/|\/private\/)/i.test(m.url)&&typeof m.alt==='string'&&m.alt.trim().length>=2&&m.alt.length<=500&&(!('credit'in m)||(typeof m.credit==='string'&&m.credit.length<=500)));
}
