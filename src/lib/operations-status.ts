import {z} from 'zod';
export const targetLabels={web:'Webserver',bot:'Botserver',database:'Cloud-database'} as const;
export const checkLabels={disk:'Vrije schijfruimte',memory:'Beschikbaar geheugen',inodes:'Bestandsruimte',container_cc:'Command Center',container_website:'Website',container_caddy:'HTTPS-proxy',container_bot:'Discordbot',http_cc:'Bereikbaarheid Command Center',http_website:'Bereikbaarheid website',docker:'Containerbeheer',systemd:'Systeemdiensten',log_rotation:'Containerlogs begrensd',database:'Database bereikbaar',long_transactions:'Langlopende transacties',clock_sync:'Tijdsynchronisatie',journal_limit:'Systeemlog begrensd',probe:'Bewakingsverbinding',https_cc:'HTTPS-toegang Command Center',https_website:'HTTPS-toegang website'} as const;
export const statusLabels={ok:'In orde',warning:'Aandacht nodig',critical:'Storing',pending:'Nog niet gekoppeld',stale:'Geen actuele meting'} as const;
const level=z.enum(['ok','warning','critical']);
const check=z.object({code:z.enum(Object.keys(checkLabels) as [keyof typeof checkLabels,...(keyof typeof checkLabels)[]]),level}).strict();
export const operationsSchema=z.array(z.object({target:z.enum(['web','bot','database']),observed_at:z.string().datetime({offset:true}).nullable(),received_at:z.string().datetime({offset:true}).nullable(),status:z.enum(['ok','warning','critical','pending','stale']),metrics:z.record(z.string(),z.number().finite().nonnegative()),checks:z.array(check).max(24),transitions:z.array(z.object({at:z.string().datetime({offset:true}),status:level,checks:z.array(check).max(24)}).strict()).max(20)}).strict()).length(3).refine(rows=>new Set(rows.map(r=>r.target)).size===3);
export type OperationsRow=z.infer<typeof operationsSchema>[number];
export function currentStatus(row:OperationsRow,now=Date.now()):keyof typeof statusLabels{
 if(!row.observed_at)return 'pending';
 if(now-Date.parse(row.observed_at)>15*60*1000)return 'stale';
 return row.status;
}
export function attentionCount(rows:OperationsRow[],now=Date.now()){return rows.filter(r=>currentStatus(r,now)!=='ok').length;}
