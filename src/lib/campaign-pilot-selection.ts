import { localDateTimeToIso } from './format.ts';
import { validPilotSelection, type PilotSelection } from './campaign-pilot.ts';

export function pilotSelectionFromQuery(query: Record<string, string | undefined>, asOf: string): PilotSelection | null {
  const at = (key: string) => localDateTimeToIso(query[key]) ?? '';
  const selection: PilotSelection = { metric: query.metric ?? '', definition: query.definition ?? '', semantics: query.semantics === 'cumulative' ? 'cumulative' : query.semantics === 'instant' ? 'instant' : 'period',
    first: { start: at('first_start'), end: at('first_end') }, second: { start: at('second_start'), end: at('second_end') }, asOf, freshnessHours: Number(query.freshness) };
  if (!['period','cumulative','instant'].includes(query.semantics ?? '')) return null;
  if (query.source) { if (!['manual','export','official_api'].includes(query.source)) return null; selection.source = query.source as PilotSelection['source']; }
  if (query.benchmark) { if (!['manual','export'].includes(query.benchmark)) return null; selection.benchmark = query.benchmark as PilotSelection['benchmark']; }
  if (query.engagement) {
    if (!['engagements','likes_comments','likes_comments_shares'].includes(query.engagement) || !['views','impressions','reach'].includes(query.denominator ?? '') || !query.engagement_definition || query.engagement_definition.length < 2 || query.engagement_definition.length > 240 || !query.denominator_definition || query.denominator_definition.length < 2 || query.denominator_definition.length > 240) return null;
    selection.engagement = { numerator: query.engagement as NonNullable<PilotSelection['engagement']>['numerator'], definition: query.engagement_definition, denominator: query.denominator as NonNullable<PilotSelection['engagement']>['denominator'], denominatorDefinition: query.denominator_definition };
  }
  return validPilotSelection(selection) ? selection : null;
}
