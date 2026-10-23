import { AppShell } from '@/components/app-shell';
import { CampaignPilotPanel, PilotForm } from '@/components/campaign-pilot-panel';
import { F1Feedback } from '@/components/f1-feedback';
import { requireActiveMembership } from '@/lib/auth-context';
import type { PilotState } from '@/lib/campaign-pilot';
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params, query = await searchParams;
  const { supabase, membership } = await requireActiveMembership();
  const org = membership.organization_id;
  if (process.env.BESC_CAMPAIGNS_PILOT_ENABLED !== 'true') return <AppShell active="Campagnes"><header className="topbar"><h1>Campagneproef</h1></header><div className="module-body"><p>De campagneproef is in deze omgeving uitgeschakeld.</p></div></AppShell>;
  const result = await supabase.rpc('f3_campaign_state', { p_organization_id: org, p_campaign_id: id });
  const { data: caps } = await supabase.rpc('f1_capabilities', { p_organization_id: org });
  if (result.error) return <AppShell active="Campagnes"><header className="topbar"><h1>Campagneproef</h1></header><div className="module-body"><p>De proef is niet beschikbaar of je hebt geen actuele toegang.</p>{query.melding && <F1Feedback error message={query.melding}/>}<p>Alleen een herkenbare fictieve campagne kan worden geopend.</p>{caps?.chair && <PilotForm title="Deze fictieve campagneproef openen" operation="pilot.open" org={org} campaign={id}/>}</div></AppShell>;
  const state = result.data as PilotState;
  const [people, members, docs] = await Promise.all([
    state.editor || state.chair ? supabase.from('community_people').select('id,display_name').eq('organization_id', org).is('deleted_at', null).not('account_user_id', 'is', null).order('display_name').limit(100) : Promise.resolve({ data: [] }),
    state.chair ? supabase.from('organization_members').select('user_id,profiles(display_name)').eq('organization_id', org).eq('status', 'active').limit(100) : Promise.resolve({ data: [] }),
    state.editor || state.chair ? supabase.from('document_registry').select('id,label').eq('organization_id', org).limit(100) : Promise.resolve({ data: [] }),
  ]);
  return <AppShell active="Campagnes"><header className="topbar"><h1>Campagneproef</h1></header><div className="module-body">
    {query.succes && <F1Feedback message="De handeling is opgeslagen. Hieronder staan de actuele gegevens."/>}{(query.fout || query.melding) && <F1Feedback error message={query.melding ?? 'Controleer de velden en gebruik een ondersteunde YouTube-link.'}/>}
    <CampaignPilotPanel state={state} org={org} campaign={id} people={(people.data ?? []).map(p => ({ value: p.id, label: p.display_name }))} members={(members.data ?? []).map(m => ({ value: m.user_id, label: (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles)?.display_name ?? 'Bestaand account' }))} documents={(docs.data ?? []).map(d => ({ value: d.id, label: d.label }))}/>
  </div></AppShell>;
}
