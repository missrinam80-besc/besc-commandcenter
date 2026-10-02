import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's test runner loads TypeScript source directly.
import { inspectMetaToken, metaPermissionSummary } from "../src/lib/meta-token-diagnostics.ts";

const config = { appId: "test-app", appSecret: "secret-not-for-ui", apiVersion: "v25.0" };
const required = ["instagram_basic", "instagram_manage_insights", "pages_read_engagement"];
function response(data: Record<string, unknown>): typeof fetch {
  return async () => Response.json({ data });
}

test("tokencontrole bewaart alleen werkelijk toegekende rechten", async () => {
  const result = await inspectMetaToken("private-token", config, required, response({
    is_valid: true, app_id: config.appId, type: "PAGE", scopes: ["instagram_basic", "instagram_basic", "pages_read_engagement"],
  }));
  assert.deepEqual(result.scopes, ["instagram_basic", "pages_read_engagement"]);
  assert.deepEqual(result.missingScopes, ["instagram_manage_insights"]);
  assert.match(metaPermissionSummary(result), /Tokentype: PAGE/);
  assert.match(metaPermissionSummary(result), /Ontbrekende tokenrechten: instagram_manage_insights/);
});

test("aanwezige scopes worden niet voorgesteld als bewezen Insights-toegang", async () => {
  const result = await inspectMetaToken("private-token", config, required, response({
    is_valid: true, app_id: config.appId, type: "USER", scopes: required,
  }));
  assert.deepEqual(result.missingScopes, []);
  assert.match(metaPermissionSummary(result), /bewijst nog geen toegang/);
});

test("ongeldig token en verkeerde app worden geweigerd", async () => {
  await assert.rejects(inspectMetaToken("private-token", config, required, response({ is_valid: false })), /ongeldig of verlopen/);
  await assert.rejects(inspectMetaToken("private-token", config, required, response({ is_valid: true, app_id: "other-app" })), /andere app/);
});

test("geen scopes in de response betekent geen toegekende rechten", async () => {
  const result = await inspectMetaToken("private-token", config, required, response({ is_valid: true, app_id: config.appId }));
  assert.deepEqual(result.scopes, []);
  assert.deepEqual(result.missingScopes, required);
  assert.equal(result.tokenType, "onbekend");
});

test("debug-aanvraag gebruikt app-authenticatie en geen caching", async () => {
  const request: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://graph.facebook.com");
    assert.equal(url.pathname, "/v25.0/debug_token");
    assert.equal(url.searchParams.get("input_token"), "private-token");
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer test-app|secret-not-for-ui");
    assert.equal(init?.cache, "no-store");
    return Response.json({ data: { is_valid: true, app_id: config.appId, scopes: required } });
  };
  await inspectMetaToken("private-token", config, required, request);
});

test("netwerk-, HTTP- en JSON-fouten lekken geen tokens", async () => {
  const requests: Array<typeof fetch> = [
    async () => { throw new Error("private-token secret-not-for-ui"); },
    async () => new Response("private-token secret-not-for-ui", { status: 403 }),
    async () => new Response("private-token secret-not-for-ui", { status: 200 }),
  ];
  for (const request of requests) {
    await assert.rejects(inspectMetaToken("private-token", config, required, request), (error: Error) => {
      assert.match(error.message, /niet beschikbaar/);
      assert.doesNotMatch(error.message, /private-token|secret-not-for-ui/);
      return true;
    });
  }
});
