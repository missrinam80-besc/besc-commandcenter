import {z} from 'zod';
const uuid=z.string().uuid(),reason=z.string().trim().min(2).max(2000),version=z.number().int().positive();
const channel={channel_id:uuid,expected_version:version,reason};
export const publicWebsiteOperations={
 'channel.create':z.object({site_id:uuid,origin:z.string().regex(/^https:\/\/[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/),key_sha256:z.string().regex(/^[a-f0-9]{64}$/),reason}).strict(),
 'channel.state':z.object({...channel,enabled:z.boolean()}).strict(),
 'channel.key':z.object({...channel,key_sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict(),
 'grant.add':z.object({...channel,kind:z.enum(['news','event','page']),entry_id:uuid,revision_id:uuid,entry_epoch:version}).strict(),
 'grant.withdraw':z.object({...channel,grant_id:uuid}).strict()
};
