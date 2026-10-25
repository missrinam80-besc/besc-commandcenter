import {z} from 'zod';
import {pagePayloadSchema} from './site-content-contract.ts';

export const ownPageDraftsSchema=z.object({items:z.array(z.object({
 dossier_id:z.string().uuid(),revision_id:z.string().uuid(),
 revision:z.number().int().positive(),status:z.literal('draft'),payload:pagePayloadSchema,
}).strict()).max(50)}).strict();
