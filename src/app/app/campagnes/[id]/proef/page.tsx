import { AppShell } from '@/components/app-shell';
import { CampaignPilotPanel, PilotForm } from '@/components/campaign-pilot-panel';
import { F1Feedback } from '@/components/f1-feedback';
import { requireActiveMembership } from '@/lib/auth-context';
import { campaignWorkflowEnabled, type PilotState } from '@/lib/campaign-pilot';
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params, query = await searchParams;
  const { supabase, membership } = await requireActiveMembership();
  const org = membership.organization_id;
  if (!campaignWorkflowEnabled()) return <AppShell active="Campagnes"><header className="topbar"><h1>Campagnebijdragen en metingen</h1></header><div className="module-body"><p>Campagnebijdragen en metingen zijn in deze omgeving uitgeschakeld.</p></div></AppShell>;
  const result = await supabase.rpc('f3_campaign_state', { p_organization_id: org, p_campaign_id: id });
  const { data: caps } = await supabase.rpc('f1_capabilities', { p_organization_id: org });
  if (result.error) {
    const { data: docs } = caps?.chair ? await supabase.from('document_registry').select('id,label').eq('organization_id',org).limit(100) : { data: [] };
    return <AppShell active="Campagnes"><header className="topbar"><h1>Campagnebijdragen en metingen</h1></header><div className="module-body"><p>De campagne is niet beschikbaar of je hebt geen actuele toegang.</p>{query.melding && <F1Feedback error message={query.melding}/>}
      {caps?.chair && <><p>Openen registreert een expliciet besluit voor deze campagne. Taken, deelnemers, verklaringen en bronnen worden daarna afzonderlijk vastgelegd.</p>
        {campaignWorkflowEnabled(true) && <PilotForm title="Deze fictieve campagneproef openen" operation="pilot.open" org={org} campaign={id}/>}
        {campaignWorkflowEnabled(false) && <PilotForm title="Deze campagne voor bijdragen en metingen openen" operation="campaign.open" org={org} campaign={id} fields={[{name:'data_document_id',label:'Vastgelegd besluit voor deze campagne',choices:(docs ?? []).map(d => ({value:d.id,label:d.label}))}]}/>}
      </>}
    </div></AppShell>;
  }
  const state = result.data as PilotState;
  if (!campaignWorkflowEnabled(state.synthetic)) return <AppShell active="Campagnes"><header className="topbar"><h1>Campagnebijdragen en metingen</h1></header><div className="module-body"><p>Deze campagnevorm is in deze omgeving uitgeschakeld.</p></div></AppShell>;
  const [people, members, docs, accounts] = await Promise.all([
    state.editor || state.chair ? supabase.from('community_people').select('id,display_name').eq('organization_id', org).is('deleted_at', null).not('account_user_id', 'is', null).order('display_name').limit(100) : Promise.resolve({ data: [] }),
    state.chair ? supabase.from('organization_members').select('user_id,profiles(display_name)').eq('organization_id', org).eq('status', 'active').limit(100) : Promise.resolve({ data: [] }),
    state.editor || state.chair ? supabase.from('document_registry').select('id,label').eq('organization_id', org).limit(100) : Promise.resolve({ data: [] }),
    state.chair && !state.synthetic ? supabase.from('social_accounts').select('id,account_name').eq('organization_id',org).eq('platform','twitch').eq('status','connected').is('deleted_at',null).limit(100) : Promise.resolve({data: []}),
  ]);
  return <AppShell active="Campagnes"><header className="topbar"><h1>{state.synthetic ? 'Campagneproef' : 'Campagnebijdragen en metingen'}</h1></header><div className="module-body">
    {query.succes && <F1Feedback message="De handeling is opgeslagen. Hieronder staan de actuele gegevens."/>}{(query.fout || query.melding) && <F1Feedback error message={query.melding ?? 'Controleer de velden en gebruik een ondersteunde Twitch- of YouTube-link.'}/>}
    <CampaignPilotPanel state={state} org={org} campaign={id} people={(people.data ?? []).map(p => ({ value: p.id, label: p.display_name }))} members={(members.data ?? []).map(m => ({ value: m.user_id, label: (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles)?.display_name ?? 'Bestaand account' }))} documents={(docs.data ?? []).map(d => ({ value: d.id, label: d.label }))} accounts={(accounts.data ?? []).map(a => ({value:a.id,label:a.account_name}))} twitchCollectionEnabled={process.env.BESC_CAMPAIGN_TWITCH_COLLECTION_ENABLED === 'true'}/>
  </div></AppShell>;
}
