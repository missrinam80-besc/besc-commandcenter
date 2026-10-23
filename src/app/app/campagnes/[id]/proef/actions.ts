'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { parsePilotOperation, parsePilotPostUrl, pilotFeedback } from '@/lib/campaign-pilot';
import { localDateTimeToIso } from '@/lib/format';

export async function runCampaignPilot(form: FormData) {
  const campaign = String(form.get('campaign_id') ?? '');
  if (!/^[a-f0-9-]{36}$/i.test(campaign)) redirect('/app/campagnes?fout=velden');
  const route = `/app/campagnes/${campaign}/proef`;
  if (process.env.BESC_CAMPAIGNS_PILOT_ENABLED !== 'true') redirect(route + '?fout=uitgeschakeld');
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const data: Record<string, unknown> = {};
  for (const [key, value] of form.entries()) {
    if (!key.startsWith('data_') || typeof value !== 'string') continue;
    const name = key.slice(5);
    if (['version', 'expected_revision', 'value'].includes(name)) data[name] = value.trim() === '' ? null : Number(value);
    else if (name === 'accepted') data[name] = value === 'on';
    else if (name === 'fields') data[name] = value.split(',').map(v => v.trim()).filter(Boolean);
    else if (['valid_until', 'expires_at', 'period_start', 'period_end', 'measured_at'].includes(name)) data[name] = localDateTimeToIso(value);
    else data[name] = value.trim();
  }
  const operation = String(form.get('operation') ?? '');
  if (operation === 'post.submit') {
    const post = parsePilotPostUrl(String(form.get('post_url') ?? ''));
    if (!post) redirect(route + '?fout=link');
    data.external_id = post.externalId;
  }
  const parsed = parsePilotOperation(operation, data);
  if (!parsed.success) redirect(route + '?fout=velden');
  const request = String(form.get('request_id') ?? ''), org = String(form.get('organization_id') ?? '');
  if (!/^[a-f0-9-]{36}$/i.test(request) || !/^[a-f0-9-]{36}$/i.test(org)) redirect(route + '?fout=velden');
  const result = await supabase.rpc('f3_workflow', { p_organization_id: org, p_campaign_id: campaign, p_operation: operation, p_data: parsed.data, p_request_id: request });
  if (result.error) redirect(route + '?melding=' + encodeURIComponent(pilotFeedback(result.error.code)));
  revalidatePath(route);
  if (operation === 'report.capture') redirect(route + '/rapport?revisie=' + encodeURIComponent(String(result.data.id)));
  redirect(route + '?succes=opgeslagen');
}
