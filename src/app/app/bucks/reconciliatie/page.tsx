import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { requireActiveMembership } from '@/lib/auth-context';
import { hasPermission } from '@/lib/permissions';
import { parseBalanceSnapshot } from '@/lib/balance-reconciliation';
import { BalanceReconciliationPanel } from '@/components/balance-reconciliation-panel';
export const dynamic='force-dynamic';
export default async function Reconciliation(){
 const {supabase,membership}=await requireActiveMembership();if(!hasPermission(membership,'manageRewards'))redirect('/app/bucks?fout=rewards_forbidden');
 if(process.env.BESC_REWARDS_RECONCILIATION_ENABLED!=='true')return <AppShell active="BESC Bucks en XP"><header className="topbar"><h1>Saldovergelijking</h1></header><div className="module-body"><p>De voorbereiding van saldovergelijkingen staat nog uit.</p></div></AppShell>;
 const result=await supabase.rpc('f5_reward_snapshot',{p_org:membership.organization_id});let snapshot=null;try{if(result.error)throw Error();snapshot=parseBalanceSnapshot(result.data);}catch{}
 return <AppShell active="BESC Bucks en XP"><header className="topbar"><h1>Saldovergelijking voorbereiden</h1></header><div className="module-body">{snapshot?<BalanceReconciliationPanel snapshot={snapshot}/>:<p>De saldostand kon niet veilig worden vastgelegd. Er is niets gewijzigd.</p>}</div></AppShell>;
}
