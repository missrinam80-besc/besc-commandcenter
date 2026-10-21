import { measuredValue } from "./management-report.ts";

type MetricValue = number | string | null | undefined;

export function campaignMetricLabel(value: MetricValue): string {
  const measured = measuredValue({ value: value ?? null });
  return measured === null ? "Ontbrekende meting" : measured.toLocaleString("nl-BE");
}

export function campaignMetricExportValue(value: MetricValue): number | string {
  return measuredValue({ value: value ?? null }) ?? "Ontbrekende meting";
}

export function summarizeCampaignMetric(values: readonly MetricValue[]) {
  let measured = 0;
  let sum = 0;
  for (const raw of values) {
    const value = measuredValue({ value: raw ?? null });
    if (value === null) continue;
    measured += 1;
    sum += value;
  }
  return { value: measured ? sum : null, measured, missing: values.length - measured, total: values.length };
}

type MetricSummary = ReturnType<typeof summarizeCampaignMetric>;

export function campaignMetricSummaryLabel(summary: MetricSummary): string {
  if (!summary.total) return "Geen campagnes";
  const label = campaignMetricLabel(summary.value);
  return summary.measured && summary.missing ? `${label} (gedeeltelijk)` : label;
}

export function campaignMetricCoverageLabel(summary: MetricSummary): string {
  return `${summary.measured} van ${summary.total} campagnes gemeten · ${summary.missing} ontbrekend`;
}
