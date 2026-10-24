import {z} from 'zod';
import {vacancyPublicationSchema} from './vacancy-contract.ts';
const uuid=z.string().uuid(),at=z.string().datetime({offset:true}),text=(n:number)=>z.string().trim().min(1).max(n);
export const requestedRoles=['sponsor','esports','community','event','education','social_impact'] as const;
export const intakePayloadSchema=z.object({organization_name:text(180),requested_roles:z.array(z.enum(requestedRoles)).min(1).max(6).refine(a=>new Set(a).size===a.length),message:text(4000)}).strict();
export const contactPayloadSchema=z.object({subject:text(200),message:text(4000)}).strict();
export const volunteerPayloadSchema=z.object({vacancy_public_id:uuid,expected_vacancy_revision:z.number().int().positive(),motivation:text(4000),availability:text(1000)}).strict();
export const intakeStatusSchema=z.enum(['received','in_review','needs_information','rejected','closed','withdrawn']);
export const intakeStatusLabels:Record<z.infer<typeof intakeStatusSchema>,string>={received:'Ontvangen',in_review:'In behandeling',needs_information:'Aanvullende informatie gevraagd',rejected:'Afgewezen',closed:'Administratief afgerond',withdrawn:'Door jou ingetrokken'};
export const intakeRoleLabels:Record<typeof requestedRoles[number],string>={sponsor:'Sponsoring',esports:'Esports',community:'Community',event:'Evenement',education:'Educatie',social_impact:'Maatschappelijke samenwerking'};
export const intakeOperations={
 'contact.configure':z.object({form_id:uuid.nullable(),expected_version:z.number().int().nonnegative(),enabled:z.boolean(),reason:text(2000).min(2)}).strict(),
 'form.create':z.object({category:z.enum(['partnership','volunteer_application','general_contact']).default('partnership'),slug:text(100).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),version:z.number().int().positive(),title:text(180).min(2),notice_version:text(80),notice_body:text(10000).min(10),legal_basis:text(2000).min(2),retention_policy:text(4000).min(2),policy_document_id:uuid,opens_at:at,closes_at:at}).strict().refine(d=>Date.parse(d.closes_at)>Date.parse(d.opens_at)),
 'form.open':z.object({id:uuid,policy_confirmed:z.literal(true),reason:text(2000).min(2)}).strict(),
 'form.close':z.object({id:uuid,reason:text(2000).min(2)}).strict(),
 'handler.assign':z.object({form_id:uuid,user_id:uuid,proof_document_id:uuid,valid_until:at}).strict(),
 'handler.revoke':z.object({id:uuid,reason:text(2000).min(2)}).strict(),
 'application.submit':z.object({form_id:uuid,notice_version:text(80),notice_acknowledged:z.literal(true),payload:z.union([intakePayloadSchema,volunteerPayloadSchema,contactPayloadSchema])}).strict(),
 'application.withdraw':z.object({id:uuid,expected_version:z.number().int().positive()}).strict(),
 'application.reply':z.object({id:uuid,expected_version:z.number().int().positive(),message:text(4000)}).strict(),
 'application.claim':z.object({id:uuid,expected_version:z.number().int().positive()}).strict(),
 'application.update':z.object({id:uuid,expected_version:z.number().int().positive(),status:z.enum(['in_review','needs_information','rejected','closed']),own_message:z.string().max(4000),internal_note:z.string().max(4000)}).strict().refine(d=>d.status!=='needs_information'||d.own_message.trim().length>=2),
};
export function parseIntakeOperation(op:string,data:unknown){if(!Object.hasOwn(intakeOperations,op))return {success:false as const};return intakeOperations[op as keyof typeof intakeOperations].safeParse(data);}
const snapshot=z.object({title:text(180),version:z.number().int().positive(),notice_version:text(80),notice_body:text(10000),legal_basis:text(2000),retention_policy:text(4000)}).strict();
const summary=z.object({id:uuid,title:text(180),category:z.enum(['partnership','volunteer_application','general_contact']),version:z.number().int().positive(),status:intakeStatusSchema,created_at:at,updated_at:at}).strict();
export const intakeOwnSchema=z.object({schema_version:z.literal('besc-intake-own-v1'),lease_id:uuid,forms:z.array(snapshot.extend({id:uuid,category:z.enum(['partnership','volunteer_application','general_contact']),closes_at:at,vacancies:z.array(z.object({public_id:uuid,slug:text(160),locale:z.enum(['nl-BE','fr-BE','en']),title:text(240),revision:z.number().int().positive()}).strict()).max(3).optional()}).strict()).max(50),applications:z.array(summary).max(100)}).strict();
const detailBase=summary.omit({title:true}).extend({schema_version:z.literal('besc-intake-detail-v1'),lease_id:uuid,form:snapshot,events:z.array(z.object({version:z.number().int().positive(),kind:z.enum(['application.submit','application.claim','application.update','application.reply','application.withdraw']),status:intakeStatusSchema,message:z.string().max(4000),created_at:at}).strict()).max(101)});
export const intakeDetailSchema=z.discriminatedUnion('category',[
 detailBase.extend({category:z.literal('general_contact'),payload:contactPayloadSchema}).strict(),
 detailBase.extend({category:z.literal('partnership'),payload:intakePayloadSchema}).strict(),
 detailBase.extend({category:z.literal('volunteer_application'),payload:volunteerPayloadSchema,vacancy:vacancyPublicationSchema}).strict(),
]);
export type IntakeOwn=z.infer<typeof intakeOwnSchema>;
export type IntakeDetail=z.infer<typeof intakeDetailSchema>;
