export type MetaInsight = {
  name: string;
  period?: string;
  values?: Array<{ value?: unknown; end_time?: string }>;
  total_value?: { value?: unknown };
};

export function instagramInsightParameters(since: number, until: number) {
  return new URLSearchParams({
    metric: "reach,profile_views", period: "day", metric_type: "total_value",
    since: String(since), until: String(until),
  });
}

export function numericInsights(items: MetaInsight[]) {
  return items.flatMap((item) => {
    const aggregate = item.total_value?.value;
    if (typeof aggregate === "number" && Number.isFinite(aggregate)) {
      // This is already the period total; never add daily values to it.
      return [{ metric: item.name, value: aggregate }];
    }
    const values = (item.values ?? []).map((entry) => entry.value)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    if (!values.length) return [];
    return [{ metric: item.name, value: values.reduce((sum, value) => sum + value, 0) }];
  });
}

export class MetaApiError extends Error {
  code: number | undefined;
  constructor(message: string, code?: number) {
    super(message);
    this.name = "MetaApiError";
    this.code = code;
  }
}

export function isMetaPermissionError(code: number | null | undefined) {
  return code === 10 || code === 200;
}
