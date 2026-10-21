import { sameSqlForReview } from "./sql-review.mjs";

const stable = (value) => JSON.stringify(value, (_, v) => v && !Array.isArray(v) && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);
const definitions = {
  tables: ["schema", "name"], constraints: ["schema", "table", "name"], indexes: ["schema", "name"],
  triggers: ["schema", "table", "name"], policies: ["schema", "table", "name"], enums: ["schema", "name"],
  functions: ["schema", "name", "arguments"], views: ["schema", "name"], sequences: ["schema", "name"], schema_usage: ["schema"],
};
export function compareFoundationEffects(reference, actual) {
  if (reference.format !== "besc-foundation-effects-v1" || actual.format !== reference.format || reference.read_only !== "on" || actual.read_only !== "on") throw Error("Requires recognizable read-only catalogues");
  if (reference.postgres_version.split(".")[0] !== actual.postgres_version.split(".")[0]) throw Error("Compare native catalogues from the same PostgreSQL major version");
  const key = (row, keys) => keys.map((field) => row[field]).join("|");
  const refBodies = new Map((reference.review_bodies ?? []).map((row) => [key(row, definitions.functions), row.source]));
  const actBodies = new Map((actual.review_bodies ?? []).map((row) => [key(row, definitions.functions), row.source]));
  const differences = [], formatting = [], groups = {};
  for (const [group, keys] of Object.entries(definitions)) {
    if (!Array.isArray(reference[group]) || !Array.isArray(actual[group])) throw Error(`Missing catalogue group ${group}`);
    const left = new Map(reference[group].map((row) => [key(row, keys), row]));
    const right = new Map(actual[group].map((row) => [key(row, keys), row]));
    if (left.size !== reference[group].length || right.size !== actual[group].length) throw Error(`Duplicate catalogue identity in ${group}`);
    let matched = 0;
    for (const id of [...new Set([...left.keys(), ...right.keys()])].sort()) {
      const a = left.get(id), b = right.get(id);
      if (!a || !b) { differences.push({ group, id, reason: a ? "missing_in_actual" : "extra_in_actual" }); continue; }
      const fields = [];
      for (const field of [...new Set([...Object.keys(a), ...Object.keys(b)])]) {
        if (stable(a[field]) === stable(b[field])) continue;
        if (["using", "check", "definition"].includes(field) && typeof a[field] === "string" && typeof b[field] === "string" && sameSqlForReview(a[field], b[field])) continue;
        if (group === "functions" && field === "body_md5" && refBodies.has(id) && actBodies.has(id) && sameSqlForReview(refBodies.get(id), actBodies.get(id), { plpgsqlFinalSemicolon: a.language === "plpgsql" })) {
          formatting.push({ id, reference_md5: a.body_md5, actual_md5: b.body_md5, review: "lexical_match_preserving_quoted_values" }); continue;
        }
        fields.push(field);
      }
      if (fields.length) differences.push({ group, id, fields }); else matched++;
    }
    groups[group] = { reference: left.size, actual: right.size, matched };
  }
  return { format: "besc-foundation-effects-comparison-v1", checked_at_utc: new Date().toISOString(), cloud_checked_at_utc: actual.checked_at_utc, groups, formatting_only_functions: formatting, differences,
    schema_matches: !differences.length,
    scope: "Schema structure, effective privileges for anon/authenticated/service_role and selected function lexical review. Not historical execution proof, business-data equality, platform-service acceptance or write authorization." };
}
