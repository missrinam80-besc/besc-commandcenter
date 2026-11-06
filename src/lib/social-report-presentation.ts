import { socialMetricLabel } from "./meta-insights.ts";

const date = (value: string) => new Intl.DateTimeFormat("nl-BE", {
  timeZone: "Europe/Brussels", dateStyle: "short",
}).format(new Date(value));
export const socialMeasurementTime = (value: string) => new Intl.DateTimeFormat("nl-BE", {
  timeZone: "Europe/Brussels", dateStyle: "short", timeStyle: "medium",
}).format(new Date(value));

export function socialMetricPresentation(metric: string, platformMetric?: string) {
  const key = metric.replace(/^period_/, "");
  const labels: Record<string, string> = {
    average_view_duration: "Gemiddelde kijkduur", estimated_minutes_watched: "Geschatte kijktijd",
    current_viewers: "Gelijktijdige kijkers", is_live: "Live (1 = ja, 0 = nee)",
    scheduled_streams: "Geplande streams", lifetime_views: "Weergaven sinds kanaalstart",
  };
  const unit = key === "average_view_duration" || platformMetric === "averageViewDuration" ? "seconden"
    : key === "estimated_minutes_watched" || platformMetric === "estimatedMinutesWatched" ? "minuten" : "";
  return { label: labels[key] ?? socialMetricLabel(metric), unit };
}

export function socialMeasurementPeriod(start: string | null, end: string | null, fetched: string) {
  if (start && end) return `${date(start)} – ${date(end)}`;
  if (end) return `Momentopname · ${socialMeasurementTime(end)}`;
  if (start) return `Vanaf ${date(start)} · einddatum onbekend`;
  return `Totaalstand op ${socialMeasurementTime(fetched)}`;
}

export function socialMeasurementAvailable(value: unknown) {
  return (typeof value === "number" || (typeof value === "string" && value.trim() !== ""))
    && Number.isFinite(Number(value));
}

export function socialMeasurementValue(value: unknown) {
  return socialMeasurementAvailable(value)
    ? new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 2 }).format(Number(value))
    : "Ontbrekende meting";
}
