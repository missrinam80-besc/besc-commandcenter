import {z} from 'zod';
const uuid=z.string().uuid(),at=z.string().datetime({offset:true}),hash=z.string().regex(/^[a-f0-9]{64}$/),text=(n:number)=>z.string().trim().min(2).max(n);
// Same conservative publication URL shape, with no fetch or private signed locator.
export const delegationWebsite=z.string().max(2048).regex(/^https:\/\/[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.[A-Za-z]{2,63}(\/[^\s?#\\]*)?$/).refine(u=>{try{const x=new URL(u);return !/[\u0000-\u0020]/.test(u)&&!/\.(local|localhost|internal)$/i.test(x.hostname)&&!/(?:^|\/)(private|sign|token)(?:\/|$)/i.test(x.pathname);}catch{return false;}});
export const delegatedProfileSchema=z.object({name:text(180),description:z.string().trim().min(1).max(4000),website_url:delegationWebsite.nullable()}).strict();
export const delegationOperations={
 'site.configure':z.object({enabled:z.boolean(),reason:text(2000)}).strict(),
 'delegation.assign':z.object({partner_id:uuid,person_id:uuid,proof_document_id:uuid,valid_until:at}).strict(),
 'delegation.revoke':z.object({id:uuid,reason:text(2000)}).strict(),
 'delegation.end':z.object({id:uuid,reason:text(2000)}).strict(),
 'proposal.save':z.object({delegation_id:uuid,expected_revision:z.number().int().nonnegative(),payload:delegatedProfileSchema}).strict(),
 'proposal.submit':z.object({id:uuid,expected_hash:hash}).strict(),
 'proposal.withdraw':z.object({id:uuid,expected_hash:hash}).strict(),
 'proposal.respond':z.object({id:uuid,expected_hash:hash,message:text(2000)}).strict(),
 'proposal.prepare':z.object({id:uuid,expected_hash:hash,expected_partner_revision:z.number().int().nonnegative(),slug:z.string().max(160).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),locale:z.enum(['nl-BE','fr-BE','en']),role_ids:z.array(uuid).min(1).max(6).refine(a=>new Set(a).size===a.length),proof_document_id:uuid}).strict(),
};
export function parseDelegationOperation(op:string,data:unknown){if(!Object.hasOwn(delegationOperations,op))return {success:false as const};return delegationOperations[op as keyof typeof delegationOperations].safeParse(data);}
export const delegationOwnSchema=z.object({schema_version:z.literal('besc-delegation-own-v1'),lease_id:uuid,delegations:z.array(z.object({id:uuid,partner:z.object({name:text(180),website_url:delegationWebsite.nullable()}).strict(),valid_until:at,revision:z.number().int().nonnegative()}).strict()).max(20),proposals:z.array(z.object({id:uuid,revision:z.number().int().positive(),payload:delegatedProfileSchema,payload_sha256:hash,status:z.enum(['draft','submitted','changes_requested','prepared','withdrawn']),message:z.string().max(2000),current_source:z.boolean(),created_at:at}).strict()).max(100)}).strict();
export type DelegationOwn=z.infer<typeof delegationOwnSchema>;
export const proposalLabels={draft:'Eigen concept',submitted:'Ingediend',changes_requested:'Wijzigingen gevraagd',prepared:'Overgenomen als apart BESC-concept',withdrawn:'Ingetrokken'};

export function delegationVersionKey(s:DelegationOwn){return JSON.stringify([s.delegations.map(d=>[d.id,d.partner.name,d.partner.website_url,d.valid_until,d.revision]),s.proposals.map(p=>[p.id,p.status,p.current_source,p.message])]);}
