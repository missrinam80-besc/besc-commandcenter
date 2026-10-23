import { localDateTimeToIso } from './format.ts';
import { validPilotSelection, type PilotSelection } from './campaign-pilot.ts';

export function pilotSelectionFromQuery(query: Record<string, string | undefined>, asOf: string): PilotSelection | null {
  const at = (key: string) => localDateTimeToIso(query[key]) ?? '';
  const selection: PilotSelection = { metric: query.metric ?? '', definition: query.definition ?? '', semantics: query.semantics === 'cumulative' ? 'cumulative' : 'period',
    first: { start: at('first_start'), end: at('first_end') }, second: { start: at('second_start'), end: at('second_end') }, asOf, freshnessHours: Number(query.freshness) };
  if (query.semantics !== 'period' && query.semantics !== 'cumulative') return null;
  return validPilotSelection(selection) ? selection : null;
}
