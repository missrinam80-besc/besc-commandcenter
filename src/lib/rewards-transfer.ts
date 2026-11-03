import {createHash} from 'node:crypto';
import {z} from 'zod';
const numeric=z.string().regex(/^(0|[1-9]\d{0,12})$/).refine(s=>BigInt(s)<=BigInt('9000000000000'));
const twitch=z.string().regex(/^twitch:[1-9]\d{0,19}$/);
function csvRows(text:string,header:string){
 if(Buffer.byteLength(text)>262144)throw Error('file_too_large');
 const lines=text.replace(/^\uFEFF/,'').replaceAll('\r\n','\n').trimEnd().split('\n');
 if(lines.shift()!==header||lines.length<1||lines.length>5000)throw Error('invalid_csv');
 return lines.map(line=>{if(line.includes('"')||line.includes('\r'))throw Error('invalid_csv');return line.split(',');});
}
/** Canonical, reviewed export. Native provider exports require a separately reviewed conversion. */
export function prepareTargetRows(exportText:string,mappingText:string,declaredTotal:string){
 const amounts=new Map<string,string>(),mapping=new Map<string,string>(),users=new Set<string>();let total=BigInt(0);
 for(const row of csvRows(exportText,'external_id,bucks')){
  if(row.length!==2||!twitch.safeParse(row[0]).success||!numeric.safeParse(row[1]).success||amounts.has(row[0]))throw Error('invalid_export');
  amounts.set(row[0],row[1]);total+=BigInt(row[1]);
 }
 for(const row of csvRows(mappingText,'external_id,cc_user_id')){
  if(row.length!==2||!twitch.safeParse(row[0]).success||!z.uuid().safeParse(row[1]).success||mapping.has(row[0])||users.has(row[1].toLowerCase())||!amounts.has(row[0]))throw Error('invalid_mapping');
  mapping.set(row[0],row[1].toLowerCase());users.add(row[1].toLowerCase());
 }
 if(mapping.size!==amounts.size||!/^\d{1,20}$/.test(declaredTotal)||BigInt(declaredTotal)!==total)throw Error('total_or_mapping_mismatch');
 return [...amounts].map(([id,target])=>({twitch_user_id:id.slice(7),user_id:mapping.get(id)!,target}));
}
export const transferFileHash=(file:Uint8Array)=>createHash('sha256').update(file).digest('hex');
export const transferActionSchema=z.discriminatedUnion('op',[
 z.object({op:z.literal('prepare'),id:z.uuid(),broadcaster_id:z.string().regex(/^[1-9]\d{0,19}$/),cutoff:z.iso.datetime({offset:true}),declared_total:z.string().regex(/^(0|[1-9]\d{0,19})$/)}).strict(),
 z.object({op:z.enum(['execute','cancel']),id:z.uuid(),plan_sha256:z.string().regex(/^[a-f0-9]{64}$/),reason:z.string().trim().min(1).max(1000),confirmed:z.boolean(),source_stopped:z.boolean(),cutoff_confirmed:z.boolean()}).strict().refine(d=>d.op==='cancel'||d.confirmed&&d.source_stopped&&d.cutoff_confirmed)
]);
export const earningActionSchema=z.discriminatedUnion('op',[
 z.object({op:z.literal('discord_activation'),guild_id:z.string().regex(/^[1-9]\d{16,19}$/),kind:z.enum(['text','voice']),version:z.number().int().positive(),enabled:z.boolean(),reason:z.string().trim().min(1).max(1000)}).strict(),
 z.object({op:z.literal('twitch_activation'),broadcaster_id:z.string().regex(/^[1-9]\d{0,19}$/),kind:z.enum(['follow','cheer']),version:z.number().int().positive(),enabled:z.boolean(),reason:z.string().trim().min(1).max(1000)}).strict(),
 z.object({op:z.literal('twitch_save'),broadcaster_id:z.string().regex(/^[1-9]\d{0,19}$/),kind:z.enum(['follow','cheer']),version:z.number().int().nonnegative(),xp:z.number().int().min(0).max(100000),bucks:z.number().int().min(0).max(100000),daily_xp:z.number().int().min(0).max(1000000),daily_bucks:z.number().int().min(0).max(1000000),cooldown_seconds:z.number().int().min(60).max(86400),minimum_bits:z.number().int().min(1).max(1000000),reason:z.string().trim().min(1).max(1000)}).strict().refine(d=>d.xp+d.bucks>0&&d.daily_xp>=d.xp&&d.daily_bucks>=d.bucks)
]);
