import Link from 'next/link';
import {requireActiveMembership} from '@/lib/auth-context';
import {operationsSchema,attentionCount} from '@/lib/operations-status';
export async function OperationsNotice(){
 const {supabase,membership}=await requireActiveMembership();if(membership.role!=='admin')return null;
 const result=await supabase.rpc('ops_read_status',{p_organization_id:membership.organization_id});const parsed=operationsSchema.safeParse(result.data);
 if(result.error||!parsed.success)return <div className="permission-note" role="status">De systeembewaking kan geen actuele status bevestigen. <Link href="/app/administratie/systeemstatus">Bekijk systeemstatus</Link></div>;
 const count=attentionCount(parsed.data);if(!count)return null;
 return <div className="permission-note" role="status">Systeembewaking: controleer de waarschuwingen en ontbrekende koppelingen ({count}). <Link href="/app/administratie/systeemstatus">Bekijk waarschuwingen</Link></div>;
}
