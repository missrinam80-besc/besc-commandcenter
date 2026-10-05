import assert from "node:assert/strict";
import test from "node:test";
import { instagramInsightParameters, numericInsights, MetaApiError, isMetaPermissionError } from "../src/lib/meta-insights.ts";

test("Instagram-aanvraag bevat total_value en behoudt de periode", () => {
  const parameters = instagramInsightParameters(1759276800, 1761696000);
  assert.equal(parameters.get("metric_type"), "total_value");
  assert.equal(parameters.get("metric"), "reach,profile_views");
  assert.equal(parameters.get("period"), "day");
  assert.equal(parameters.get("since"), "1759276800");
  assert.equal(parameters.get("until"), "1761696000");
});

test("Instagram-periodetotalen worden verwerkt zonder dagelijkse values", () => {
  assert.deepEqual(numericInsights([
    { name: "reach", total_value: { value: 523 } },
    { name: "profile_views", total_value: { value: 41 } },
  ]), [{ metric: "reach", value: 523 }, { metric: "profile_views", value: 41 }]);
});

test("nul is een geldige meting en wordt niet vervangen of dubbel geteld", () => {
  assert.deepEqual(numericInsights([{ name: "profile_views", total_value: { value: 0 }, values: [{ value: 17 }] }]),
    [{ metric: "profile_views", value: 0 }]);
});

test("bestaande Facebook-dagwaarden blijven ondersteund", () => {
  assert.deepEqual(numericInsights([{ name: "page_post_engagements", values: [{ value: 5 }, { value: 7 }] }]),
    [{ metric: "page_post_engagements", value: 12 }]);
});

test("ontbrekende of niet-numerieke metingen worden geen kunstmatige nul", () => {
  assert.deepEqual(numericInsights([
    { name: "missing" }, { name: "empty", values: [] }, { name: "string", total_value: { value: "5" } },
    { name: "invalid", values: [{ value: NaN }, { value: Infinity }, { value: {} }] },
  ]), []);
});

test("parameterfout 100 krijgt geen rechtenadvies; rechtenfouten wel", () => {
  const error = new MetaApiError("metric_type=total_value is vereist", 100);
  assert.equal(error.code, 100);
  assert.equal(isMetaPermissionError(error.code), false);
  assert.equal(isMetaPermissionError(10), true);
  assert.equal(isMetaPermissionError(200), true);
  assert.equal(isMetaPermissionError(undefined), false);
  assert.equal(isMetaPermissionError(190), false);
});
