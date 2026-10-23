import { createClient } from '@/lib/supabase/server';
import { pilotReport, pilotReportCsv, type PilotState } from '@/lib/campaign-pilot';
import { pilotSelectionFromQuery } from '@/lib/campaign-pilot-selection';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  const fail = (status: number) => Response.json({ error: 'not_available' }, { status, headers });
  if (process.env.BESC_CAMPAIGNS_PILOT_ENABLED !== 'true') return fail(404);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401);
  const { data: membership } = await supabase.from('organization_members').select('organization_id').eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
  if (!membership) return fail(403);
  const { id } = await params;
  const url = new URL(request.url);
  const allowed = ['revisie', 'metric', 'definition', 'semantics', 'first_start', 'first_end', 'second_start', 'second_end', 'freshness'];
  if ([...url.searchParams.keys()].some(k => !allowed.includes(k) || url.searchParams.getAll(k).length !== 1)) return fail(400);
  const query = Object.fromEntries(url.searchParams);
  const result = query.revisie ? await supabase.rpc('f3_report_revision', { p_organization_id: membership.organization_id, p_campaign_id: id, p_report_id: query.revisie }) : await supabase.rpc('f3_campaign_state', { p_organization_id: membership.organization_id, p_campaign_id: id });
  if (result.error || !result.data?.reader) return fail(403);
  const state = result.data as PilotState & { as_of: string };
  const selection = pilotSelectionFromQuery(query, state.as_of);
  if (!selection) return fail(400);
  return new Response(pilotReportCsv(pilotReport(state, selection)), { headers: { ...headers, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="campagneproef.csv"' } });
}
