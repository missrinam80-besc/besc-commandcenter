import assert from "node:assert/strict";
import test from "node:test";
import { compareFoundationEffects } from "../scripts/foundation/compare-effects.mjs";

function catalogue() {
  return { format: "besc-foundation-effects-v1", postgres_version: "17.6", read_only: "on", tables: [{ schema: "public", name: "proof", rls: true, grants: { anon: { select: false } } }], constraints: [], indexes: [], triggers: [], policies: [], enums: [], views: [], sequences: [], schema_usage: [],
    functions: [{ schema: "private", name: "review", arguments: "", language: "plpgsql", security_definer: false, body_md5: "reference" }],
    review_bodies: [{ schema: "private", name: "review", arguments: "", source: "begin return 'exact'; end;" }] };
}
test("effectvergelijking behoudt controles bij een zuiver opmaakverschil", () => {
  const reference = catalogue(), actual = structuredClone(reference);
  actual.functions[0].body_md5 = "formatted";
  actual.review_bodies[0].source = "BEGIN\n RETURN 'exact';\n END;";
  const result = compareFoundationEffects(reference, actual);
  assert.equal(result.schema_matches, true);
  assert.equal(result.formatting_only_functions.length, 1);
});
test("effectvergelijking weigert extra rechten, uitgeschakelde RLS en gewijzigde tekstwaarden", () => {
  for (const mutate of [
    (c: ReturnType<typeof catalogue>) => { c.tables[0].grants.anon.select = true; },
    (c: ReturnType<typeof catalogue>) => { c.tables[0].rls = false; },
    (c: ReturnType<typeof catalogue>) => { c.functions[0].body_md5 = "changed"; c.review_bodies[0].source = "begin return 'different'; end;"; },
    (c: ReturnType<typeof catalogue>) => { c.functions[0].security_definer = true; },
  ]) {
    const reference = catalogue(), actual = structuredClone(reference); mutate(actual);
    assert.equal(compareFoundationEffects(reference, actual).schema_matches, false);
  }
});
test("effectvergelijking accepteert geen ontbrekende groepen, andere PG-major of schrijfsnapshot", () => {
  const reference = catalogue();
  assert.throws(() => compareFoundationEffects(reference, { ...reference, sequences: undefined }));
  assert.throws(() => compareFoundationEffects(reference, { ...reference, postgres_version: "18.3" }));
  assert.throws(() => compareFoundationEffects(reference, { ...reference, read_only: "off" }));
  assert.throws(() => compareFoundationEffects(reference, { ...reference, tables: [...reference.tables, ...reference.tables] }));
});
