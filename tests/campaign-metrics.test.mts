import assert from "node:assert/strict";
import test from "node:test";
import { campaignMetricLabel, campaignMetricExportValue, summarizeCampaignMetric, campaignMetricSummaryLabel, campaignMetricCoverageLabel } from "../src/lib/campaign-metrics.ts";

test("een echte nul blijft gemeten, ontbrekende en ongeldige waarden worden geen nul", () => {
  for (const value of [0, "0"]) {
    assert.equal(campaignMetricLabel(value), "0");
    assert.equal(campaignMetricExportValue(value), 0);
  }
  for (const value of [null, undefined, "", "  ", "ongeldig", NaN, Infinity]) {
    assert.equal(campaignMetricLabel(value), "Ontbrekende meting");
    assert.equal(campaignMetricExportValue(value), "Ontbrekende meting");
  }
});

test("een lege selectie en een selectie zonder metingen blijven onderscheiden", () => {
  assert.equal(campaignMetricSummaryLabel(summarizeCampaignMetric([])), "Geen campagnes");
  const missing = summarizeCampaignMetric([null, undefined]);
  assert.deepEqual(missing, { value: null, measured: 0, missing: 2, total: 2 });
  assert.equal(campaignMetricSummaryLabel(missing), "Ontbrekende meting");
});

test("een gedeeltelijke som toont alleen bekende waarden met afzonderlijke dekking", () => {
  const summary = summarizeCampaignMetric([100, null, "0", 25, " "]);
  assert.deepEqual(summary, { value: 125, measured: 3, missing: 2, total: 5 });
  assert.equal(campaignMetricSummaryLabel(summary), "125 (gedeeltelijk)");
  assert.equal(campaignMetricCoverageLabel(summary), "3 van 5 campagnes gemeten · 2 ontbrekend");
});

test("volledig gemeten nullen blijven een volledig gemeten totaal van nul", () => {
  const summary = summarizeCampaignMetric([0, "0"]);
  assert.equal(campaignMetricSummaryLabel(summary), "0");
  assert.equal(summary.missing, 0);
  assert.equal(summary.measured, 2);
});
