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

export const facebookInsightDefinitions = [
  { metric: "page_total_media_view_unique", label: "Bereik (unieke mediakijkers)", period: "days_28", aggregate: "latest" },
  { metric: "page_media_view", label: "Weergaven", period: "day", aggregate: "sum" },
  { metric: "page_post_engagements", label: "Interacties", period: "day", aggregate: "sum" },
] as const;

export function socialMetricLabel(metric: string) {
  const definition = facebookInsightDefinitions.find((item) => `period_${item.metric}` === metric);
  return definition?.label ?? metric.replace(/^period_/, "").replaceAll("_", " ");
}

export function metaSyncWindow(now = new Date()) {
  const until = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const since = until - 28 * 86_400_000;
  return {
    since: Math.floor(since / 1000), until: Math.floor(until / 1000),
    periodStart: new Date(since).toISOString(), periodEnd: new Date(until - 1).toISOString(),
  };
}

// Query metrics separately: an unavailable metric must not hide successful ones.
export async function fetchFacebookInsightMeasurements(
  accessToken: string, pageId: string, apiVersion: string, since: number, until: number,
  request: typeof fetch = fetch,
) {
  const measurements: Array<{ metric: string; value: number; periodStart: string; periodEnd: string }> = [];
  const errors: string[] = [];
  let insightErrorCode: number | undefined;
  for (const definition of facebookInsightDefinitions) {
    const parameters = new URLSearchParams({
      metric: definition.metric, period: definition.period, since: String(since), until: String(until),
    });
    try {
      const response = await request(`https://graph.facebook.com/${apiVersion}/${pageId}/insights?${parameters}`, {
        headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store",
      });
      const body = await response.json() as { data?: MetaInsight[]; error?: { message?: string; code?: number } };
      if (!response.ok || body.error) throw new MetaApiError(body.error?.message ?? `Meta API-fout (${response.status}).`, body.error?.code);
      const item = body.data?.find((entry) => entry.name === definition.metric);
      if (!item || (item.period && item.period !== definition.period)) throw new Error("Meta gaf geen meting voor de gevraagde periode terug.");
      let value: number | undefined;
      let periodStart = new Date(since * 1000).toISOString();
      let periodEnd = new Date(until * 1000 - 1).toISOString();
      if (definition.aggregate === "latest") {
        const latest = (item.values ?? []).filter((entry) => typeof entry.value === "number" && Number.isFinite(entry.value)
          && entry.end_time && Number.isFinite(Date.parse(entry.end_time))
          && Date.parse(entry.end_time) > since * 1000 && Date.parse(entry.end_time) <= until * 1000)
          .sort((a, b) => Date.parse(b.end_time!) - Date.parse(a.end_time!))[0];
        if (latest) {
          value = latest.value as number;
          const end = Date.parse(latest.end_time!);
          // Rolling unique counts overlap; select one window, never sum them.
          periodStart = new Date(end - 28 * 86_400_000).toISOString();
          periodEnd = new Date(end - 1).toISOString();
        }
      } else {
        value = numericInsights([item])[0]?.value;
      }
      if (value === undefined) throw new Error("Meta gaf geen numerieke meetwaarden terug (dit is geen gemeten nul).");
      measurements.push({ metric: definition.metric, value, periodStart, periodEnd });
    } catch (error) {
      if (error instanceof MetaApiError && isMetaPermissionError(error.code)) insightErrorCode = error.code;
      const message = error instanceof Error ? error.message : "Onbekende API-fout.";
      errors.push(`${definition.label} (${definition.metric}): ${message.replaceAll(accessToken, "[token verborgen]")}`);
    }
  }
  return { measurements, insightError: errors.length ? `Facebook Insights: ${errors.join(" | ")}` : null, insightErrorCode };
}
