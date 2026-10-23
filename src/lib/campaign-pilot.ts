import { z } from 'zod';

const uuid = z.string().uuid();
const text = z.string().trim().min(2);
const timestamp = z.string().datetime({ offset: true });
export const campaignMetrics = ['views', 'likes', 'comments', 'reach', 'impressions', 'engagements', 'shares', 'current_viewers'] as const;
export function campaignWorkflowEnabled(synthetic?: boolean) { return synthetic === true ? process.env.BESC_CAMPAIGNS_PILOT_ENABLED === 'true' : synthetic === false ? process.env.BESC_CAMPAIGNS_ENABLED === 'true' : process.env.BESC_CAMPAIGNS_PILOT_ENABLED === 'true' || process.env.BESC_CAMPAIGNS_ENABLED === 'true'; }
export const pilotOperationSchemas = {
  'pilot.open': z.object({}).strict(),
  'campaign.open': z.object({ document_id: uuid }).strict(),
  'source.assign': z.object({ participant_id: uuid, account_id: uuid, document_id: uuid, daily_limit: z.number().int().min(3).max(100) }).strict(),
  'source.revoke': z.object({ id: uuid }).strict(),
  'pilot.close': z.object({}).strict(),
  'report.capture': z.object({}).strict(),
  'access.assign': z.object({ user_id: uuid, role: z.enum(['editor', 'reviewer', 'reader']), valid_until: timestamp }).strict(),
  'access.revoke': z.object({ id: uuid }).strict(),
  'policy.set': z.object({ version: z.number().int().positive(), body: text.max(10000), retention: text.max(4000), fields: z.array(z.enum(['post_url', ...campaignMetrics])).min(1).max(9), document_id: uuid }).strict(),
  'participant.select': z.object({ person_id: uuid, policy_id: uuid, expires_at: timestamp }).strict(),
  'participant.accept': z.object({ id: uuid, accepted: z.literal(true) }).strict(),
  'participant.withdraw': z.object({ id: uuid }).strict(),
  'post.submit': z.object({ participant_id: uuid, platform: z.enum(['youtube','twitch']).optional(), external_id: z.string().max(108) }).strict().refine(x => (x.platform ?? 'youtube') === 'youtube' ? /^[A-Za-z0-9_-]{11}$/.test(x.external_id) : /^(?:video:\d{1,30}|clip:[A-Za-z0-9_-]{1,100}|channel:[a-z0-9_]{1,25})$/.test(x.external_id)),
  'post.review': z.object({ id: uuid, expected_revision: z.number().int().positive(), decision: z.enum(['verified', 'rejected']), availability: z.enum(['available', 'private', 'deleted', 'unavailable', 'unknown']), reason: text.max(2000) }).strict(),
  'measurement.record': z.object({ contribution_id: uuid, expected_revision: z.number().int().positive(), metric: z.enum(campaignMetrics), definition: text.max(240), semantics: z.enum(['period', 'cumulative', 'instant']), period_start: timestamp, period_end: timestamp, measured_at: timestamp, value: z.number().int().finite().min(0).max(1e15 - 1).nullable(), quality: z.enum(['known', 'missing', 'partial', 'stale', 'conflicted']), source_kind: z.enum(['manual', 'export']), source_reference: text.max(500), source_document_id: uuid, source_key: text.max(180) }).strict()
    .refine(x => Date.parse(x.period_end) > Date.parse(x.period_start), 'Het einde moet na het begin liggen.')
    .refine(x => x.quality === 'missing' ? x.value === null : x.value !== null, 'Ontbrekend vraagt een lege waarde; gemeten nul blijft nul.'),
};
export type PilotOperation = keyof typeof pilotOperationSchemas;
export function parsePilotOperation(op: string, data: unknown) {
  if (!Object.hasOwn(pilotOperationSchemas, op)) return { success: false as const };
  return pilotOperationSchemas[op as PilotOperation].safeParse(data);
}

// Parse only: never follow an input URL or perform discovery/scraping.
export function parsePilotPostUrl(input: string): { platform: 'youtube' | 'twitch'; externalId: string; canonicalUrl: string } | null {
  if (input.length > 2048 || /[\u0000-\u0020\\]/.test(input)) return null;
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return null;
    if (['twitch.tv','www.twitch.tv','m.twitch.tv','clips.twitch.tv'].includes(url.hostname)) {
      let externalId: string | null = null, canonicalUrl = '';
      if (url.hostname === 'clips.twitch.tv') { const clip = url.pathname.match(/^\/([A-Za-z0-9_-]{1,100})\/?$/)?.[1]; if (clip) { externalId = 'clip:' + clip; canonicalUrl = 'https://clips.twitch.tv/' + clip; } }
      else {
        const video = url.pathname.match(/^\/videos\/(\d{1,30})\/?$/)?.[1];
        const clip = url.pathname.match(/^\/[a-zA-Z0-9_]{1,25}\/clip\/([A-Za-z0-9_-]{1,100})\/?$/)?.[1];
        const channel = url.pathname.match(/^\/([a-zA-Z0-9_]{1,25})\/?$/)?.[1]?.toLowerCase();
        if (video) { externalId = 'video:' + video; canonicalUrl = 'https://www.twitch.tv/videos/' + video; }
        else if (clip) { externalId = 'clip:' + clip; canonicalUrl = 'https://clips.twitch.tv/' + clip; }
        else if (channel && !['directory','downloads','settings','login','signup','videos','search','subscriptions','inventory','wallet'].includes(channel)) { externalId = 'channel:' + channel; canonicalUrl = 'https://www.twitch.tv/' + channel; }
      }
      return externalId ? { platform: 'twitch', externalId, canonicalUrl } : null;
    }
    let id: string | null = null;
    if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)) {
      if (url.pathname === '/watch' && url.searchParams.getAll('v').length === 1) id = url.searchParams.get('v');
      else id = url.pathname.match(/^\/(?:shorts|live)\/([A-Za-z0-9_-]{11})\/?$/)?.[1] ?? null;
    } else if (url.hostname === 'youtu.be') id = url.pathname.match(/^\/([A-Za-z0-9_-]{11})\/?$/)?.[1] ?? null;
    if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
    return { platform: 'youtube', externalId: id, canonicalUrl: `https://www.youtube.com/watch?v=${id}` };
  } catch { return null; }
}

export type PilotPost = { id: string; participant_id: string; platform?: string; canonical_url: string; external_id: string; revision: number; status: string; availability: string; checked_at: string | null };
export type PilotMeasurement = {
  id: string; contribution_id: string; revision: number; metric: string; definition: string; unit: string;
  source_binding_id?: string | null;
  semantics: 'period' | 'cumulative' | 'instant'; period_start: string; period_end: string; measured_at: string; fetched_at: string;
  value: number | string | null; quality: 'known' | 'missing' | 'partial' | 'stale' | 'conflicted'; source_kind: 'manual' | 'export' | 'official_api'; source_reference: string;
};
export type PilotState = {
  synthetic: boolean; campaign_id: string; chair: boolean; editor: boolean; reviewer: boolean; reader: boolean;
  sources?: {id: string; participant_id: string; account_id: string; broadcaster_id: string; daily_limit: number; revoked_at: string | null; valid: boolean}[];
  source_runs?: {id: string;status: string;error_code: string | null;created_at: string}[];
  policies: { id: string; version: number; body: string; fields: string[]; retention: string; withdrawn_at: string | null }[];
  access: { id: string; user_id: string; role: string; valid_until: string; revoked_at: string | null }[];
  excluded_posts?: number;
  participants: { id: string; person_id: string; policy_id: string; accepted_at: string | null; withdrawn_at: string | null; expires_at: string; valid: boolean; own: boolean }[];
  posts: PilotPost[]; measurements: PilotMeasurement[];
};
export type PilotWindow = { start: string; end: string };
export type PilotSelection = { metric: string; definition: string; semantics: 'period' | 'cumulative' | 'instant'; first: PilotWindow; second: PilotWindow; asOf: string; freshnessHours: number; source?: 'manual' | 'export' | 'official_api'; benchmark?: 'manual' | 'export'; engagement?: { numerator: 'engagements' | 'likes_comments' | 'likes_comments_shares'; definition: string; denominator: 'views' | 'impressions' | 'reach'; denominatorDefinition: string } };
export function validPilotSelection(s: PilotSelection) {
  const times = [s.first.start, s.first.end, s.second.start, s.second.end, s.asOf].map(Date.parse);
  return times.every(Number.isFinite) && times[0] < times[1] && times[2] < times[3] && times[1] <= times[2]
    && times[3] <= times[4] && Number.isFinite(s.freshnessHours) && s.freshnessHours > 0 && s.freshnessHours <= 8760
    && (campaignMetrics as readonly string[]).includes(s.metric) && s.definition.length >= 2 && s.definition.length <= 240;
}
export function pilotWindowSummary(state: Pick<PilotState, 'posts' | 'measurements'>, selection: PilotSelection, window: PilotWindow) {
  if (!validPilotSelection(selection)) throw new Error('invalid_selection');
  const verified = state.posts.filter(p => p.status === 'verified');
  let measured = 0, missing = 0, stale = 0, conflicted = 0, partial = 0, sum = 0;
  const rows = verified.map(post => {
    const samples = state.measurements.filter(m => m.contribution_id === post.id && m.revision === post.revision && m.metric === selection.metric && m.definition === selection.definition && m.unit === 'count' && m.semantics === selection.semantics
      && (!selection.source || m.source_kind === selection.source)
      && (selection.semantics === 'period' ? Date.parse(m.period_start) === Date.parse(window.start) && Date.parse(m.period_end) === Date.parse(window.end) : Date.parse(m.measured_at) >= Date.parse(window.start) && Date.parse(m.measured_at) < Date.parse(window.end))
      && Date.parse(m.fetched_at) <= Date.parse(selection.asOf) && Date.parse(m.measured_at) <= Date.parse(selection.asOf));
    samples.sort((a, b) => (selection.semantics === 'period' ? 0 : Date.parse(b.measured_at) - Date.parse(a.measured_at)) || Date.parse(b.fetched_at) - Date.parse(a.fetched_at) || b.id.localeCompare(a.id));
    const sample = samples[0];
    const unavailable = ['private', 'deleted', 'unavailable', 'unknown'].includes(post.availability);
    const raw = sample?.value;
    const value = raw === null || raw === undefined || raw === '' ? null : Number(raw);
    let quality = unavailable || !sample || value === null ? 'missing' : sample.quality;
    if (sample && quality === 'known' && Date.parse(selection.asOf) - Date.parse(sample.measured_at) > selection.freshnessHours * 3600000) quality = 'stale';
    if (value !== null && (!Number.isSafeInteger(value) || value < 0)) quality = 'conflicted';
    if (quality === 'known' || quality === 'partial') { measured++; sum += value!; if (quality === 'partial') partial++; }
    else if (quality === 'stale') stale++; else if (quality === 'conflicted') conflicted++; else missing++;
    return { postId: post.id, url: post.canonical_url, value, quality, source: sample?.source_kind ?? null, reference: sample?.source_reference ?? null, measurementId: sample?.id ?? null, measuredAt: sample?.measured_at ?? null, sourceBindingId: sample?.source_binding_id ?? null };
  });
  // Reach is never additive across posts. Cumulative values are never period totals.
  const additive = !['reach','current_viewers'].includes(selection.metric) && selection.semantics === 'period';
  return { total: verified.length, candidates: state.posts.filter(p => p.status === 'candidate').length, rejected: state.posts.filter(p => p.status === 'rejected').length,
    measured, missing, stale, conflicted, partial, value: additive && measured > 0 && Number.isSafeInteger(sum) ? sum : null,
    complete: measured === verified.length && verified.length > 0 && !stale && !conflicted && !partial && Number.isSafeInteger(sum), additive, rows };
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
  const counterChanges = selection.semantics === 'cumulative' ? first.rows.map(before => {
    const after = second.rows.find(x => x.postId === before.postId);
    const comparable = before.quality === 'known' && after?.quality === 'known' && before.source === after.source && before.sourceBindingId === after.sourceBindingId;
    return { postId: before.postId, url: before.url, delta: cumulativePilotDelta(before.value, after?.value ?? null, comparable), firstAt: before.measuredAt, secondAt: after?.measuredAt ?? null };
  }) : [];
  const engagement = selection.engagement ? pilotEngagement(state, selection, selection.engagement) : null;
  const benchmark = selection.benchmark ? (['first','second'] as const).map(key => {
    const official = pilotWindowSummary(state, { ...selection, source: 'official_api' }, selection[key]);
    const reference = pilotWindowSummary(state, { ...selection, source: selection.benchmark }, selection[key]);
    return { window: key, rows: official.rows.map(a => { const b = reference.rows.find(x => x.postId === a.postId); return { url: a.url, official: a.quality === 'known' ? a.value : null, reference: b?.quality === 'known' ? b.value : null, difference: a.quality === 'known' && b?.quality === 'known' ? comparePilotValues(b.value, a.value).delta : null, officialAt: a.measuredAt, referenceAt: b?.measuredAt ?? null, officialReference: a.reference, benchmarkReference: b?.reference ?? null }; }) };
  }) : null;
  // Percentages of partial totals would suggest comparable coverage.
  return { synthetic: state.synthetic, selection, first, second, counterChanges, engagement, benchmark, excluded: state.excluded_posts ?? 0, comparison: first.complete && second.complete ? comparePilotValues(first.value, second.value) : { delta: null, percent: null } };
}
export function pilotEngagement(state: PilotState, selection: PilotSelection, config: NonNullable<PilotSelection['engagement']>) {
  const metrics = config.numerator === 'engagements' ? ['engagements'] : config.numerator === 'likes_comments' ? ['likes','comments'] : ['likes','comments','shares'];
  return { config, windows: (['first','second'] as const).map(key => {
    const denominator = pilotWindowSummary(state, { ...selection, metric: config.denominator, definition: config.denominatorDefinition }, selection[key]);
    const numerators = metrics.map(metric => pilotWindowSummary(state, { ...selection, metric, definition: config.definition }, selection[key]));
    const rows = denominator.rows.map(d => {
      const parts = numerators.map(n => n.rows.find(r => r.postId === d.postId));
      const rawNumerator = parts.every(p => p?.quality === 'known' && p.value !== null) ? parts.reduce((sum,p) => sum + p!.value!,0) : null;
      const numerator = Number.isSafeInteger(rawNumerator) ? rawNumerator : null;
      const denominatorValue = d.quality === 'known' ? d.value : null;
      const comparable = selection.semantics === 'period' && Number.isSafeInteger(numerator) && numerator !== null && denominatorValue !== null && denominatorValue > 0;
      const inputs = [{metric:config.denominator,definition:config.denominatorDefinition,role:'denominator',...d},...parts.map((p,index)=>({metric:metrics[index],definition:config.definition,role:'numerator',...p!}))];
      return { url: d.url, numerator, denominator: denominatorValue, inputs, percent: comparable ? numerator! / denominatorValue! * 100 : null };
    });
    const complete = selection.semantics === 'period' && config.denominator !== 'reach' && denominator.complete && numerators.every(n => n.complete) && rows.length > 0 && rows.every(r => r.numerator !== null && r.denominator !== null);
    const rawTotalNumerator = complete ? rows.reduce((sum,r) => sum + r.numerator!,0) : null;
    const rawTotalDenominator = complete ? rows.reduce((sum,r) => sum + r.denominator!,0) : null;
    const totalNumerator = Number.isSafeInteger(rawTotalNumerator) ? rawTotalNumerator : null;
    const totalDenominator = Number.isSafeInteger(rawTotalDenominator) ? rawTotalDenominator : null;
    const percent = totalNumerator !== null && Number.isSafeInteger(totalNumerator) && totalDenominator !== null && Number.isSafeInteger(totalDenominator) && totalDenominator > 0 ? totalNumerator / totalDenominator * 100 : null;
    return { window: key, rows, numerator: totalNumerator, denominator: totalDenominator, percent };
  }) };
}
export function pilotReportCsv(report: ReturnType<typeof pilotReport>) {
  const lines: unknown[][] = [[report.synthetic ? 'TESTFIXTURE — NIET PUBLICEREN' : 'Intern campagnerapport'], ['Peildatum', report.selection.asOf], ['Bronselectie', report.selection.source ?? 'alle toegestane bronnen'], ['Uitgesloten door deelname', report.excluded], ['Venster', 'Begin', 'Einde', 'Metric', 'Definitie', 'Semantiek', 'Gemeten', 'Totaal', 'Ontbrekend', 'Verouderd', 'Conflict', 'Gedeeltelijk', 'Waarde'],
    ...(['first', 'second'] as const).map(key => { const w = report[key], range = report.selection[key]; return [key, range.start, range.end, report.selection.metric, report.selection.definition, report.selection.semantics, w.measured, w.total, w.missing, w.stale, w.conflicted, w.partial, w.value]; }),
    ['Venster', 'Post', 'Waarde', 'Kwaliteit', 'Bron', 'Bronreferentie', 'Meting-ID']];
  for (const key of ['first', 'second'] as const) for (const row of report[key].rows) lines.push([key, row.url, row.value, row.quality, row.source, row.reference, row.measurementId]);
  if (report.counterChanges.length) { lines.push(['Cumulatieve tellerverandering; geen uniek bereik','Post','Verschil','Eerste meetmoment','Tweede meetmoment']); for (const row of report.counterChanges) lines.push(['counter_delta',row.url,row.delta,row.firstAt,row.secondAt]); }
  if (report.engagement) {
    const c = report.engagement.config; lines.push(['Engagementdefinitie',c.numerator,c.definition,'Noemer',c.denominator,c.denominatorDefinition],['Venster','Post','Teller','Noemer','Engagementpercentage']);
    for (const w of report.engagement.windows) { lines.push([w.window,'Campagne',w.numerator,w.denominator,w.percent]); for (const row of w.rows) lines.push([w.window,row.url,row.numerator,row.denominator,row.percent]); }
    lines.push(['Engagementbron','Venster','Post','Rol','Metric','Definitie','Waarde','Kwaliteit','Bron','Referentie','Meting-ID','Meetmoment']);
    for (const w of report.engagement.windows) for (const row of w.rows) for (const input of row.inputs) lines.push(['engagement_input',w.window,row.url,input.role,input.metric,input.definition,input.value,input.quality,input.source,input.reference,input.measurementId,input.measuredAt]);
  }
  if (report.benchmark) { lines.push(['Bronvergelijking; controleer verschil in meetmoment','Venster','Post','Officieel','Referentie','Verschil','Officieel meetmoment','Referentie meetmoment','Officiële bron','Referentiebron']); for (const w of report.benchmark) for (const row of w.rows) lines.push(['benchmark',w.window,row.url,row.official,row.reference,row.difference,row.officialAt,row.referenceAt,row.officialReference,row.benchmarkReference]); }
  return '\uFEFF' + lines.map(row => row.map(pilotCsvCell).join(',')).join('\r\n');
}
export function pilotFeedback(code?: string) {
  if (/42501|authorized|review_required/.test(code ?? '')) return 'Je hebt voor deze handeling geen actuele bevoegdheid, of er is een andere beoordelaar nodig.';
  if (/40001|revision|conflict|23505/.test(code ?? '')) return 'De gegevens of bronregistratie zijn gewijzigd of bestaan al. Vernieuw en controleer de actuele versie.';
  return 'De handeling kon niet worden bevestigd. Controleer toegang, verklaring, bron en ingevulde velden voordat je opnieuw probeert.';
}
