import assert from "node:assert/strict";
import test from "node:test";
import { fetchFacebookInsightMeasurements, metaSyncWindow, socialMetricLabel } from "../src/lib/meta-insights.ts";

const window = metaSyncWindow(new Date("2026-10-02T13:55:29Z"));
function successfulRequest(): typeof fetch {
  return async (input, init) => {
    const url = new URL(String(input));
    const metric = url.searchParams.get("metric")!;
    assert.equal(url.searchParams.get("since"), String(window.since));
    assert.equal(url.searchParams.get("until"), String(window.until));
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer private-token");
    assert.equal(init?.cache, "no-store");
    if (metric === "page_total_media_view_unique") {
      assert.equal(url.searchParams.get("period"), "days_28");
      return Response.json({ data: [{ name: metric, period: "days_28", values: [
        { value: 580, end_time: "2026-10-02T00:00:00Z" },
        { value: 560, end_time: "2026-10-01T00:00:00Z" },
      ] }] });
    }
    assert.equal(url.searchParams.get("period"), "day");
    return Response.json({ data: [{ name: metric, period: "day", values: [{ value: 5 }, { value: 7 }] }] });
  };
}

test("Facebook haalt bereik, weergaven en interacties afzonderlijk op", async () => {
  const result = await fetchFacebookInsightMeasurements("private-token", "page-id", "v25.0", window.since, window.until, successfulRequest());
  assert.equal(result.insightError, null);
  assert.deepEqual(result.measurements.map((item) => [item.metric, item.value]), [
    ["page_total_media_view_unique", 580], ["page_media_view", 12], ["page_post_engagements", 12],
  ]);
  assert.equal(result.measurements[0].periodStart, "2026-09-04T00:00:00.000Z");
  assert.equal(result.measurements[0].periodEnd, "2026-10-01T23:59:59.999Z");
});

test("een geweigerde metric behoudt andere cijfers en de rechtenfoutcode", async () => {
  const successful = successfulRequest();
  const request: typeof fetch = async (input, init) => {
    if (new URL(String(input)).searchParams.get("metric") === "page_media_view") {
      return Response.json({ error: { message: "(#10) permission missing", code: 10 } }, { status: 403 });
    }
    return successful(input, init);
  };
  const result = await fetchFacebookInsightMeasurements("private-token", "page-id", "v25.0", window.since, window.until, request);
  assert.equal(result.measurements.length, 2);
  assert.match(result.insightError!, /Weergaven.*permission missing/);
  assert.equal(result.insightErrorCode, 10);
});

test("lege Facebook Insights worden expliciet gemeld, niet als nul opgeslagen", async () => {
  const result = await fetchFacebookInsightMeasurements("private-token", "page-id", "v25.0", window.since, window.until, async () => Response.json({ data: [] }));
  assert.deepEqual(result.measurements, []);
  for (const label of ["Bereik", "Weergaven", "Interacties"]) assert.match(result.insightError!, new RegExp(label));
});

test("een echte gemeten nul blijft een geldig cijfer", async () => {
  const request: typeof fetch = async (input) => {
    const metric = new URL(String(input)).searchParams.get("metric")!;
    return Response.json({ data: [{ name: metric, values: [{ value: 0, end_time: "2026-10-02T00:00:00Z" }] }] });
  };
  const result = await fetchFacebookInsightMeasurements("private-token", "page-id", "v25.0", window.since, window.until, request);
  assert.equal(result.insightError, null);
  assert.deepEqual(result.measurements.map((item) => item.value), [0, 0, 0]);
});

test("API-parameterfouten worden geen rechtenfouten en tokens blijven verborgen", async () => {
  const request: typeof fetch = async () => Response.json({ error: { message: "(#100) invalid metric private-token", code: 100 } }, { status: 400 });
  const result = await fetchFacebookInsightMeasurements("private-token", "page-id", "v25.0", window.since, window.until, request);
  assert.equal(result.insightErrorCode, undefined);
  assert.doesNotMatch(result.insightError!, /private-token/);
});

test("unieke bereikwaarden zonder eindtijd kunnen niet als periodecijfer worden opgeslagen", async () => {
  const request: typeof fetch = async (input) => Response.json({ data: [{
    name: new URL(String(input)).searchParams.get("metric"), values: [{ value: 580 }],
  }] });
  const result = await fetchFacebookInsightMeasurements("private-token", "page-id", "v25.0", window.since, window.until, request);
  assert.equal(result.measurements.length, 2);
  assert.match(result.insightError!, /Bereik/);
});

test("rapportlabel maakt de definitie van Facebook-bereik expliciet", () => {
  assert.equal(socialMetricLabel("period_page_total_media_view_unique"), "Bereik (unieke mediakijkers)");
  assert.equal(socialMetricLabel("period_page_media_view"), "Weergaven");
  assert.equal(socialMetricLabel("period_page_post_engagements"), "Interacties");
  assert.equal(socialMetricLabel("period_profile_views"), "profile views");
});

test("meetperiode bevat precies 28 volledige dagen, ook over jaar- en schrikkelgrenzen", () => {
  for (const date of ["2026-10-02T13:55:29Z", "2027-01-05T00:30:00Z", "2028-03-01T20:00:00Z"]) {
    const result = metaSyncWindow(new Date(date));
    assert.equal(result.until - result.since, 28 * 86400);
    assert.match(result.periodStart, /T00:00:00.000Z$/);
    assert.match(result.periodEnd, /T23:59:59.999Z$/);
  }
});
