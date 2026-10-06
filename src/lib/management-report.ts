export type ReportPeriod = "month" | "quarter" | "year";

export type PeriodRange = {
  start: Date;
  end: Date;
  previousStart: Date;
  previousEnd: Date;
  label: string;
};

export function managementPeriod(period: ReportPeriod, anchor = new Date()): PeriodRange {
  const year = anchor.getUTCFullYear();
  const month = anchor.getUTCMonth();
  const date = (targetYear: number, targetMonth: number) => new Date(Date.UTC(targetYear, targetMonth, 1));
  let start: Date;
  let end: Date;
  let previousStart: Date;
  let previousEnd: Date;
  let label: string;

  if (period === "year") {
    start = date(year, 0);
    end = date(year + 1, 0);
    previousStart = date(year - 1, 0);
    previousEnd = start;
    label = String(year);
  } else if (period === "quarter") {
    const quarter = Math.floor(month / 3);
    start = date(year, quarter * 3);
    end = date(year, quarter * 3 + 3);
    previousStart = date(year, quarter * 3 - 3);
    previousEnd = start;
    label = `Q${quarter + 1} ${year}`;
  } else {
    start = date(year, month);
    end = date(year, month + 1);
    previousStart = date(year, month - 1);
    previousEnd = start;
    label = new Intl.DateTimeFormat("nl-BE", { month: "long", year: "numeric", timeZone: "UTC" }).format(start);
  }

  return { start, end, previousStart, previousEnd, label };
}

export function percentageDelta(current: number | null, previous: number | null) {
  if (current === null || previous === null || !Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
}

export type KpiMeasurement = {
  value: number | string | null;
  target?: number | string | null;
  measurement_status?: string;
  target_direction?: string;
};

export const targetDirectionLabels: Record<string, string> = {
  higher: "Hoger is beter", lower: "Lager is beter", unknown: "Nog niet vastgelegd",
};

export function measuredValue(item: KpiMeasurement): number | null {
  if (item.measurement_status === "missing" || item.value === null || String(item.value).trim() === "") return null;
  const value = Number(item.value);
  return Number.isFinite(value) ? value : null;
}

export function kpiValueLabel(item: KpiMeasurement): string {
  const value = measuredValue(item);
  return value === null ? "Ontbrekende meting" : value.toLocaleString("nl-BE", { maximumFractionDigits: 4 });
}

export function targetReached(item: KpiMeasurement): boolean | null {
  const value = measuredValue(item);
  if (value === null || item.target == null || String(item.target).trim() === "") return null;
  const target = Number(item.target);
  if (!Number.isFinite(target)) return null;
  if (item.target_direction === "higher") return value >= target;
  if (item.target_direction === "lower") return value <= target;
  return null;
}

export function kpiTargetLabel(item: KpiMeasurement): string {
  const reached = targetReached(item);
  return reached === null ? "Niet te beoordelen" : reached ? "Doel behaald" : "Doel niet behaald";
}

export function targetScore(values: KpiMeasurement[]) {
  const targeted = values.filter((item) => item.target != null && String(item.target).trim() !== "");
  const assessed = targeted.map(targetReached).filter((value) => value !== null);
  const reached = assessed.filter(Boolean).length;
  return { reached, total: assessed.length, unassessed: targeted.length - assessed.length,
    percentage: assessed.length ? Math.round((reached / assessed.length) * 100) : null };
}
