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

export function percentageDelta(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
}

export function targetScore(values: { value: number; target: number | null }[]) {
  const targeted = values.filter((item) => item.target !== null && item.target !== 0);
  const reached = targeted.filter((item) => item.value >= Number(item.target)).length;
  return { reached, total: targeted.length, percentage: targeted.length ? Math.round((reached / targeted.length) * 100) : 0 };
}
