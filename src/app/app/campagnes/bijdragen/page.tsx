import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { requireActiveMembership } from '@/lib/auth-context';
import { campaignWorkflowEnabled } from '@/lib/campaign-pilot';

export default async function Page() {
  const { supabase, membership } = await requireActiveMembership();
  const enabled = campaignWorkflowEnabled();
  const result = enabled ? await supabase.rpc('f3_my_campaigns', { p_organization_id: membership.organization_id }) : null;
  const campaigns = (result?.data as { id: string; title: string; synthetic: boolean }[] | null ?? []).filter(c => campaignWorkflowEnabled(c.synthetic));
  return <AppShell active="Mijn werk"><header className="topbar"><h1>Mijn campagnebijdragen en beoordelingen</h1></header><div className="module-body">
    <p>Hier staan campagnes waarvoor je een actuele campagnetaak of eigen deelname hebt.</p>
    {!enabled ? <p>Campagnebijdragen zijn in deze omgeving uitgeschakeld.</p> : result?.error ? <p>Je campagnes kunnen momenteel niet worden opgehaald.</p> : campaigns.length === 0 ? <p>Er staan momenteel geen campagnes voor je klaar.</p> : <ul>{campaigns.map(c => <li key={c.id}><Link href={`/app/campagnes/${c.id}/proef`}>{c.title}</Link>{c.synthetic && ' · Fictieve proef'}</li>)}</ul>}
  </div></AppShell>;
}
