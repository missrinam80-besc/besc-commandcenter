'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { campaignWorkflowEnabled, parsePilotOperation, parsePilotPostUrl, pilotFeedback } from '@/lib/campaign-pilot';
import { localDateTimeToIso } from '@/lib/format';
import { requireActiveMembership } from '@/lib/auth-context';
import { createAdminClient } from '@/lib/supabase/admin';
import { CampaignSourceError, collectCampaignTwitch } from '@/lib/campaign-twitch';

export async function runCampaignPilot(form: FormData) {
  const campaign = String(form.get('campaign_id') ?? '');
  if (!/^[a-f0-9-]{36}$/i.test(campaign)) redirect('/app/campagnes?fout=velden');
  const route = `/app/campagnes/${campaign}/proef`;
  if (!campaignWorkflowEnabled()) redirect(route + '?fout=uitgeschakeld');
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const data: Record<string, unknown> = {};
  for (const [key, value] of form.entries()) {
    if (!key.startsWith('data_') || typeof value !== 'string') continue;
    const name = key.slice(5);
    if (['version', 'expected_revision', 'value', 'daily_limit'].includes(name)) data[name] = value.trim() === '' ? null : Number(value);
    else if (name === 'accepted') data[name] = value === 'on';
    else if (name === 'fields') data[name] = value.split(',').map(v => v.trim()).filter(Boolean);
    else if (['valid_until', 'expires_at', 'period_start', 'period_end', 'measured_at'].includes(name)) data[name] = localDateTimeToIso(value);
    else data[name] = value.trim();
  }
  const operation = String(form.get('operation') ?? '');
  if (operation === 'campaign.open' && !campaignWorkflowEnabled(false)) redirect(route + '?fout=uitgeschakeld');
  if (operation === 'pilot.open' && !campaignWorkflowEnabled(true)) redirect(route + '?fout=uitgeschakeld');
  if (operation === 'post.submit') {
    const post = parsePilotPostUrl(String(form.get('post_url') ?? ''));
    if (!post) redirect(route + '?fout=link');
    data.external_id = post.externalId;
    data.platform = post.platform;
  }
  const parsed = parsePilotOperation(operation, data);
  if (!parsed.success) redirect(route + '?fout=velden');
  const request = String(form.get('request_id') ?? ''), org = String(form.get('organization_id') ?? '');
  if (!/^[a-f0-9-]{36}$/i.test(request) || !/^[a-f0-9-]{36}$/i.test(org)) redirect(route + '?fout=velden');
  if (!['pilot.open','campaign.open'].includes(operation)) {
    const state = await supabase.rpc('f3_campaign_state', { p_organization_id: org, p_campaign_id: campaign });
    if (state.error || !campaignWorkflowEnabled(state.data.synthetic)) redirect(route + '?fout=uitgeschakeld');
  }
  const result = await supabase.rpc('f3_workflow', { p_organization_id: org, p_campaign_id: campaign, p_operation: operation, p_data: parsed.data, p_request_id: request });
  if (result.error) redirect(route + '?melding=' + encodeURIComponent(pilotFeedback(result.error.code)));
  revalidatePath(route);
  if (operation === 'report.capture') redirect(route + '/rapport?revisie=' + encodeURIComponent(String(result.data.id)));
  redirect(route + '?succes=opgeslagen');
}

export async function runCampaignTwitch(form: FormData) {
  const { supabase, membership } = await requireActiveMembership();
  const campaign = String(form.get('campaign_id') ?? ''), source = String(form.get('source_id') ?? ''), contribution = String(form.get('contribution_id') ?? ''), request = String(form.get('request_id') ?? '');
  if (![campaign,source,contribution,request].every(v => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v))) redirect('/app/campagnes?fout=velden');
  const route = `/app/campagnes/${campaign}/proef`;
  if (!campaignWorkflowEnabled(false) || process.env.BESC_CAMPAIGN_TWITCH_COLLECTION_ENABLED !== 'true') redirect(route + '?melding=' + encodeURIComponent('De Twitch-bronregistratie is nog niet ingeschakeld.'));
  const { data: ticket, error } = await supabase.rpc('f3_twitch_begin', { p_organization_id: membership.organization_id, p_campaign_id: campaign, p_source_id: source, p_contribution_id: contribution, p_request_id: request });
  if (error || !ticket?.id) redirect(route + '?melding=' + encodeURIComponent('Bronregistratie niet gestart. Controleer de taak, bronkoppeling, deelname en verzoeklimiet.'));
  if (ticket.status !== 'new') redirect(route + '?melding=' + encodeURIComponent('Dit verzoek is al verwerkt of gereserveerd. Vernieuw om de actuele bronstatus te zien.'));
  const admin = createAdminClient();
  let message = 'De Twitch-meting is opgeslagen.';
  try {
    const stored = await admin.rpc('read_social_account_credentials', { p_account_id: ticket.account_id });
    const credentials = Array.isArray(stored.data) ? stored.data[0] : stored.data;
    if (stored.error || !credentials?.access_token) throw new CampaignSourceError('token_invalid');
    const sample = await collectCampaignTwitch({ accessToken: credentials.access_token, clientId: process.env.TWITCH_CLIENT_ID ?? '', broadcasterId: ticket.broadcaster_id, externalId: ticket.external_id });
    const committed = await admin.rpc('f3_twitch_finish', { p_run_id: ticket.id, p_sample: sample, p_error: null });
    if (committed.error) message = 'De bronmeting is niet opgeslagen: de toegang, bron of bijdrage kan tijdens het ophalen zijn gewijzigd.';
  } catch (error) {
    const code = error instanceof CampaignSourceError ? error.code : 'network';
    await admin.rpc('f3_twitch_finish', { p_run_id: ticket.id, p_sample: null, p_error: code });
    message = code === 'token_invalid' || code === 'identity_mismatch' ? 'De Twitch-bronkoppeling is niet meer geldig. Controleer het account bij Integraties en leg zo nodig opnieuw een bronkoppeling vast.' : 'De Twitch-bron kon niet worden gelezen. Eerdere waarnemingen blijven als historie bewaard; er is geen nulwaarde ingevuld. Controleer de bronstatus voordat je opnieuw ophaalt.';
  }
  revalidatePath(route);
  redirect(route + '?melding=' + encodeURIComponent(message));
}
