import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { handleSocialMetricsExport, createExportRateLimiter, type MetricSnapshot, type ExportQuery } from "../src/lib/social-metrics-export.ts";
import { readSocialMetricsExportPage } from "../src/lib/social-metrics-export-query.ts";

const apiKey = "private-export-key-".repeat(4);
const organizationId = "11111111-1111-4111-8111-111111111111";
const accountId = "22222222-2222-4222-8222-222222222222";
const now = () => new Date("2026-10-02T16:00:00Z");
const request = (query = "", key = apiKey) => new Request(`https://besc.example/api/v1/social/metrics${query ? `?${query}` : ""}`, { headers: key ? { Authorization: `Bearer ${key}` } : {} });
const row = (id = "33333333-3333-4333-8333-333333333333"): MetricSnapshot => ({
  id, social_account_id: accountId, external_content_id: "fb-page", normalized_metric: "period_page_media_view",
  platform_metric: "page_media_view", metric_value: 79, period_start: "2026-09-04T00:00:00Z",
  period_end: "2026-10-01T23:59:59.999Z", fetched_at: "2026-10-02T14:07:38.630727+00:00",
  source_url: "https://www.facebook.com/101177345535710?access_token=do-not-export#private",
  social_accounts: { account_name: "Belgian Streamers Community", platform: "facebook" },
});
function fixture(rows: MetricSnapshot[]) {
  const queries: ExportQuery[] = [];
  return { queries, deps: { apiKey, organizationId, now, readPage: async (query: ExportQuery) => {
    queries.push(query);
    return rows.filter((item) => Date.parse(item.fetched_at) <= Date.parse(query.asOf))
      .slice(query.offset, query.offset + query.count);
  } } };
}

test("social export is uit zonder organisatie/aparte key en raakt geen database", async () => {
  const { deps, queries } = fixture([]);
  for (const config of [{ apiKey: undefined }, { apiKey: "short" }, { organizationId: "invalid" }, { forbiddenKeys: [apiKey] }]) {
    assert.equal((await handleSocialMetricsExport(request(), { ...deps, ...config })).status, 503);
  }
  for (const key of ["", "wrong", `${apiKey}extra`]) assert.equal((await handleSocialMetricsExport(request("", key), deps)).status, 401);
  assert.equal(queries.length, 0);
});

test("social export is uitsluitend GET en ondersteunt geen schrijftoegang", async () => {
  const { deps, queries } = fixture([]);
  const response = await handleSocialMetricsExport(new Request("https://besc.example/api/v1/social/metrics", { method: "POST" }), deps);
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET");
  assert.equal(queries.length, 0);
});

test("expliciete veldselectie behoudt cijfers/perioden en verwijdert secrets", async () => {
  const contaminated = { ...row(), source_metadata: { access_token: "do-not-export" }, access_token: "do-not-export" };
  const { deps } = fixture([contaminated]);
  const response = await handleSocialMetricsExport(request(), deps);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.equal(body.data[0].value, 79);
  assert.equal(body.data[0].periodStart, row().period_start);
  assert.equal(body.data[0].fetchedAt, row().fetched_at);
  assert.equal(body.data[0].sourceUrl, "https://www.facebook.com/101177345535710");
  assert.equal(body.dateFilterBasis, "fetched_at_utc");
  const serialized = JSON.stringify(body);
  for (const secret of [apiKey, "do-not-export", "source_metadata", "access_token"]) assert.ok(!serialized.includes(secret));
});

test("lege selectie is leeg; echte nul en decimale tekst blijven behouden", async () => {
  const empty = await handleSocialMetricsExport(request(), fixture([]).deps);
  assert.deepEqual((await empty.json()).data, []);
  const { deps } = fixture([{ ...row("zero"), metric_value: 0 }, { ...row("decimal"), metric_value: "9007199254740993" }]);
  const response = await handleSocialMetricsExport(request(), deps);
  assert.deepEqual((await response.json()).data.map((item: { value: unknown }) => item.value), [0, "9007199254740993"]);
});

test("alle filters worden gevalideerd; client kan organisatie of sleutel niet als query meegeven", async () => {
  const { deps, queries } = fixture([]);
  for (const query of ["organization_id=other", "api_key=secret", "platform=unknown", "mode=other", "account_id=bad", "metric=foo,bar", "from=2026-02-30", "from=2026-10-03&to=2026-10-02", "limit=0", "limit=101", "limit=1.5", "limit=1&limit=2", "from="]) {
    assert.equal((await handleSocialMetricsExport(request(query), deps)).status, 400, query);
  }
  assert.equal(queries.length, 0);
});

test("UTC-datums zijn inclusief op ophaaldag, platform/account/metric bereiken de query", async () => {
  const { deps, queries } = fixture([]);
  await handleSocialMetricsExport(request(`platform=facebook&account_id=${accountId}&metric=period_reach&from=2026-09-01&to=2026-09-30`), deps);
  assert.equal(queries[0].organizationId, organizationId);
  assert.deepEqual(queries[0].filters, { mode: "history", platform: "facebook", accountId, metric: "period_reach", from: "2026-09-01T00:00:00.000Z", until: "2026-10-01T00:00:00.000Z", limit: 50 });
});

test("gesigneerde paginering behoudt asOf en levert unieke IDs, zonder nieuwe syncs", async () => {
  const fixtureData = fixture([row("first"), row("second"), row("third")]);
  const ids: string[] = [];
  let cursor: string | null = null;
  do {
    const response = await handleSocialMetricsExport(request(`limit=1${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`), fixtureData.deps);
    const body = await response.json();
    assert.equal(body.asOf, now().toISOString());
    ids.push(body.data[0].id);
    cursor = body.nextCursor;
    // New data is outside the original cutoff, even on subsequent pages.
    fixtureData.deps.now = () => new Date("2026-10-03T16:00:00Z");
  } while (cursor);
  assert.deepEqual(ids, ["first", "second", "third"]);
  assert.equal(new Set(ids).size, ids.length);
});

test("cursor-tampering, andere filters en sleutelrotatie worden geweigerd", async () => {
  const { deps } = fixture([row("first"), row("second")]);
  const body = await (await handleSocialMetricsExport(request("limit=1"), deps)).json();
  const token = body.nextCursor as string;
  for (const query of [`limit=1&cursor=${token.slice(0, -1)}!`, `limit=1&platform=instagram&cursor=${token}`, `limit=2&cursor=${token}`]) {
    assert.equal((await handleSocialMetricsExport(request(query), deps)).status, 400);
  }
  const rotated = "new-private-export-key-".repeat(3);
  assert.equal((await handleSocialMetricsExport(request(`limit=1&cursor=${token}`, rotated), { ...deps, apiKey: rotated })).status, 400);
});

test("latest kiest nieuwste per metric/account/content, nooit optellen van overlap", async () => {
  const newer = { ...row("new"), metric_value: 79 };
  const anotherMetric = { ...row("reach"), normalized_metric: "period_reach", metric_value: 42 };
  const older = { ...row("old"), metric_value: 50, fetched_at: "2026-10-01T10:00:00Z" };
  const otherContent = { ...older, id: "other-content", external_content_id: "different-post" };
  const { deps } = fixture([newer, anotherMetric, older, otherContent]);
  const body = await (await handleSocialMetricsExport(request("mode=latest"), deps)).json();
  assert.deepEqual(body.data.map((item: { id: string }) => item.id), ["new", "reach", "other-content"]);
  assert.equal(body.data[0].value, 79);
  assert.match(body.warning, /overlap/);
});

test("latest leest alle bounded pages voor deduplicatie en kan daarna pagineren", async () => {
  const source = Array.from({ length: 501 }, (_, i) => ({ ...row(String(i)), normalized_metric: i === 500 ? "followers" : "period_reach" }));
  const { deps, queries } = fixture(source);
  const first = await (await handleSocialMetricsExport(request("mode=latest&limit=1"), deps)).json();
  assert.ok(first.nextCursor);
  assert.equal(queries[1].offset, 500);
  const second = await (await handleSocialMetricsExport(request(`mode=latest&limit=1&cursor=${first.nextCursor}`), deps)).json();
  assert.equal(second.data[0].metric, "followers");
  assert.equal(second.nextCursor, null);
});

test("latest boven scanlimiet weigert onvolledige export; history blijft werken", async () => {
  const { deps } = fixture(Array.from({ length: 5001 }, (_, i) => row(String(i))));
  assert.equal((await handleSocialMetricsExport(request("mode=latest"), deps)).status, 422);
  assert.equal((await handleSocialMetricsExport(request("mode=history"), deps)).status, 200);
});

test("onbetrouwbare bron-URLs, metadata en databasefouten lekken niet", async () => {
  for (const source_url of ["https://evil.example/secret", "https://user:password@facebook.com/page", "javascript:alert(1)"]) {
    const body = await (await handleSocialMetricsExport(request(), fixture([{ ...row(), source_url }]).deps)).json();
    assert.equal(body.data[0].sourceUrl, null);
  }
  const { deps } = fixture([]);
  const response = await handleSocialMetricsExport(request(), { ...deps, readPage: async () => { throw new Error(apiKey); } });
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "export_query_failed" });
});

test("rate limiter begrenst queries en reset per minuut", async () => {
  const limiter = createExportRateLimiter();
  for (let i = 0; i < 30; i++) assert.equal(limiter(100_000), true);
  assert.equal(limiter(100_001), false);
  assert.equal(limiter(160_000), true);
  const { deps, queries } = fixture([]);
  const response = await handleSocialMetricsExport(request(), { ...deps, allowRequest: () => false });
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "60");
  assert.equal(queries.length, 0);
});

test("databaseadapter is alleen-lezen, scoped en gebruikt stabiele sortering en inclusieve range", async () => {
  const calls: unknown[][] = [];
  const builder = {
    select: (columns: string) => { calls.push(["select", columns]); return builder; },
    eq: (column: string, value: unknown) => { calls.push(["eq", column, value]); return builder; },
    lte: (column: string, value: unknown) => { calls.push(["lte", column, value]); return builder; },
    gte: (column: string, value: unknown) => { calls.push(["gte", column, value]); return builder; },
    lt: (column: string, value: unknown) => { calls.push(["lt", column, value]); return builder; },
    order: (column: string, options: unknown) => { calls.push(["order", column, options]); return builder; },
    range: async (from: number, to: number) => { calls.push(["range", from, to]); return { data: [row()], error: null }; },
  };
  const client = { from: (table: string) => { calls.push(["from", table]); return builder; } } as unknown as Parameters<typeof readSocialMetricsExportPage>[0];
  await readSocialMetricsExportPage(client, { organizationId, filters: { mode: "history", limit: 10, platform: "facebook", accountId, metric: "period_reach", from: "2026-09-01T00:00:00Z", until: "2026-10-01T00:00:00Z" }, asOf: now().toISOString(), offset: 10, count: 11 });
  assert.ok(calls.some((call) => JSON.stringify(call) === JSON.stringify(["eq", "organization_id", organizationId])));
  assert.ok(calls.some((call) => JSON.stringify(call) === JSON.stringify(["eq", "social_accounts.organization_id", organizationId])));
  assert.ok(calls.some((call) => call[0] === "lte" && call[1] === "fetched_at"));
  assert.ok(calls.some((call) => call[0] === "lt" && call[1] === "fetched_at"));
  assert.deepEqual(calls.filter((call) => call[0] === "order").map((call) => call[1]), ["fetched_at", "id"]);
  assert.deepEqual(calls.at(-1), ["range", 10, 20]);
  const columns = calls.find((call) => call[0] === "select")?.[1] as string;
  for (const secretColumn of ["*", "source_metadata", "access_token", "granted_scopes"]) assert.ok(!columns.includes(secretColumn));
});

test("OpenAPI schema beschrijft uitsluitend de read-only route en de echte responsevelden", async () => {
  const schema = JSON.parse(readFileSync(new URL("../public/openapi/social-export.json", import.meta.url), "utf8"));
  const route = schema.paths["/api/v1/social/metrics"];
  assert.deepEqual(Object.keys(route), ["get"]);
  assert.equal(route.get["x-openai-isConsequential"], false);
  assert.equal(schema.components.securitySchemes.exportKey.scheme, "bearer");
  const body = await (await handleSocialMetricsExport(request(), fixture([row()]).deps)).json();
  assert.deepEqual(Object.keys(body).sort(), schema.components.schemas.ExportPage.required.sort());
  assert.deepEqual(Object.keys(body.data[0]).sort(), schema.components.schemas.Metric.required.sort());
});
