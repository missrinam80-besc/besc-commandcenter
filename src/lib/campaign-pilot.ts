import { z } from 'zod';

const uuid = z.string().uuid();
const text = z.string().trim().min(2).max(500);
const timestamp = z.string().datetime({ offset: true });
export const pilotOperationSchemas = {
  'pilot.open': z.object({}).strict(),
  'pilot.close': z.object({}).strict(),
  'report.capture': z.object({}).strict(),
  'access.assign': z.object({ user_id: uuid, role: z.enum(['editor', 'reviewer', 'reader']), valid_until: timestamp }).strict(),
  'access.revoke': z.object({ id: uuid }).strict(),
  'policy.set': z.object({ version: z.number().int().positive(), body: text.max(10000), retention: text.max(4000), fields: z.array(z.enum(['post_url', 'views', 'likes', 'comments', 'reach', 'impressions'])).min(1).max(6), document_id: uuid }).strict(),
  'participant.select': z.object({ person_id: uuid, policy_id: uuid, expires_at: timestamp }).strict(),
  'participant.accept': z.object({ id: uuid, accepted: z.literal(true) }).strict(),
  'participant.withdraw': z.object({ id: uuid }).strict(),
  'post.submit': z.object({ participant_id: uuid, external_id: z.string().regex(/^[A-Za-z0-9_-]{11}$/) }).strict(),
  'post.review': z.object({ id: uuid, expected_revision: z.number().int().positive(), decision: z.enum(['verified', 'rejected']), availability: z.enum(['available', 'private', 'deleted', 'unavailable', 'unknown']), reason: text.max(2000) }).strict(),
  'measurement.record': z.object({ contribution_id: uuid, expected_revision: z.number().int().positive(), metric: z.enum(['views', 'likes', 'comments', 'reach', 'impressions']), definition: text.max(240), semantics: z.enum(['period', 'cumulative']), period_start: timestamp, period_end: timestamp, measured_at: timestamp, value: z.number().finite().min(0).max(1e15 - 1).nullable(), quality: z.enum(['known', 'missing', 'partial', 'stale', 'conflicted']), source_kind: z.enum(['manual', 'export']), source_reference: text, source_document_id: uuid, source_key: text.max(180) }).strict()
    .refine(x => Date.parse(x.period_end) > Date.parse(x.period_start), 'Het einde moet na het begin liggen.')
    .refine(x => x.quality === 'missing' ? x.value === null : x.value !== null, 'Ontbrekend vraagt een lege waarde; gemeten nul blijft nul.'),
};
export type PilotOperation = keyof typeof pilotOperationSchemas;
export function parsePilotOperation(op: string, data: unknown) {
  if (!Object.hasOwn(pilotOperationSchemas, op)) return { success: false as const };
  return pilotOperationSchemas[op as PilotOperation].safeParse(data);
}

// Parse only: never follow an input URL or perform discovery/scraping.
export function parsePilotPostUrl(input: string): { platform: 'youtube'; externalId: string; canonicalUrl: string } | null {
  if (input.length > 2048 || /[\u0000-\u0020\\]/.test(input)) return null;
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return null;
    let id: string | null = null;
    if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)) {
      if (url.pathname === '/watch' && url.searchParams.getAll('v').length === 1) id = url.searchParams.get('v');
      else id = url.pathname.match(/^\/(?:shorts|live)\/([A-Za-z0-9_-]{11})\/?$/)?.[1] ?? null;
    } else if (url.hostname === 'youtu.be') id = url.pathname.match(/^\/([A-Za-z0-9_-]{11})\/?$/)?.[1] ?? null;
    if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
    return { platform: 'youtube', externalId: id, canonicalUrl: `https://www.youtube.com/watch?v=${id}` };
  } catch { return null; }
}

export type PilotPost = { id: string; participant_id: string; canonical_url: string; external_id: string; revision: number; status: string; availability: string; checked_at: string | null };
export type PilotMeasurement = {
  id: string; contribution_id: string; revision: number; metric: string; definition: string; unit: string;
  semantics: 'period' | 'cumulative'; period_start: string; period_end: string; measured_at: string; fetched_at: string;
  value: number | string | null; quality: 'known' | 'missing' | 'partial' | 'stale' | 'conflicted'; source_kind: 'manual' | 'export'; source_reference: string;
};
export type PilotState = {
  synthetic: true; campaign_id: string; chair: boolean; editor: boolean; reviewer: boolean; reader: boolean;
  policies: { id: string; version: number; body: string; fields: string[]; retention: string; withdrawn_at: string | null }[];
  access: { id: string; user_id: string; role: string; valid_until: string; revoked_at: string | null }[];
  excluded_posts?: number;
  participants: { id: string; person_id: string; policy_id: string; accepted_at: string | null; withdrawn_at: string | null; expires_at: string; valid: boolean; own: boolean }[];
  posts: PilotPost[]; measurements: PilotMeasurement[];
};
export type PilotWindow = { start: string; end: string };
export type PilotSelection = { metric: string; definition: string; semantics: 'period' | 'cumulative'; first: PilotWindow; second: PilotWindow; asOf: string; freshnessHours: number };
export function validPilotSelection(s: PilotSelection) {
  const times = [s.first.start, s.first.end, s.second.start, s.second.end, s.asOf].map(Date.parse);
  return times.every(Number.isFinite) && times[0] < times[1] && times[2] < times[3] && times[1] <= times[2]
    && times[3] <= times[4] && Number.isFinite(s.freshnessHours) && s.freshnessHours > 0 && s.freshnessHours <= 8760
    && ['views', 'likes', 'comments', 'reach', 'impressions'].includes(s.metric) && s.definition.length >= 2 && s.definition.length <= 240;
}
export function pilotWindowSummary(state: Pick<PilotState, 'posts' | 'measurements'>, selection: PilotSelection, window: PilotWindow) {
  if (!validPilotSelection(selection)) throw new Error('invalid_selection');
  const verified = state.posts.filter(p => p.status === 'verified');
  let measured = 0, missing = 0, stale = 0, conflicted = 0, partial = 0, sum = 0;
  const rows = verified.map(post => {
    const samples = state.measurements.filter(m => m.contribution_id === post.id && m.revision === post.revision && m.metric === selection.metric && m.definition === selection.definition && m.unit === 'count' && m.semantics === selection.semantics
      && Date.parse(m.period_start) === Date.parse(window.start) && Date.parse(m.period_end) === Date.parse(window.end)
      && Date.parse(m.fetched_at) <= Date.parse(selection.asOf) && Date.parse(m.measured_at) <= Date.parse(selection.asOf));
    samples.sort((a, b) => Date.parse(b.fetched_at) - Date.parse(a.fetched_at) || b.id.localeCompare(a.id));
    const sample = samples[0];
    const unavailable = ['private', 'deleted', 'unavailable', 'unknown'].includes(post.availability);
    const raw = sample?.value;
    const value = raw === null || raw === undefined || raw === '' ? null : Number(raw);
    let quality = unavailable || !sample || value === null ? 'missing' : sample.quality;
    if (sample && quality === 'known' && Date.parse(selection.asOf) - Date.parse(sample.measured_at) > selection.freshnessHours * 3600000) quality = 'stale';
    if (value !== null && (!Number.isFinite(value) || value < 0)) quality = 'conflicted';
    if (quality === 'known' || quality === 'partial') { measured++; sum += value!; if (quality === 'partial') partial++; }
    else if (quality === 'stale') stale++; else if (quality === 'conflicted') conflicted++; else missing++;
    return { postId: post.id, url: post.canonical_url, value, quality, source: sample?.source_kind ?? null, reference: sample?.source_reference ?? null, measurementId: sample?.id ?? null };
  });
  // Reach is never additive across posts. Cumulative values are never period totals.
  const additive = selection.metric !== 'reach' && selection.semantics === 'period';
  return { total: verified.length, candidates: state.posts.filter(p => p.status === 'candidate').length, rejected: state.posts.filter(p => p.status === 'rejected').length,
    measured, missing, stale, conflicted, partial, value: additive && measured > 0 ? sum : null,
    complete: measured === verified.length && verified.length > 0 && !stale && !conflicted && !partial, additive, rows };
}
export function comparePilotValues(before: number | null, after: number | null) {
  if (before === null || after === null) return { delta: null, percent: null };
  return { delta: after - before, percent: before === 0 ? null : (after - before) / before * 100 };
}
export function cumulativePilotDelta(before: number | null, after: number | null, sameDefinition: boolean) {
  if (!sameDefinition || before === null || after === null || after < before) return null;
  return after - before;
}
export function pilotCsvCell(value: unknown): string {
  let text = value === null || value === undefined ? 'Onbekend' : String(value);
  if (/^[\s\uFEFF]*[=+\-@]/u.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function pilotReport(state: PilotState, selection: PilotSelection) {
  const first = pilotWindowSummary(state, selection, selection.first), second = pilotWindowSummary(state, selection, selection.second);
  // Percentages of partial totals would suggest comparable coverage.
  return { synthetic: true, selection, first, second, excluded: state.excluded_posts ?? 0, comparison: first.complete && second.complete ? comparePilotValues(first.value, second.value) : { delta: null, percent: null } };
}
export function pilotReportCsv(report: ReturnType<typeof pilotReport>) {
  const lines: unknown[][] = [['TESTFIXTURE — NIET PUBLICEREN'], ['Venster', 'Begin', 'Einde', 'Metric', 'Definitie', 'Gemeten', 'Totaal', 'Ontbrekend', 'Verouderd', 'Conflict', 'Waarde'],
    ...(['first', 'second'] as const).map(key => { const w = report[key], range = report.selection[key]; return [key, range.start, range.end, report.selection.metric, report.selection.definition, w.measured, w.total, w.missing, w.stale, w.conflicted, w.value]; }),
    ['Venster', 'Post', 'Waarde', 'Kwaliteit', 'Bron', 'Bronreferentie', 'Meting-ID']];
  for (const key of ['first', 'second'] as const) for (const row of report[key].rows) lines.push([key, row.url, row.value, row.quality, row.source, row.reference, row.measurementId]);
  return '\uFEFF' + lines.map(row => row.map(pilotCsvCell).join(',')).join('\r\n');
}
export function pilotFeedback(code?: string) {
  if (/42501|authorized|review_required/.test(code ?? '')) return 'Je hebt voor deze handeling geen actuele bevoegdheid, of er is een andere beoordelaar nodig.';
  if (/40001|revision|conflict|23505/.test(code ?? '')) return 'De gegevens of bronregistratie zijn gewijzigd of bestaan al. Vernieuw en controleer de actuele versie.';
  return 'De handeling kon niet worden bevestigd. Controleer toegang, verklaring, bron en ingevulde velden voordat je opnieuw probeert.';
}
